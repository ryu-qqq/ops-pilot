import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../registry/api";
import { authorAsset, authoringKeys, getAssetContent } from "./api";

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

export function useAssetContent(assetId: string | null) {
  return useQuery({
    queryKey: authoringKeys.content(assetId ?? "none"),
    queryFn: () => getAssetContent(assetId ?? ""),
    enabled: assetId !== null,
  });
}
