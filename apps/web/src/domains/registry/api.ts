import { z } from "zod";
import { assetSchema, assetVersionSchema } from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

// 목록용 버전(콘텐츠 제외) — 백엔드 응답과 1:1.
export const versionSummarySchema = assetVersionSchema.omit({ content: true });
export type VersionSummary = z.infer<typeof versionSummarySchema>;

const assetsResponse = z.object({ assets: z.array(assetSchema) });
const versionsResponse = z.object({ versions: z.array(versionSummarySchema) });
const scanResponse = z.object({
  repoPath: z.string(),
  scannedAssets: z.number(),
  scannedVersions: z.number(),
  saved: z.object({ assets: z.number(), versions: z.number() }),
});
export type ScanResult = z.infer<typeof scanResponse>;

// Query Key Factory (CONVENTIONS.md 2): 모든 쿼리키·무효화가 이 객체를 통한다.
export const registryKeys = {
  all: ["registry"] as const,
  assets: () => [...registryKeys.all, "assets"] as const,
  versions: (assetId: string) => [...registryKeys.all, "versions", assetId] as const,
};

export async function getAssets() {
  return (await apiGet("/api/registry/assets", assetsResponse)).assets;
}

export async function getVersions(assetId: string) {
  return (await apiGet(`/api/registry/assets/${assetId}/versions`, versionsResponse)).versions;
}

export async function scanRepo(repoPath: string) {
  return apiPost("/api/registry/scan", { repoPath }, scanResponse);
}
