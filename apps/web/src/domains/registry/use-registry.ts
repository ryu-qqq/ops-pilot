import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getAssetLint,
  getAssetScenarios,
  getProjectAssetUsage,
  getProjectAssets,
  getVersions,
  improveTriggerDescription,
  registryKeys,
  runTriggerEval,
  suggestTriggerQueries,
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

// T4-c: 자산 frontmatter lint (GET — 가벼움).
export function useAssetLint(assetId: string | null) {
  return useQuery({
    queryKey: registryKeys.lint(assetId ?? "none"),
    queryFn: () => getAssetLint(assetId ?? ""),
    enabled: assetId !== null,
  });
}

// T4: 트리거 평가 — 로컬 claude spawn(실 토큰)이라 query 가 아닌 mutation(명시 실행).
export function useSuggestTriggerQueries() {
  return useMutation({
    mutationFn: ({ assetId, n }: { assetId: string; n: number }) =>
      suggestTriggerQueries(assetId, n),
  });
}

export function useRunTriggerEval() {
  return useMutation({
    mutationFn: (args: {
      assetId: string;
      positives: string[];
      negatives: string[];
      runsPerQuery: number;
    }) =>
      runTriggerEval(
        args.assetId,
        args.positives,
        args.negatives,
        args.runsPerQuery,
      ),
  });
}

export function useImproveTriggerDescription() {
  return useMutation({ mutationFn: improveTriggerDescription });
}
