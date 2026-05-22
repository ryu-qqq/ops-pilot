import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetVersionSchema, scenarioSchema } from "@opspilot/shared-types";
import { assetExists, latestContent, listVersions } from "../../domains/registry/repository.js";
import { listScenariosByAsset } from "../../domains/scenario/repository.js";
import { AuthoringError, adoptVersion } from "../../domains/authoring/service.js";

const versionSummarySchema = assetVersionSchema.omit({ content: true });
const errorSchema = z.object({ error: z.string(), detail: z.string() });

// 자산 버전 조회 + OPSP-45 버전 채택 (등록·스캔·목록은 프로젝트 스코프로 projects.ts).
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
            scanned: z.object({ assets: z.number().int(), versions: z.number().int() }),
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
          return reply.status(400).send({ error: "AuthoringError", detail: e.message });
        }
        throw e;
      }
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
