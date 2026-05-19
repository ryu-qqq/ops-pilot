import { useQuery } from "@tanstack/react-query";
import { getRuns, getRunTrace, runKeys } from "./api";

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
