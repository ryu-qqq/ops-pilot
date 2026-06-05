import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  assetGraphSchema,
  assetLintResultSchema,
  assetVersionContentSchema,
  assetVersionSchema,
  scenarioSchema,
} from "@opspilot/shared-types";
import {
  parseFrontmatterDescription,
  stripFrontmatter,
  validateFrontmatter,
} from "../../domains/asset-lint/validate.js";
import {
  getAsset,
  assetExists,
  latestContent,
  listVersions,
  versionContent,
} from "../../domains/registry/repository.js";
import { buildAssetGraph } from "../../domains/registry/graph.js";
import { getProject } from "../../domains/project/repository.js";
import { listScenariosByAsset } from "../../domains/scenario/repository.js";
import {
  AuthoringError,
  adoptVersion,
  deleteAsset,
} from "../../domains/authoring/service.js";

const versionSummarySchema = assetVersionSchema.omit({ content: true });
const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 자산 버전 조회 + OPSP-45 버전 채택 (등록·스캔·목록은 프로젝트 스코프로 projects.ts).
const registry: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/registry/assets/:id/versions",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ versions: z.array(versionSummarySchema) }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "asset not found" });
      }
      return { versions: listVersions(req.params.id) };
    },
  );

  // 특정 버전의 마크다운 본문(상세 본문 뷰용) — frontmatter 제외.
  fastify.get(
    "/registry/assets/:id/versions/:versionId/content",
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
          versionId: z.string().uuid(),
        }),
        response: { 200: assetVersionContentSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const raw = versionContent(req.params.versionId);
      if (raw === undefined)
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "version not found" });
      return { content: stripFrontmatter(raw) };
    },
  );

  // T4-c: frontmatter 검증 게이트 — 자산 최신 버전의 frontmatter lint.
  fastify.get(
    "/registry/assets/:id/lint",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: assetLintResultSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const asset = getAsset(req.params.id);
      if (!asset)
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "asset not found" });
      const content = latestContent(req.params.id) ?? "";
      return {
        ...validateFrontmatter(asset.kind, content),
        description: parseFrontmatterDescription(content),
      };
    },
  );

  // OPSP-9: 자산별 시나리오 목록(회귀 셋 모드용).
  fastify.get(
    "/registry/assets/:id/scenarios",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ scenarios: z.array(scenarioSchema) }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "asset not found" });
      }
      return { scenarios: listScenariosByAsset(req.params.id) };
    },
  );

  // OPSP-45: 비교/벤치마크에서 고른 버전을 자산의 현재 최신으로 채택(앞으로 감기).
  fastify.post(
    "/registry/asset-versions/:id/adopt",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ note: z.string().default("") }),
        response: {
          200: z.object({
            committed: z.string(),
            scanned: z.object({
              assets: z.number().int(),
              versions: z.number().int(),
            }),
          }),
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        return adoptVersion(req.params.id, req.body.note);
      } catch (e) {
        if (e instanceof AuthoringError) {
          return reply
            .status(400)
            .send({ error: "AuthoringError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // 카드 C(prune): 미사용 project-local 자산 삭제 — 클론 .claude 제거 + 구조화 커밋 + DB 행 제거.
  // crew/unknown·파생 하네스는 service 가드에서 차단(AuthoringError → 400).
  fastify.post(
    "/registry/assets/:id/prune",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ rationale: z.string() }),
        response: {
          200: z.object({
            committed: z.string(),
            deleted: z.literal(true),
          }),
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "asset not found" });
      }
      try {
        const { committed } = deleteAsset(req.params.id, req.body.rationale);
        return { committed, deleted: true as const };
      } catch (e) {
        if (e instanceof AuthoringError) {
          return reply
            .status(400)
            .send({ error: "AuthoringError", detail: e.message });
        }
        throw e;
      }
    },
  );

  // 자산 관계(참조) 그래프 — 프론트가 트리·고아·다대다·상태(🟢/🟡/🔴) 계산에 사용.
  // 휴리스틱 매칭(본문 단어경계 정확일치) — 한계는 domains/registry/graph.ts 주석 참조.
  // 상태 롤업은 백엔드가 하지 않는다(프론트가 lint+usage+graph 로 무상 계산).
  fastify.get(
    "/registry/asset-graph",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: { 200: assetGraphSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!getProject(req.query.projectId)) {
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "project not found" });
      }
      return buildAssetGraph(req.query.projectId);
    },
  );

};

export default registry;
