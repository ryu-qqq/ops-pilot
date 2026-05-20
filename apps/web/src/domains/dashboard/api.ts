// OPSP-35: 관측 대시보드 데이터.
import { z } from "zod";
import { apiGet } from "../../lib/api-client";

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
export type DashboardRun = z.infer<typeof recentRunSchema>;

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
});
export type StatsOverview = z.infer<typeof overviewSchema>;

export const dashboardKeys = {
  all: ["dashboard"] as const,
  overview: () => [...dashboardKeys.all, "overview"] as const,
};

export async function getStatsOverview() {
  return apiGet("/api/stats/overview", overviewSchema);
}
