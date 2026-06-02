import { z } from "zod";
import { apiPost } from "../../lib/api-client";

const authorResponse = z.object({
  committed: z.string(),
  scanned: z.object({ assets: z.number(), versions: z.number() }),
});

// OPSP-45: 비교/벤치마크에서 고른 버전을 자산의 현재 최신으로 채택(앞으로 감기).
// (자산 저작/편집 UI 는 제거됨 — 저작은 터미널/agent-crew harness-creator 담당.
//  여기 남은 adopt 는 평가 플로우의 "과거 버전 승격"이라 저작이 아니다.)
export async function adoptVersion(input: { assetVersionId: string; note: string }) {
  return apiPost(
    `/api/registry/asset-versions/${input.assetVersionId}/adopt`,
    { note: input.note },
    authorResponse,
  );
}
