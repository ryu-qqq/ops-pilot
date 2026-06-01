import { useQuery } from "@tanstack/react-query";
import {
  getAssetScenarios,
  getProjectAssetUsage,
  getProjectAssets,
  getVersions,
  registryKeys,
} from "./api";

export function useAssets(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.assets(projectId ?? "none"),
    queryFn: () => getProjectAssets(projectId ?? ""),
    enabled: projectId !== null,
  });
}

// T3: 자산 사용량(transcript 스캔). 스캔 비용이 있어 stale 시간을 길게.
export function useProjectAssetUsage(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.assetUsage(projectId ?? "none"),
    queryFn: () => getProjectAssetUsage(projectId ?? ""),
    enabled: projectId !== null,
    staleTime: 5 * 60 * 1000,
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
