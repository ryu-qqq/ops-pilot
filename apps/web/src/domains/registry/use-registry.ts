import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getAssetGraph,
  getAssetLint,
  getAssetScenarios,
  getProjectAssetLint,
  getProjectAssetUsage,
  getProjectWorkMetrics,
  getUsageGlobal,
  getProjectAssets,
  getVersions,
  improveTriggerDescription,
  pruneAsset,
  registryKeys,
  runTriggerEval,
  scanWorkMetrics,
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

// ADR-0001 카드D: 자산별 작업 신호(참고용). 스캔 비용이 있어 staleTime 길게.
export function useProjectWorkMetrics(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.workMetrics(projectId ?? "none"),
    queryFn: () => getProjectWorkMetrics(projectId ?? ""),
    enabled: projectId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

// 자산 관계(참조) 그래프 — 툴킷 트리·고아·다대다·상태 계산용. 비교적 가벼운 동기 계산.
export function useAssetGraph(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.assetGraph(projectId ?? "none"),
    queryFn: () => getAssetGraph(projectId ?? ""),
    enabled: projectId !== null,
  });
}

// 수동 전수 스캔 후 해당 프로젝트 작업 신호 무효화 (projectId = mutation 변수).
export function useScanWorkMetrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (_vars: { projectId: string }) => scanWorkMetrics(),
    onSuccess: (_data, { projectId }) => {
      void qc.invalidateQueries({
        queryKey: registryKeys.workMetrics(projectId),
      });
    },
  });
}

// 카드 C(prune): 미사용 project-local 자산 삭제. 성공 시 목록·사용량·lint 무효화
// (행이 사라지고 헬스 수치가 갱신된다). 선택 해제는 호출부(상세 패널 onDeleted)에서.
export function usePruneAsset(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      rationale,
    }: {
      assetId: string;
      rationale: string;
    }) => pruneAsset(assetId, rationale),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: registryKeys.assets(projectId) });
      void qc.invalidateQueries({
        queryKey: registryKeys.assetUsage(projectId),
      });
      void qc.invalidateQueries({
        queryKey: registryKeys.projectLint(projectId),
      });
    },
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

// T5: 전역 사용량 리더보드 (최근 N일). staleTime 길게(스캔 비용).
export function useUsageGlobal(days: number) {
  return useQuery({
    queryKey: registryKeys.usageGlobal(days),
    queryFn: () => getUsageGlobal(days),
    staleTime: 5 * 60 * 1000,
  });
}

// T5: 프로젝트 전 자산 배치 lint (헬스 대시보드).
export function useProjectAssetLint(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.projectLint(projectId ?? "none"),
    queryFn: () => getProjectAssetLint(projectId ?? ""),
    enabled: projectId !== null,
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
