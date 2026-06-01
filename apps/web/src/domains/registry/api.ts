import { z } from "zod";
import {
  assetSchema,
  assetVersionSchema,
  projectUsageReportSchema,
  scenarioSchema,
  triggerEvalResultSchema,
  triggerSuggestResponseSchema,
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
  versions: (assetId: string) =>
    [...registryKeys.all, "versions", assetId] as const,
  scenarios: (assetId: string) =>
    [...registryKeys.all, "scenarios", assetId] as const,
};

const scenariosResponse = z.object({ scenarios: z.array(scenarioSchema) });

export async function getProjectAssets(projectId: string) {
  return (await apiGet(`/api/projects/${projectId}/assets`, assetsResponse))
    .assets;
}

// T3: 자산별 transcript 사용량 (만들고 안 쓰는 자산 식별).
export async function getProjectAssetUsage(projectId: string) {
  return apiGet(
    `/api/usage/assets?projectId=${projectId}`,
    projectUsageReportSchema,
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

export async function getVersions(assetId: string) {
  return (
    await apiGet(`/api/registry/assets/${assetId}/versions`, versionsResponse)
  ).versions;
}

// OPSP-9: 자산별 시나리오 목록(회귀 셋 모드용).
export async function getAssetScenarios(assetId: string) {
  return (
    await apiGet(`/api/registry/assets/${assetId}/scenarios`, scenariosResponse)
  ).scenarios;
}
