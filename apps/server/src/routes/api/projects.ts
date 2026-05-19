import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetKindSchema, assetSchema, projectSchema } from "@opspilot/shared-types";
import { AuthoringError, writeAsset } from "../../domains/authoring/service.js";
import { installHooks } from "../../domains/authoring/hooks.js";
import {
  createProject,
  getProject,
  getProjectByUrl,
  listProjects,
} from "../../domains/project/repository.js";
import { cloneProject, ProjectCloneError, pullProject, slugFromUrl } from "../../domains/project/service.js";
import { scanRepo } from "../../domains/registry/scanner.js";
import { listAssets, saveScan } from "../../domains/registry/repository.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const projects: FastifyPluginAsyncZod = async (fastify) => {
  // 프로젝트 등록 = git URL 클론
  fastify.post(
    "/projects",
    {
      schema: {
        body: z.object({ gitUrl: z.string().min(1), name: z.string().optional() }),
        response: { 200: projectSchema, 400: errorSchema },
      },
    },
    async (req, reply) => {
      const { gitUrl } = req.body;
      if (getProjectByUrl(gitUrl)) {
        return reply.status(400).send({ error: "Duplicate", detail: "이미 등록된 git URL" });
      }
      try {
        const { clonePath, defaultBranch } = cloneProject(gitUrl);
        return createProject({
          name: req.body.name ?? slugFromUrl(gitUrl),
          gitUrl,
          clonePath,
          defaultBranch,
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
      return {
        scannedAssets: scanned.length,
        scannedVersions: scanned.reduce((n, a) => n + a.versions.length, 0),
        saved,
      };
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
