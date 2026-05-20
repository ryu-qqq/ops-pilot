import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetVersionSchema, scenarioSchema } from "@opspilot/shared-types";
import { assetExists, latestContent, listVersions } from "../../domains/registry/repository.js";
import { listScenariosByAsset } from "../../domains/scenario/repository.js";

const versionSummarySchema = assetVersionSchema.omit({ content: true });
const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 자산 버전 조회만 유지 (등록·스캔·목록은 프로젝트 스코프로 projects.ts 로 이동).
const registry: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/registry/assets/:id/versions",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ versions: z.array(versionSummarySchema) }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "asset not found" });
      }
      return { versions: listVersions(req.params.id) };
    },
  );

  // OPSP-9: 자산별 시나리오 목록(회귀 셋 모드용).
  fastify.get(
    "/registry/assets/:id/scenarios",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ scenarios: z.array(scenarioSchema) }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!assetExists(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "asset not found" });
      }
      return { scenarios: listScenariosByAsset(req.params.id) };
    },
  );

  // 수정 prefill — 최신 버전 본문
  fastify.get(
    "/registry/assets/:id/content",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ content: z.string() }), 404: errorSchema },
      },
    },
    async (req, reply) => {
      const content = latestContent(req.params.id);
      if (content === undefined) {
        return reply.status(404).send({ error: "NotFound", detail: "content not found" });
      }
      return { content };
    },
  );
};

export default registry;
