import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { claudeAssetKindSchema, assetSchema, cursorHarnessSyncResultSchema, projectSchema } from "@opspilot/shared-types";
import { AuthoringError, writeAsset } from "../../domains/authoring/service.js";
import { installHooks } from "../../domains/authoring/hooks.js";
import {
  getProject,
  listProjects,
} from "../../domains/project/repository.js";
import {
  ProjectRegisterError,
  registerProject,
} from "../../domains/project/register.js";
import { pullProject } from "../../domains/project/service.js";
import { scanRepo } from "../../domains/registry/scanner.js";
import { listAssets, saveScan } from "../../domains/registry/repository.js";
import {
  AgentCrewSyncError,
  checkAgentCrewDrift,
  syncAgentCrewForProject,
} from "../../domains/agent-crew/service.js";
import {
  HarnessBridgeSyncError,
  syncCursorHarnessForProject,
} from "../../domains/harness-bridge/service.js";

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
      try {
        if ("localPath" in body) {
          return registerProject({
            mode: "linked",
            localPath: body.localPath,
            gitUrl: body.gitUrl,
            name: body.name,
          });
        }
        return registerProject({
          mode: "managed",
          gitUrl: body.gitUrl,
          name: body.name,
        });
      } catch (e) {
        if (e instanceof ProjectRegisterError) {
          return reply.status(400).send({ error: e.code, detail: e.message });
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
              tagSource: z.enum(["override", "project-yaml-newer", "lock"]),
              mustReference: z.object({
                applied: z.boolean(),
                items: z.array(z.string()),
                targets: z.array(
                  z.object({
                    ide: z.enum(["claude-code", "cursor"]),
                    targetPath: z.string(),
                    action: z.enum(["injected", "replaced", "removed"]),
                  }),
                ),
                reason: z.string().optional(),
              }),
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

  fastify.post(
    "/projects/:id/sync-cursor-harness",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            dryRun: z.boolean().default(false),
            commit: z.boolean().default(true),
          })
          .default({ dryRun: false, commit: true }),
        response: {
          200: cursorHarnessSyncResultSchema.extend({
            plan: z
              .array(
                z.object({
                  relPath: z.string(),
                  action: z.enum(["create", "update", "unchanged"]),
                  sourcePath: z.string(),
                }),
              )
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
        return syncCursorHarnessForProject(project, {
          dryRun: req.body.dryRun,
          commit: req.body.commit,
        });
      } catch (e) {
        if (e instanceof HarnessBridgeSyncError) {
          return reply.status(400).send({ error: "HarnessBridgeSyncError", detail: e.message });
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
          kind: claudeAssetKindSchema,
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
