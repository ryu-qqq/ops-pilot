import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelRun,
  createHumanScore,
  deleteScenario,
  generateScenarioAb,
  generateScenarioAbRun,
  getRunAnalysis,
  rerunRun,
  startAnalysis,
  getBenchmarkAggregate,
  getRun,
  getRunDiff,
  getRuns,
  getRunsCompare,
  getRunTrace,
  gradeRun,
  getScenario,
  getScenariosForAsset,
  getScores,
  judgeRuns,
  launchBatchRun,
  launchBatchScenarios,
  launchBenchmark,
  launchRun,
  runKeys,
  scenarioKeys,
  setRunRetro,
  suggestScenario,
  updateScenario,
  type UpdateScenarioInput,
} from "./api";
import { feedbackKeys } from "../feedback/api";

export function useRuns() {
  return useQuery({
    queryKey: runKeys.list(),
    queryFn: getRuns,
    // 실행 중인 run 이 있으면 목록도 폴링(상태 갱신), 없으면 멈춤
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "running") ? 2000 : false,
  });
}

export function useRun(runId: string | null) {
  return useQuery({
    queryKey: runKeys.detail(runId ?? "none"),
    queryFn: () => getRun(runId ?? ""),
    enabled: runId !== null,
    // OPSP-29: 실행 중이면 폴링(실시간), 종료되면 멈춤
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1200 : false),
  });
}

// OPSP-46: run 회고 메모 저장 → 해당 run 상세 무효화.
export function useSetRunRetro(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (retro: string) => setRunRetro(runId, retro),
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.detail(runId) }),
  });
}

export function useScenario(scenarioId: string | null | undefined) {
  return useQuery({
    queryKey: scenarioKeys.detail(scenarioId ?? "none"),
    queryFn: () => getScenario(scenarioId ?? ""),
    enabled: scenarioId != null,
  });
}

export function useRunTrace(runId: string | null, isRunning: boolean) {
  return useQuery({
    queryKey: runKeys.trace(runId ?? "none"),
    queryFn: () => getRunTrace(runId ?? ""),
    enabled: runId !== null,
    refetchInterval: isRunning ? 1200 : false,
  });
}

// OPSP-27 B: 자산 + hint 로 시나리오 폼 초안 받기.
export function useSuggestScenario() {
  return useMutation({ mutationFn: suggestScenario });
}

// ADR 0003 Follow-up #2: asset·baked 시나리오 2개 강제 산출. 성공 시 시나리오 목록 무효화 →
// ScenarioManager 에 두 신규 시나리오(source 배지)가 바로 보임.
export function useGenerateScenarioAb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateScenarioAb,
    onSuccess: () => qc.invalidateQueries({ queryKey: scenarioKeys.all }),
  });
}

// ADR 0003 Follow-up #2: A/B 측정 — asset·baked 시나리오 산출 + 둘 다 즉시 실행.
// 성공 시 두 시나리오가 저장되고 두 run 이 시작됐으므로 시나리오·run 캐시 둘 다 무효화
// (네비는 호출부에서 onLaunched 로 — 패칭 훅은 패칭만).
export function useGenerateScenarioAbRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateScenarioAbRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scenarioKeys.all });
      qc.invalidateQueries({ queryKey: runKeys.all });
    },
  });
}

export function useLaunchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
  });
}

// OPSP-10: 같은 시나리오 + 자산 버전 N개 → 한 번에 N run 시작.
export function useLaunchBatchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchBatchRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
  });
}

// OPSP-9: 같은 자산 버전 + 시나리오 N개 → 한 번에 N run 시작.
export function useLaunchBatchScenarios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchBatchScenarios,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
  });
}

// OPSP-10 follow-up: 비교 판정(AI judge). 사용자 명시 클릭 시만.
// OPSP-20: 판정 결과를 score 저장 → 비교 뷰 judge 행 채워지려면 compare 캐시 무효화.
export function useJudgeRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: judgeRuns,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
  });
}

