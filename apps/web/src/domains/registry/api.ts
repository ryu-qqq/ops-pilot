import { z } from "zod";
import { assetSchema, assetVersionSchema } from "@opspilot/shared-types";
import { apiGet } from "../../lib/api-client";

// 목록용 버전(콘텐츠 제외) — 백엔드 응답과 1:1.
export const versionSummarySchema = assetVersionSchema.omit({ content: true });
export type VersionSummary = z.infer<typeof versionSummarySchema>;

const assetsResponse = z.object({ assets: z.array(assetSchema) });
const versionsResponse = z.object({ versions: z.array(versionSummarySchema) });

// Query Key Factory (CONVENTIONS.md 2): 프로젝트 스코프.
export const registryKeys = {
  all: ["registry"] as const,
  assets: (projectId: string) => [...registryKeys.all, "assets", projectId] as const,
  versions: (assetId: string) => [...registryKeys.all, "versions", assetId] as const,
};

export async function getProjectAssets(projectId: string) {
  return (await apiGet(`/api/projects/${projectId}/assets`, assetsResponse)).assets;
}

export async function getVersions(assetId: string) {
  return (await apiGet(`/api/registry/assets/${assetId}/versions`, versionsResponse)).versions;
}
