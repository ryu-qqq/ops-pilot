import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runSchema, scoreSchema, scorerSchema } from "@opspilot/shared-types";
import { RunInputError, startRun } from "../../domains/run/service.js";
import { DEMO_FIXTURE, fixtureSource, localClaudeSource } from "../../domains/run/source.js";
import { getRun, listRuns, listTrace } from "../../domains/run/repository.js";
import { createScore, listScores } from "../../domains/score/repository.js";

const errorSchema = z.object({ error: z.string(), detail: z.string() });

const runBody = z.object({
  assetVersionId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  cwd: z.string().min(1),
  source: z.enum(["fixture", "local-claude"]).default("local-claude"),
  fixtureEvents: z.array(z.unknown()).optional(), // source=fixture 일 때 재생할 이벤트
});

const runListItem = z.object({
  id: z.string().uuid(),
  status: z.string(),
  runner: z.string(),
  createdAt: z.string(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  scenarioId: z.string().uuid(),
  scenarioName: z.string(),
  assetName: z.string(),
  assetKind: z.string(),
  gitCommit: z.string(),
});

const traceResponse = z.object({
  trace: z.array(
    z.object({
      seq: z.number().int(),
      type: z.string(),
      name: z.string().nullable(),
      input: z.unknown(),
      output: z.unknown(),
    }),
  ),
});

const runs: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/runs",
    { schema: { body: runBody, response: { 200: runSchema, 400: errorSchema } } },
    async (req, reply) => {
      const { assetVersionId, scenarioId, cwd, source, fixtureEvents } = req.body;
      const runnerSource =
        source === "fixture"
          ? fixtureSource(fixtureEvents ?? DEMO_FIXTURE)
          : localClaudeSource();
      try {
        // 즉시 반환(status=running). 실제 실행은 백그라운드 → 클라가 폴링.
        return startRun({ assetVersionId, scenarioId, cwd, source: runnerSource });
      } catch (e) {
        if (e instanceof RunInputError) {
          return reply.status(400).send({ error: "BadRequest", detail: e.message });
        }
        throw e;
      }
    },
  );

  fastify.get(
    "/runs",
    { schema: { response: { 200: z.object({ runs: z.array(runListItem) }) } } },
    async () => ({ runs: listRuns() }),
  );

  fastify.get(
    "/runs/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: runSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const run = getRun(req.params.id);
      if (!run) return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      return run;
    },
  );

  fastify.get(
    "/runs/:id/trace",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: traceResponse },
      },
    },
    async (req) => ({ trace: listTrace(req.params.id) }),
  );

  // 사람(또는 기타) 스코어링 (OPSP-17). 한 run 에 여러 score 가능.
  const scoreBody = z.object({
    scorer: scorerSchema.default("human"),
    passed: z.boolean(),
    score: z.number().min(0).max(1).nullable().default(null),
    reason: z.string().nullable().default(null),
  });

  fastify.get(
    "/runs/:id/scores",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ scores: z.array(scoreSchema) }) },
      },
    },
    async (req) => ({ scores: listScores(req.params.id) }),
  );

  fastify.post(
    "/runs/:id/scores",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: scoreBody,
        response: { 200: scoreSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      if (!getRun(req.params.id)) {
        return reply.status(404).send({ error: "NotFound", detail: "run not found" });
      }
      return createScore({ runId: req.params.id, ...req.body });
    },
  );
};

export default runs;
