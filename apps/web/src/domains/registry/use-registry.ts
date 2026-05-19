import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssets, getVersions, registryKeys, scanRepo } from "./api";

export function useAssets() {
  return useQuery({ queryKey: registryKeys.assets(), queryFn: getAssets });
}

export function useAssetVersions(assetId: string | null) {
  return useQuery({
    queryKey: registryKeys.versions(assetId ?? "none"),
    queryFn: () => getVersions(assetId ?? ""),
    enabled: assetId !== null,
  });
}

export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: scanRepo,
    onSuccess: () => qc.invalidateQueries({ queryKey: registryKeys.all }),
  });
}
