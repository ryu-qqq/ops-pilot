import { useQuery } from "@tanstack/react-query";
import { getProjectAssets, getVersions, registryKeys } from "./api";

export function useAssets(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.assets(projectId ?? "none"),
    queryFn: () => getProjectAssets(projectId ?? ""),
    enabled: projectId !== null,
  });
}

export function useAssetVersions(assetId: string | null) {
  return useQuery({
    queryKey: registryKeys.versions(assetId ?? "none"),
    queryFn: () => getVersions(assetId ?? ""),
    enabled: assetId !== null,
  });
}
