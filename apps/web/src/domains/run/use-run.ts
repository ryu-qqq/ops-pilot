import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRuns, getRunTrace, launchRun, runKeys } from "./api";

export function useRuns() {
  return useQuery({ queryKey: runKeys.list(), queryFn: getRuns });
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
