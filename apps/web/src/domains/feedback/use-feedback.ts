import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImprovementProposalStatus } from "@opspilot/shared-types";
import {
  applyProposal,
  approveProposal,
  feedbackKeys,
  getIngestDetail,
  getIngests,
  getProjectProposals,
  rejectProposal,
  reprocessIngest,
  reprocessReviewIngest,
  reviewIngest,
} from "./api";

const pollIngestMs = 2000;

function isIngestActive(status: string | undefined): boolean {
  return status === "pending" || status === "evaluating" || status === "reviewing";
}

export function useIngests(projectId: string | null) {
  return useQuery({
    queryKey: feedbackKeys.list(projectId ?? "none"),
    queryFn: () => getIngests(projectId ?? ""),
    enabled: projectId !== null,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((i) => isIngestActive(i.status)) ? pollIngestMs : false,
  });
}

/**
 * 프로젝트 전역 개선안 결정 큐. 진행 중 ingest(`hasActiveIngest`)가 있으면 2초 폴링 —
 * eval/review 완료 시 새 proposal 이 도착하므로. 호출부가 `useIngests` 집계로 신호를 내려준다.
 */
export function useProjectProposals(
  projectId: string | null,
  status: ImprovementProposalStatus | undefined,
  hasActiveIngest: boolean,
) {
  return useQuery({
    queryKey: feedbackKeys.proposals(projectId ?? "none", status),
    queryFn: () => getProjectProposals(projectId ?? "", status),
    enabled: projectId !== null,
    refetchInterval: hasActiveIngest ? pollIngestMs : false,
  });
}

export function useIngestDetail(ingestId: string | null) {
  return useQuery({
    queryKey: feedbackKeys.detail(ingestId ?? "none"),
    queryFn: () => getIngestDetail(ingestId ?? ""),
    enabled: ingestId !== null,
    refetchInterval: (q) => (isIngestActive(q.state.data?.status) ? pollIngestMs : false),
  });
}

function invalidateFeedback(qc: ReturnType<typeof useQueryClient>, ingestId: string, projectId: string) {
  void qc.invalidateQueries({ queryKey: feedbackKeys.detail(ingestId) });
  void qc.invalidateQueries({ queryKey: feedbackKeys.list(projectId) });
  // 결정 큐(프로젝트 전역 proposals)는 status 별로 키가 갈라지므로 prefix 무효화.
  void qc.invalidateQueries({ queryKey: [...feedbackKeys.all, "proposals", projectId] });
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

export function useReprocessIngest(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reprocessIngest(ingestId),
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}

export function useReprocessReviewIngest(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reprocessReviewIngest(ingestId),
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}

export function useReviewIngest(ingestId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reviewIngest(ingestId),
    onSuccess: () => invalidateFeedback(qc, ingestId, projectId),
  });
}
