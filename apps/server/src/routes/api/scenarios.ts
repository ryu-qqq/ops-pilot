import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetSchema, expectationSchema, scenarioSchema } from "@opspilot/shared-types";
import { assetExists } from "../../domains/registry/repository.js";
import {
  createScenario,
  deleteScenario,
  getScenario,
  listScenariosByAssetWithCounts,
  updateScenario,
} from "../../domains/scenario/repository.js";

const createBody = z.object({
  assetId: assetSchema.shape.id,
  name: z.string().min(1),
  description: z.string().nullable().default(null),
  input: z.string().min(1),
  expectation: expectationSchema.default({}),
});
const updateBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  input: z.string().min(1).optional(),
  expectation: expectationSchema.optional(),
});
const scenarioWithCountsSchema = scenarioSchema.extend({
  runCount: z.number().int().nonnegative(),
});
const errorSchema = z.object({ error: z.string(), detail: z.string() });

const scenarios: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/scenarios",
    { schema: { body: createBody, response: { 200: scenarioSchema, 400: errorSchema } } },
    async (req, reply) => {
      if (!assetExists(req.body.assetId)) {
        return reply.status(400).send({ error: "BadRequest", detail: "asset not found" });
      }
      return createScenario(req.body);
    },
  );

  fastify.get(
    "/scenarios/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: scenarioSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const sc = getScenario(req.params.id);
      if (!sc) return reply.status(404).send({ error: "NotFound", detail: "scenario not found" });
      return sc;
    },
  );

  // OPSP-34: 자산별 시나리오 목록 + 사용 횟수(run count) — N+1 회피.
  // 기존 /api/registry/assets/:id/scenarios 와 분리(이쪽은 *관리*용, 본문·count 포함).
  fastify.get(
    "/scenarios",
    {
      schema: {
        querystring: z.object({ assetId: z.string().uuid() }),
        response: { 200: z.object({ scenarios: z.array(scenarioWithCountsSchema) }) },
      },
    },
    async (req) => ({ scenarios: listScenariosByAssetWithCounts(req.query.assetId) }),
  );

  // OPSP-34: 시나리오 부분 update. immutable 깨짐 경고는 UI 책임.
  fastify.patch(
    "/scenarios/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateBody,
        response: { 200: scenarioSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const updated = updateScenario(req.params.id, req.body);
      if (!updated) return reply.status(404).send({ error: "NotFound", detail: "scenario not found" });
      return updated;
    },
  );

  // OPSP-34: 시나리오 삭제 — ON DELETE CASCADE 로 run·trace·score 자연 삭제.
  fastify.delete(
    "/scenarios/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ deletedRuns: z.number().int().nonnegative() }),
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const result = deleteScenario(req.params.id);
      if (!result) return reply.status(404).send({ error: "NotFound", detail: "scenario not found" });
      return result;
    },
  );
};

export default scenarios;
