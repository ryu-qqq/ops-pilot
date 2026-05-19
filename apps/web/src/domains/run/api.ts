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
  scenarioId: z.string().uuid(),
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
  detail: (runId: string) => [...runKeys.all, "detail", runId] as const,
  trace: (runId: string) => [...runKeys.all, "trace", runId] as const,
};

export const scenarioKeys = {
  all: ["scenarios"] as const,
  detail: (id: string) => [...scenarioKeys.all, "detail", id] as const,
};

export async function getRuns() {
  return (await apiGet("/api/runs", runsResponse)).runs;
}

export async function getRun(runId: string) {
  return apiGet(`/api/runs/${runId}`, runSchema);
}

export async function getRunTrace(runId: string) {
  return (await apiGet(`/api/runs/${runId}/trace`, traceResponse)).trace;
}

export async function getScenario(id: string) {
  return apiGet(`/api/scenarios/${id}`, scenarioSchema);
}

// 시나리오 구체화: 목적/입력/기대 동작/성공조건 → description + expectation 매핑.
export interface LaunchInput {
  assetId: string;
  assetVersionId: string;
  cwd: string;
  source: "fixture" | "local-claude";
  name: string;
  purpose: string; // 왜 — description
  input: string; // 에이전트에 줄 입력
  expectedBehavior: string; // 기대 동작 — expectation.judge
  successCriteria: string[]; // 성공조건 — expectation.assertions
}

// 시나리오 생성 → 그 시나리오로 run 실행 (E2E 한 흐름).
export async function launchRun(v: LaunchInput) {
  const scenario = await apiPost(
    "/api/scenarios",
    {
      assetId: v.assetId,
      name: v.name,
      description: v.purpose.trim() === "" ? null : v.purpose,
      input: v.input,
      expectation: {
        judge: v.expectedBehavior.trim() === "" ? undefined : v.expectedBehavior,
        assertions: v.successCriteria.length > 0 ? v.successCriteria : undefined,
      },
    },
    scenarioSchema,
  );
  return apiPost(
    "/api/runs",
    { assetVersionId: v.assetVersionId, scenarioId: scenario.id, cwd: v.cwd, source: v.source },
    runSchema,
  );
}
