import { z } from "zod";
import {
  benchmarkAggregateSchema,
  runDiffFileSchema,
  runSchema,
  scenarioSchema,
  scoreSchema,
  traceEventTypeSchema,
  type expectationSchema,
} from "@opspilot/shared-types";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api-client";

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
  scores: (runId: string) => [...runKeys.all, "scores", runId] as const,
  diff: (runId: string) => [...runKeys.all, "diff", runId] as const,
  compare: (ids: string[]) => [...runKeys.all, "compare", [...ids].sort().join(",")] as const,
  benchmark: (ids: string[]) => [...runKeys.all, "benchmark", [...ids].sort().join(",")] as const,
  analysis: (runId: string) => [...runKeys.all, "analysis", runId] as const,
};

const diffResponse = z.object({ files: z.array(runDiffFileSchema) });
export type RunDiffFileView = z.infer<typeof runDiffFileSchema>;

export async function getRunDiff(runId: string) {
  return (await apiGet(`/api/runs/${runId}/diff`, diffResponse)).files;
}

export const scenarioKeys = {
  all: ["scenarios"] as const,
  detail: (id: string) => [...scenarioKeys.all, "detail", id] as const,
  forAsset: (assetId: string) => [...scenarioKeys.all, "for-asset", assetId] as const,
};

export async function getRuns() {
  return (await apiGet("/api/runs", runsResponse)).runs;
}

export async function getRun(runId: string) {
  return apiGet(`/api/runs/${runId}`, runSchema);
}

// OPSP-46: run 회고 메모 갱신 (빈 문자열이면 메모 삭제).
export async function setRunRetro(runId: string, retro: string) {
  return apiPatch(`/api/runs/${runId}/retro`, { retro }, runSchema);
}

export async function getRunTrace(runId: string) {
  return (await apiGet(`/api/runs/${runId}/trace`, traceResponse)).trace;
}

export async function getScenario(id: string) {
  return apiGet(`/api/scenarios/${id}`, scenarioSchema);
}

// OPSP-34: 자산별 시나리오 관리 목록 (본문 + 사용 횟수). 회귀/벤치마크의 select 와는 별개 흐름.
const scenarioWithCountsSchema = scenarioSchema.extend({
  runCount: z.number().int().nonnegative(),
});
export type ScenarioWithCounts = z.infer<typeof scenarioWithCountsSchema>;
const scenariosForAssetResponse = z.object({ scenarios: z.array(scenarioWithCountsSchema) });
export async function getScenariosForAsset(assetId: string) {
  return (await apiGet(`/api/scenarios?assetId=${assetId}`, scenariosForAssetResponse)).scenarios;
}

// OPSP-34: 시나리오 부분 update (immutable 깨짐 경고는 UI 책임).
export interface UpdateScenarioInput {
  name?: string;
  description?: string | null;
  input?: string;
  expectation?: z.infer<typeof expectationSchema>;
}
export async function updateScenario(id: string, patch: UpdateScenarioInput) {
  return apiPatch(`/api/scenarios/${id}`, patch, scenarioSchema);
}

// OPSP-34: 시나리오 삭제 (cascade — run/trace/score 동반 삭제).
const deleteScenarioResponse = z.object({ deletedRuns: z.number().int().nonnegative() });
export async function deleteScenario(id: string) {
  return apiDelete(`/api/scenarios/${id}`, deleteScenarioResponse);
}

const scoresResponse = z.object({ scores: z.array(scoreSchema) });

export async function getScores(runId: string) {
  return (await apiGet(`/api/runs/${runId}/scores`, scoresResponse)).scores;
}

export interface NewHumanScore {
  runId: string;
  passed: boolean;
  score: number | null;
  reason: string | null;
}

export async function createHumanScore(v: NewHumanScore) {
  return apiPost(
    `/api/runs/${v.runId}/scores`,
    { scorer: "human", passed: v.passed, score: v.score, reason: v.reason },
    scoreSchema,
  );
}

// OPSP-27 B: 자산 본문 기반 시나리오 폼 초안. 사용자 hint(자연어) 옵션.
const scenarioSuggestionResponse = z.object({
  name: z.string(),
  purpose: z.string(),
  input: z.string(),
  expectedBehavior: z.string(),
  successCriteria: z.array(z.string()),
});
export type ScenarioSuggestion = z.infer<typeof scenarioSuggestionResponse>;

export async function suggestScenario(v: { assetId: string; hint?: string }) {
  return apiPost("/api/assist/scenario-suggest", v, scenarioSuggestionResponse);
}

// OPSP-10/20 비교 뷰: N개 run 요약 + assertion/judge/human score 통합.
// OPSP-9: scenarioName 추가(회귀 모드 식별).
const compareItemSchema = z.object({
  run: runSchema,
  scenarioName: z.string(),
  diffFileCount: z.number().int().nonnegative(),
  lastAssistantText: z.string().nullable(),
  assertionScore: scoreSchema.nullable(),
  judgeScore: scoreSchema.nullable(),
  humanScore: scoreSchema.nullable(),
});
export type CompareItem = z.infer<typeof compareItemSchema>;
const compareResponse = z.object({ items: z.array(compareItemSchema) });

