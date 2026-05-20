import { useQuery } from "@tanstack/react-query";
import { getAssetScenarios, getProjectAssets, getVersions, registryKeys } from "./api";

export function useAssets(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.assets(projectId ?? "none"),
    queryFn: () => getProjectAssets(projectId ?? ""),
    enabled: projectId !== null,
  });
}

// OPSP-9: 자산별 시나리오 목록(회귀 셋 모드의 체크박스 출처).
export function useAssetScenarios(assetId: string | null) {
  return useQuery({
    queryKey: registryKeys.scenarios(assetId ?? "none"),
    queryFn: () => getAssetScenarios(assetId ?? ""),
    enabled: assetId !== null,
  });
}

export function useAssetVersions(assetId: string | null) {
  return useQuery({
    queryKey: registryKeys.versions(assetId ?? "none"),
    queryFn: () => getVersions(assetId ?? ""),
    enabled: assetId !== null,
  });
}
