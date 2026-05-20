import { z } from "zod";
import type { AssetKind } from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

const authorResponse = z.object({
  committed: z.string(),
  scanned: z.object({ assets: z.number(), versions: z.number() }),
});
const contentResponse = z.object({ content: z.string() });

export interface AuthorInput {
  projectId: string;
  kind: AssetKind;
  name: string;
  content: string;
  changeSummary: string;
  rationale: string;
}

export async function authorAsset(v: AuthorInput) {
  return apiPost(
    `/api/projects/${v.projectId}/assets`,
    { kind: v.kind, name: v.name, content: v.content, changeSummary: v.changeSummary, rationale: v.rationale },
    authorResponse,
  );
}

export async function getAssetContent(assetId: string) {
  return (await apiGet(`/api/registry/assets/${assetId}/content`, contentResponse)).content;
}

export const authoringKeys = {
  content: (assetId: string) => ["authoring", "content", assetId] as const,
};

// OPSP-27: 자산 저작 초안 → 로컬 Claude 의 의도·개선 제안(자유 텍스트).
const reviewResponse = z.object({ text: z.string() });

export interface ReviewInput {
  kind: AssetKind;
  name: string;
  content: string;
}

export async function reviewAuthoring(v: ReviewInput) {
  return (await apiPost("/api/assist/authoring-review", v, reviewResponse)).text;
}