// OPSP-10 follow-up: 비교 판정(AI judge). N개 run 결과 → winner + perRun verdict.
export const judgeVerdictSchema = z.enum(["best", "fine", "worse"]);
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
export const judgeResultSchema = z.object({
  winnerRunId: z.string().nullable(),
  summary: z.string().min(1),
  perRun: z.array(
    z.object({
      runId: z.string(),
      verdict: judgeVerdictSchema,
      note: z.string(),
    }),
  ),
});
export type JudgeResult = z.infer<typeof judgeResultSchema>;

export async function judgeRuns(runIds: string[]) {
  return apiPost("/api/assist/judge-runs", { runIds }, judgeResultSchema);
}

// OPSP-37 (3): 한 run trace AI 분석. OPSP-39: 비동기 작업화 + DB 캐시.
const traceAnalysisSchema = z.object({
  summary: z.string(),
  highlights: z.array(
    z.object({
      seq: z.number().int().nullable(),
      severity: z.enum(["info", "warn", "critical"]),
      note: z.string(),
    }),
  ),
  distributionInsight: z.string(),
  evalPoints: z.array(z.string()),
});
export type TraceAnalysis = z.infer<typeof traceAnalysisSchema>;

// OPSP-39: 분석 시작 (비동기) — 즉시 반환. 이미 진행 중이면 started=false.
export async function startAnalysis(runId: string) {
  return apiPost(
    `/api/runs/${runId}/analyze`,
    {},
    z.object({ started: z.boolean(), reason: z.string().optional() }),
  );
}

// OPSP-39: 분석 상태+결과 — running 이면 폴링, done 이면 캐시 결과.
const analysisResponseSchema = z.object({
  status: z.enum(["running", "done", "failed", "none"]),
  result: traceAnalysisSchema.nullable(),
  error: z.string().nullable(),
});
export type RunAnalysis = z.infer<typeof analysisResponseSchema>;

export async function getRunAnalysis(runId: string) {
  return apiGet(`/api/runs/${runId}/analysis`, analysisResponseSchema);
}

export async function getRunsCompare(ids: string[]) {
  return (await apiGet(`/api/runs/compare?ids=${ids.join(",")}`, compareResponse)).items;
}

// OPSP-36: 강제 종료 (running/pending → failed).
export async function cancelRun(id: string) {
  return apiPost(`/api/runs/${id}/cancel`, {}, z.object({ cancelled: z.boolean() }));
}

// OPSP-37: 같은 조건으로 다시 실행 → 새 run.
export async function rerunRun(id: string) {
  return apiPost(`/api/runs/${id}/rerun`, {}, runSchema);
}

// 시나리오 구체화: 목적/입력/기대 동작/성공조건 → description + expectation 매핑.
export interface LaunchInput {
  assetId: string;
  assetVersionId: string;
  source: "fixture" | "local-claude";
  name: string;
  purpose: string; // 왜 — description
  input: string; // 에이전트에 줄 입력
  expectedBehavior: string; // 기대 동작 — expectation.judge
  successCriteria: string[]; // 성공조건 — expectation.assertions
}

// OPSP-9: 같은 자산 버전 + 시나리오 N개 일괄. 기존 시나리오 그대로 사용(폼 입력 없음).
const batchScenariosResponse = z.object({ runs: z.array(runSchema) });
export interface BatchScenariosInput {
  assetVersionId: string;
  scenarioIds: string[];
  source: "fixture" | "local-claude";
}

export async function launchBatchScenarios(v: BatchScenariosInput) {
  return apiPost(
    "/api/runs/batch-scenarios",
    {
      assetVersionId: v.assetVersionId,
      scenarioIds: v.scenarioIds,
      source: v.source,
    },
    batchScenariosResponse,
  );
}

// OPSP-31: 같은 (asset_version × scenario) 를 N회 일괄 실행 + 집계.
export interface BenchmarkInput {
  assetVersionId: string;
  scenarioId: string;
  source: "fixture" | "local-claude";
  n: number; // 2~10
}

const benchmarkResponse = z.object({ runs: z.array(runSchema) });

export async function launchBenchmark(v: BenchmarkInput) {
  return apiPost("/api/runs/benchmark", v, benchmarkResponse);
}

export async function getBenchmarkAggregate(ids: string[]) {
  return apiGet(`/api/runs/benchmark-aggregate?ids=${ids.join(",")}`, benchmarkAggregateSchema);
}
export type BenchmarkAggregate = z.infer<typeof benchmarkAggregateSchema>;

// OPSP-10 비교 모드: 시나리오 1개 + 자산 버전 N개 → 한 번에 N run 시작.
// 시나리오는 RunLauncher 의 폼 입력으로 새로 만들고(=launchRun 과 같이), runs/batch 한 호출.
export interface BatchLaunchInput extends Omit<LaunchInput, "assetVersionId"> {
  assetVersionIds: string[];
}

export async function launchBatchRun(v: BatchLaunchInput) {
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
    "/api/runs/batch",
    {
      assetVersionIds: v.assetVersionIds,
      scenarioId: scenario.id,
      source: v.source,
    },
    z.object({ runs: z.array(runSchema) }),
  );
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
    { assetVersionId: v.assetVersionId, scenarioId: scenario.id, source: v.source },
    runSchema,
  );
}
