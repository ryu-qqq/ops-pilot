import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyProposal,
  approveProposal,
  feedbackKeys,
  getIngestDetail,
  getIngests,
  rejectProposal,
} from "./api";

const pollIngestMs = 2000;

export function useIngests(projectId: string | null) {
  return useQuery({
    queryKey: feedbackKeys.list(projectId ?? "none"),
    queryFn: () => getIngests(projectId ?? ""),
    enabled: projectId !== null,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((i) => i.status === "pending" || i.status === "evaluating")
        ? pollIngestMs
        : false,
  });
}

export function useIngestDetail(ingestId: string | null) {
  return useQuery({
    queryKey: feedbackKeys.detail(ingestId ?? "none"),
    queryFn: () => getIngestDetail(ingestId ?? ""),
    enabled: ingestId !== null,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "pending" || s === "evaluating" ? pollIngestMs : false;
    },
  });
}

function invalidateFeedback(qc: ReturnType<typeof useQueryClient>, ingestId: string, projectId: string) {
  void qc.invalidateQueries({ queryKey: feedbackKeys.detail(ingestId) });
  void qc.invalidateQueries({ queryKey: feedbackKeys.list(projectId) });
}

export function useApproveProposal(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: approveProposal,
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}

export function useRejectProposal(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rejectProposal,
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}

export function useApplyProposal(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyProposal,
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}
