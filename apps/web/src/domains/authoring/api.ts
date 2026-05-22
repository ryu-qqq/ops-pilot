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

// OPSP-45: 비교/벤치마크에서 고른 버전을 자산의 현재 최신으로 채택(앞으로 감기).
export async function adoptVersion(input: { assetVersionId: string; note: string }) {
  return apiPost(
    `/api/registry/asset-versions/${input.assetVersionId}/adopt`,
    { note: input.note },
    authorResponse,
  );
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

// OPSP-27 follow-up: 컨셉 한 줄 → frontmatter+본문 자동 초안.
// 사용자가 빈 폼에서 시작이 막막한 문제 해결.
const assetDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.string().optional(),
  "allowed-tools": z.string().optional(),
  model: z.enum(["inherit", "sonnet", "opus", "haiku"]).optional(),
  body: z.string().min(1),
});
export type AssetDraft = z.infer<typeof assetDraftSchema>;

export async function draftAsset(input: { kind: AssetKind; prompt: string }) {
  return apiPost("/api/assist/draft-asset", input, assetDraftSchema);
}
