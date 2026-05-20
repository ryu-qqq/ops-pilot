import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../registry/api";
import { authorAsset, authoringKeys, getAssetContent, reviewAuthoring } from "./api";

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

// OPSP-27: 자산 초안 → Claude 의도 확인·개선 제안. 저장 직전 사용자가 누르는 mutation.
export function useReviewAuthoring() {
  return useMutation({ mutationFn: reviewAuthoring });
}

export function useAssetContent(assetId: string | null) {
  return useQuery({
    queryKey: authoringKeys.content(assetId ?? "none"),
    queryFn: () => getAssetContent(assetId ?? ""),
    enabled: assetId !== null,
  });
}
