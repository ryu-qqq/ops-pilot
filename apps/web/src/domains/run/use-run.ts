import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHumanScore,
  getRun,
  getRunDiff,
  getRuns,
  getRunsCompare,
  getRunTrace,
  getScenario,
  getScores,
  judgeRuns,
  launchBatchRun,
  launchRun,
  runKeys,
  scenarioKeys,
  suggestScenario,
} from "./api";

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

export function useCreateHumanScore(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createHumanScore,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.scores(runId) }),
  });
}
