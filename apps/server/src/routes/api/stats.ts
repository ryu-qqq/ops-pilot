// OPSP-35: 관측 대시보드 집계 endpoint.
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { computeOverview } from "../../domains/stats/repository.js";

const recentRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  assetName: z.string(),
  assetKind: z.string(),
  scenarioName: z.string(),
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  costUsd: z.number().nullable(),
});

const overviewSchema = z.object({
  assets: z.object({
    agent: z.number().int().nonnegative(),
    skill: z.number().int().nonnegative(),
    command: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  scenarios: z.number().int().nonnegative(),
  runs: z.object({
    total: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  passRate: z.number().min(0).max(1),
  averages: z.object({
    promptTokens: z.number().nullable(),
    completionTokens: z.number().nullable(),
    costUsd: z.number().nullable(),
    durationMs: z.number().nullable(),
  }),
  recentRuns: z.array(recentRunSchema),
  runningRuns: z.array(recentRunSchema),
  runningAnalyses: z.number().int().nonnegative(),
});

const stats: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/stats/overview",
    {
      schema: {
        // OPSP-47: 기간 필터 — 미지정 시 전체.
        querystring: z.object({ period: z.enum(["7d", "30d", "all"]).default("all") }),
        response: { 200: overviewSchema },
      },
    },
    async (req) => computeOverview(req.query.period),
  );
};

export default stats;
