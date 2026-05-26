import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetKindSchema, assetSchema, projectSchema } from "@opspilot/shared-types";
import { AuthoringError, writeAsset } from "../../domains/authoring/service.js";
import { installHooks } from "../../domains/authoring/hooks.js";
import {
  createProject,
  getProject,
  getProjectByClonePath,
  listProjects,
} from "../../domains/project/repository.js";
import {
  cloneProject,
  defaultNameFromPath,
  linkLocalProject,
  normalizeGitUrl,
  ProjectCloneError,
  ProjectLinkError,
  pullProject,
  slugFromUrl,
} from "../../domains/project/service.js";
import { scanRepo } from "../../domains/registry/scanner.js";
import { listAssets, saveScan } from "../../domains/registry/repository.js";
import {
  AgentCrewSyncError,
  checkAgentCrewDrift,
  syncAgentCrewForProject,
} from "../../domains/agent-crew/service.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const createLinkedProjectBody = z.object({
  mode: z.literal("linked"),
  localPath: z.string().min(1),
  gitUrl: z.string().min(1).optional(),
  name: z.string().optional(),
});

const createManagedProjectBody = z.object({
  mode: z.literal("managed"),
  gitUrl: z.string().min(1),
  name: z.string().optional(),
});

// mode 생략 + gitUrl 만 → managed (v1 호환).
const createLegacyProjectBody = z.object({
  gitUrl: z.string().min(1),
  name: z.string().optional(),
});

const createProjectBodySchema = z.union([
  createLinkedProjectBody,
  createManagedProjectBody,
  createLegacyProjectBody,
]);

function isRegisteredGitUrl(gitUrl: string): boolean {
  const norm = normalizeGitUrl(gitUrl);
  return listProjects().some((p) => normalizeGitUrl(p.gitUrl) === norm);
}

const projects: FastifyPluginAsyncZod = async (fastify) => {
  // 프로젝트 등록 — linked(로컬 경로) | managed(git clone)
  fastify.post(
    "/projects",
    {
      schema: {
        body: createProjectBodySchema,
        response: { 200: projectSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      const body = req.body;

      if ("localPath" in body) {
        try {
          const linked = linkLocalProject({
            localPath: body.localPath,
            gitUrl: body.gitUrl,
          });
          if (getProjectByClonePath(linked.clonePath)) {
            return reply.status(400).send({
              error: "Duplicate",
              detail: `이미 등록된 로컬 경로: ${linked.clonePath}`,
            });
          }
          if (isRegisteredGitUrl(linked.gitUrl)) {
            return reply.status(400).send({
              error: "Duplicate",
              detail: "이미 등록된 git URL",
            });
          }
          return createProject({
            name: body.name ?? defaultNameFromPath(linked.clonePath),
            gitUrl: linked.gitUrl,
            clonePath: linked.clonePath,
            defaultBranch: linked.defaultBranch,
            workspaceMode: "linked",
            remoteVerified: linked.remoteVerified,
          });
        } catch (e) {
          if (e instanceof ProjectLinkError) {
            return reply.status(400).send({ error: "LinkError", detail: e.message });
          }
          throw e;
        }
      }

      const { gitUrl } = body;
      if (isRegisteredGitUrl(gitUrl)) {
        return reply.status(400).send({ error: "Duplicate", detail: "이미 등록된 git URL" });
      }
      try {
        const { clonePath, defaultBranch } = cloneProject(gitUrl);
        return createProject({
          name: body.name ?? slugFromUrl(gitUrl),
          gitUrl,
          clonePath,
          defaultBranch,
          workspaceMode: "managed",
        });
      } catch (e) {
        if (e instanceof ProjectCloneError) {
          return reply.status(400).send({ error: "CloneError", detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.get(
    "/projects",
    { schema: { response: { 200: z.object({ projects: z.array(projectSchema) }) } } },
    async () => ({ projects: listProjects() }),
  );

  // pull → .claude 스캔 → 프로젝트 스코프로 적재
  fastify.post(
    "/projects/:id/scan",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            scannedAssets: z.number().int(),
            scannedVersions: z.number().int(),
            saved: z.object({ assets: z.number().int(), versions: z.number().int() }),
            agentCrewDrift: z.object({
              drift: z.boolean(),
              lockTag: z.string().nullable(),
              lockCommit: z.string().nullable(),
              projectYamlTag: z.string().nullable(),
            }),
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.params.id);
      if (!project) return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      pullProject(project.clonePath);
      let scanned;
      try {
        scanned = scanRepo(project.clonePath);
      } catch (e) {
        return reply.status(400).send({ error: "ScanError", detail: (e as Error).message });
      }
      const saved = saveScan(project.id, scanned);
      const agentCrewDrift = checkAgentCrewDrift(project);
      return {
        scannedAssets: scanned.length,
        scannedVersions: scanned.reduce((n, a) => n + a.versions.length, 0),
        saved,
        agentCrewDrift,
      };
    },
  );

  fastify.post(
    "/projects/:id/sync-agent-crew",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            tag: z.string().regex(/^v\d+\.\d+\.\d+$/).optional(),
            scan: z.boolean().default(true),
          })
          .default({ scan: true }),
        response: {
          200: z.object({
            sync: z.object({
              tag: z.string(),
              commit: z.string(),
              source: z.string(),
              crewRepoPath: z.string(),
              copiedDirs: z.array(z.string()),
              lockPath: z.string(),
              missingFeedbackAgents: z.array(z.string()),
            }),
            driftBefore: z.object({
              drift: z.boolean(),
              lockTag: z.string().nullable(),
              lockCommit: z.string().nullable(),
              projectYamlTag: z.string().nullable(),
            }),
            scan: z
              .object({
                scannedAssets: z.number().int(),
                scannedVersions: z.number().int(),
                saved: z.object({ assets: z.number().int(), versions: z.number().int() }),
              })
              .optional(),
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.params.id);
      if (!project) return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      try {
        return syncAgentCrewForProject(project, { tag: req.body.tag, scan: req.body.scan });
      } catch (e) {
        if (e instanceof AgentCrewSyncError) {
          return reply.status(400).send({ error: "AgentCrewSyncError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-19: OpsPilot 통한 저작 → 클론 .claude 쓰기 + 강제 구조화 커밋(=버전)
  fastify.post(
    "/projects/:id/assets",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          kind: assetKindSchema,
          name: z.string().min(1),
          content: z.string().min(1),
          changeSummary: z.string().min(1),
          rationale: z.string().default(""),
        }),
        response: {
          200: z.object({
            committed: z.string(),
            scanned: z.object({ assets: z.number().int(), versions: z.number().int() }),
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.params.id);
      if (!project) return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      try {
        return writeAsset(project, req.body);
      } catch (e) {
        if (e instanceof AuthoringError) {
          return reply.status(400).send({ error: "AuthoringError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // OPSP-19 잔여: 자동 버전 강제 훅 설치 (Claude Code PostToolUse + git post-commit)
  fastify.post(
    "/projects/:id/install-hooks",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            settingsMerged: z.boolean(),
            scriptPath: z.string(),
            gitHookPath: z.string(),
            committed: z.string().nullable(),
          }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.params.id);
      if (!project) return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      return installHooks(project);
    },
  );

  fastify.get(
    "/projects/:id/assets",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ assets: z.array(assetSchema) }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!getProject(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      }
      return { assets: listAssets(req.params.id) };
    },
  );
};

export default projects;
