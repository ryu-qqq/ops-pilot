import { z } from "zod";
import { runSchema, scenarioSchema, traceEventTypeSchema } from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

export const runListItemSchema = z.object({
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
export type RunListItem = z.infer<typeof runListItemSchema>;

export const traceEventViewSchema = z.object({
  seq: z.number().int(),
  type: traceEventTypeSchema.or(z.string()),
  name: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
});
export type TraceEventView = z.infer<typeof traceEventViewSchema>;

const runsResponse = z.object({ runs: z.array(runListItemSchema) });
const traceResponse = z.object({ trace: z.array(traceEventViewSchema) });

// Query Key Factory (CONVENTIONS.md 2).
export const runKeys = {
  all: ["runs"] as const,
  list: () => [...runKeys.all, "list"] as const,
  trace: (runId: string) => [...runKeys.all, "trace", runId] as const,
};

export async function getRuns() {
  return (await apiGet("/api/runs", runsResponse)).runs;
}

export async function getRunTrace(runId: string) {
  return (await apiGet(`/api/runs/${runId}/trace`, traceResponse)).trace;
}

export interface LaunchInput {
  assetId: string;
  assetVersionId: string;
  name: string;
  input: string;
  cwd: string;
  source: "fixture" | "local-claude";
}

// 시나리오 생성 → 그 시나리오로 run 실행 (E2E 한 흐름).
export async function launchRun(v: LaunchInput) {
  const scenario = await apiPost(
    "/api/scenarios",
    { assetId: v.assetId, name: v.name, description: null, input: v.input, expectation: {} },
    scenarioSchema,
  );
  return apiPost(
    "/api/runs",
    { assetVersionId: v.assetVersionId, scenarioId: scenario.id, cwd: v.cwd, source: v.source },
    runSchema,
  );
}
