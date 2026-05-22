import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../registry/api";
import {
  adoptVersion,
  authorAsset,
  authoringKeys,
  draftAsset,
  getAssetContent,
  reviewAuthoring,
} from "./api";

export function useAuthorAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authorAsset,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: registryKeys.assets(projectId) });
      void qc.invalidateQueries({ queryKey: registryKeys.all });
    },
  });
}

// OPSP-45: 과거 버전 채택 → 새 latest. registry 전체 무효화로 버전 타임라인 갱신.
export function useAdoptVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adoptVersion,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: registryKeys.all });
    },
  });
}

// OPSP-27: 자산 초안 → Claude 의도 확인·개선 제안. 저장 직전 사용자가 누르는 mutation.
export function useReviewAuthoring() {
  return useMutation({ mutationFn: reviewAuthoring });
}

// OPSP-27 follow-up: 컨셉 한 줄 → 폼 전체 자동 채움.
export function useDraftAsset() {
  return useMutation({ mutationFn: draftAsset });
}

export function useAssetContent(assetId: string | null) {
  return useQuery({
    queryKey: authoringKeys.content(assetId ?? "none"),
    queryFn: () => getAssetContent(assetId ?? ""),
    enabled: assetId !== null,
  });
}
