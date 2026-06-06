import { z } from "zod";
import {
  assetGraphSchema,
  assetLintResultSchema,
  assetSchema,
  assetVersionContentSchema,
  assetVersionSchema,
  compoundingTrendSchema,
  improveResultSchema,
  projectAssetLintSchema,
  projectUsageReportSchema,
  projectWorkMetricReportSchema,
  usageGlobalSchema,
  scenarioSchema,
  triggerEvalResultSchema,
  triggerSuggestResponseSchema,
  workMetricScanResultSchema,
} from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

// 목록용 버전(콘텐츠 제외) — 백엔드 응답과 1:1.
export const versionSummarySchema = assetVersionSchema.omit({ content: true });
export type VersionSummary = z.infer<typeof versionSummarySchema>;

const assetsResponse = z.object({ assets: z.array(assetSchema) });
const versionsResponse = z.object({ versions: z.array(versionSummarySchema) });

// Query Key Factory (CONVENTIONS.md 2): 프로젝트 스코프.
export const registryKeys = {
  all: ["registry"] as const,
  assets: (projectId: string) =>
    [...registryKeys.all, "assets", projectId] as const,
  assetUsage: (projectId: string) =>
    [...registryKeys.all, "asset-usage", projectId] as const,
  lint: (assetId: string) => [...registryKeys.all, "lint", assetId] as const,
  projectLint: (projectId: string) =>
    [...registryKeys.all, "project-lint", projectId] as const,
  usageGlobal: (days: number) =>
    [...registryKeys.all, "usage-global", days] as const,
  workMetrics: (projectId: string) =>
    [...registryKeys.all, "work-metrics", projectId] as const,
  compoundingTrend: (projectId: string) =>
    [...registryKeys.all, "compounding-trend", projectId] as const,
  assetGraph: (projectId: string) =>
    [...registryKeys.all, "asset-graph", projectId] as const,
  versions: (assetId: string) =>
    [...registryKeys.all, "versions", assetId] as const,
  versionContent: (versionId: string) =>
    [...registryKeys.all, "version-content", versionId] as const,
  scenarios: (assetId: string) =>
    [...registryKeys.all, "scenarios", assetId] as const,
};

const scenariosResponse = z.object({ scenarios: z.array(scenarioSchema) });

const pruneResponse = z.object({
  committed: z.string(),
  deleted: z.literal(true),
});

export async function getProjectAssets(projectId: string) {
  return (await apiGet(`/api/projects/${projectId}/assets`, assetsResponse))
    .assets;
}

// T4-c: 자산 frontmatter lint (검증 게이트와 동일 규칙).
export async function getAssetLint(assetId: string) {
  return apiGet(`/api/registry/assets/${assetId}/lint`, assetLintResultSchema);
}

// T5: 프로젝트 전 자산 배치 lint (헬스 대시보드).
export async function getProjectAssetLint(projectId: string) {
  return apiGet(
    `/api/projects/${projectId}/asset-lint`,
    projectAssetLintSchema,
  );
}

// T5: 전역 사용량 랭킹 (최근 N일 리더보드, 프로젝트 무관).
export async function getUsageGlobal(days: number) {
  return apiGet(`/api/usage/global?days=${String(days)}`, usageGlobalSchema);
}

// T3: 자산별 transcript 사용량 (만들고 안 쓰는 자산 식별).
export async function getProjectAssetUsage(projectId: string) {
  return apiGet(
    `/api/usage/assets?projectId=${projectId}`,
    projectUsageReportSchema,
  );
}

// ADR-0001 카드D: 자산별 작업 신호(참고용) — ⚠️ 품질 점수 아님(reference signal).
export async function getProjectWorkMetrics(projectId: string) {
  return apiGet(
    `/api/usage/work-metrics?projectId=${projectId}`,
    projectWorkMetricReportSchema,
  );
}

// 의제 002 고리 #3: 프로젝트 단위 정정비율 추세 + apply 마커. ⚠️ reference signal.
export async function getCompoundingTrend(projectId: string) {
  return apiGet(
    `/api/usage/compounding-trend?projectId=${projectId}`,
    compoundingTrendSchema,
  );
}

// 수동 전수 스캔 트리거 (멱등 upsert). 패칭만 — 무효화는 호출부 훅에서.
export async function scanWorkMetrics() {
  return apiPost("/api/usage/work-metrics/scan", {}, workMetricScanResultSchema);
}

// 자산 관계(참조) 그래프 — 트리·고아·다대다·상태 계산용. 휴리스틱 "참조"(본문 언급).
export async function getAssetGraph(projectId: string) {
  return apiGet(
    `/api/registry/asset-graph?projectId=${projectId}`,
    assetGraphSchema,
  );
}

// T4: 트리거 정확도 평가 (description 이 켜져야 할 때 켜지나). 둘 다 로컬 claude spawn.
export async function suggestTriggerQueries(assetId: string, n: number) {
  return apiPost(
    "/api/trigger-eval/suggest",
    { assetId, n },
    triggerSuggestResponseSchema,
  );
}

export async function runTriggerEval(
  assetId: string,
  positives: string[],
  negatives: string[],
  runsPerQuery: number,
) {
  return apiPost(
    "/api/trigger-eval/run",
    { assetId, positives, negatives, runsPerQuery },
    triggerEvalResultSchema,
  );
}

// T4-b: description 자동개선 루프 (반복 × 쿼리 × runs 회 claude — 비싸다).
export async function improveTriggerDescription(args: {
  assetId: string;
  positives: string[];
  negatives: string[];
  runsPerQuery: number;
  maxIterations: number;
}) {
  return apiPost("/api/trigger-eval/improve", args, improveResultSchema);
}

// 카드 C(prune): 미사용 project-local 자산 삭제. crew/unknown 은 서버 가드에서 400 차단.
// rationale 빈 문자열 허용 — 서버가 "(미기재)" 처리. 패칭만, 무효화는 호출부 훅에서.
export async function pruneAsset(assetId: string, rationale: string) {
  return apiPost(
    `/api/registry/assets/${assetId}/prune`,
    { rationale },
    pruneResponse,
  );
}

export async function getVersions(assetId: string) {
  return (
    await apiGet(`/api/registry/assets/${assetId}/versions`, versionsResponse)
  ).versions;
}

// 특정 버전의 마크다운 본문(frontmatter 제외) — 상세 본문 뷰용.
export async function getVersionContent(assetId: string, versionId: string) {
  return (
    await apiGet(
      `/api/registry/assets/${assetId}/versions/${versionId}/content`,
      assetVersionContentSchema,
    )
  ).content;
}

// OPSP-9: 자산별 시나리오 목록(회귀 셋 모드용).
export async function getAssetScenarios(assetId: string) {
  return (
    await apiGet(`/api/registry/assets/${assetId}/scenarios`, scenariosResponse)
  ).scenarios;
}
