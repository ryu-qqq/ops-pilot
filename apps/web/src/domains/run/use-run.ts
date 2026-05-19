import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHumanScore,
  getRun,
  getRuns,
  getRunTrace,
  getScenario,
  getScores,
  launchRun,
  runKeys,
  scenarioKeys,
} from "./api";

export function useRuns() {
  return useQuery({ queryKey: runKeys.list(), queryFn: getRuns });
}

export function useRun(runId: string | null) {
  return useQuery({
    queryKey: runKeys.detail(runId ?? "none"),
    queryFn: () => getRun(runId ?? ""),
    enabled: runId !== null,
  });
}

export function useScenario(scenarioId: string | null | undefined) {
  return useQuery({
    queryKey: scenarioKeys.detail(scenarioId ?? "none"),
    queryFn: () => getScenario(scenarioId ?? ""),
    enabled: scenarioId != null,
  });
}

export function useRunTrace(runId: string | null) {
  return useQuery({
    queryKey: runKeys.trace(runId ?? "none"),
    queryFn: () => getRunTrace(runId ?? ""),
    enabled: runId !== null,
  });
}

export function useLaunchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.all }),
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
