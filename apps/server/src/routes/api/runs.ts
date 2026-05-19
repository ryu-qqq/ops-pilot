import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runSchema } from "@opspilot/shared-types";
import { executeRun, RunInputError } from "../../domains/run/service.js";
import { fixtureSource, localClaudeSource } from "../../domains/run/source.js";
import { getRun, listRuns, listTrace } from "../../domains/run/repository.js";

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
        source === "fixture" ? fixtureSource(fixtureEvents ?? []) : localClaudeSource();
      try {
        return await executeRun({ assetVersionId, scenarioId, cwd, source: runnerSource });
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
};

export default runs;