// OPSP-10: 비교 패널용 N개 run 요약. 실행 중이면 폴링.
export function useRunsCompare(ids: string[], anyRunning: boolean) {
  return useQuery({
    queryKey: runKeys.compare(ids),
    queryFn: () => getRunsCompare(ids),
    enabled: ids.length > 0,
    refetchInterval: anyRunning ? 1500 : false,
  });
}

// OPSP-30: 실행 종료 후 worktree diff. 실행 중에는 비어있고, 끝나는 순간 채워짐 →
// running 중에는 폴링해 보고, 종료되면 멈춤.
export function useRunDiff(runId: string | null, isRunning: boolean) {
  return useQuery({
    queryKey: runKeys.diff(runId ?? "none"),
    queryFn: () => getRunDiff(runId ?? ""),
    enabled: runId !== null,
    refetchInterval: isRunning ? 1500 : false,
  });
}

export function useScores(runId: string | null) {
  return useQuery({
    queryKey: runKeys.scores(runId ?? "none"),
    queryFn: () => getScores(runId ?? ""),
    enabled: runId !== null,
  });
}

// T4-e: LLM grader — run 단일 자동채점. 성공 시 score(llm_judge) 가 저장되므로
// scores 캐시(사람평가 카드와 공유) + 비교 뷰 judge 행 갱신 위해 runs 캐시 무효화.
export function useGradeRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => gradeRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.scores(runId) });
      qc.invalidateQueries({ queryKey: runKeys.all });
    },
  });
}

export function useCreateHumanScore(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createHumanScore,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.scores(runId) }),
  });
}

// OPSP-36: 강제 종료. 성공 시 run·대시보드 캐시 무효화.
export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.all });
    },
  });
}

// OPSP-39: AI 분석 시작 (비동기). 성공 시 analysis 캐시 무효화 → 폴링 시작.
export function useStartAnalysis(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => startAnalysis(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.analysis(runId) });
    },
  });
}

// OPSP-39: AI 분석 상태+결과 — running 이면 2초 폴링, done/failed/none 이면 멈춤.
// 화면 이동 후 다시 와도 DB 캐시라 결과 그대로 보임.
export function useRunAnalysis(runId: string | null) {
  return useQuery({
    queryKey: runKeys.analysis(runId ?? "none"),
    queryFn: () => getRunAnalysis(runId ?? ""),
    enabled: runId !== null,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : false),
  });
}

// OPSP-37: 같은 조건 다시 실행. 성공 시 run·대시보드 캐시 무효화.
export function useRerunRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rerunRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.all });
      qc.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

// OPSP-31: 같은 (자산버전 × 시나리오) N회 실행 시작.
export function useLaunchBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchBenchmark,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
  });
}

// OPSP-34: 자산별 시나리오 관리 목록(본문 + 사용 횟수).
export function useScenariosForAsset(assetId: string | null) {
  return useQuery({
    queryKey: scenarioKeys.forAsset(assetId ?? "none"),
    queryFn: () => getScenariosForAsset(assetId ?? ""),
    enabled: assetId !== null,
  });
}

// OPSP-34: 시나리오 부분 update. 성공 시 관련 캐시 광범위 invalidate
// (RegressionLauncher · BenchmarkLauncher 의 useAssetScenarios 도 같이 갱신).
export function useUpdateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateScenarioInput }) =>
      updateScenario(id, patch),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: scenarioKeys.all });
      qc.invalidateQueries({ queryKey: scenarioKeys.detail(updated.id) });
    },
  });
}

// OPSP-34: 시나리오 삭제. 성공 시 시나리오·run 캐시 둘 다 무효화 (cascade 영향).
export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScenario(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scenarioKeys.all });
      qc.invalidateQueries({ queryKey: runKeys.all });
    },
  });
}

// OPSP-31: N개 run 통계 집계 — 실행 중이면 폴링.
export function useBenchmarkAggregate(ids: string[], anyRunning: boolean) {
  return useQuery({
    queryKey: runKeys.benchmark(ids),
    queryFn: () => getBenchmarkAggregate(ids),
    enabled: ids.length >= 1,
    refetchInterval: anyRunning ? 1500 : false,
  });
}
