import { z } from "zod";
import {
  type ImprovementProposalStatus,
  autoIngestConfigSchema,
  feedbackApplyRequestSchema,
  feedbackProposalApplyResponseSchema,
  improvementProposalSchema,
  ingestBundleDetailSchema,
  ingestBundleListResponseSchema,
  proposalWithSourceSchema,
} from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

export const feedbackKeys = {
  all: ["feedback"] as const,
  list: (projectId: string) => [...feedbackKeys.all, "list", projectId] as const,
  detail: (ingestId: string) => [...feedbackKeys.all, "detail", ingestId] as const,
  proposals: (projectId: string, status?: ImprovementProposalStatus) =>
    [...feedbackKeys.all, "proposals", projectId, status ?? "all"] as const,
  // ADR 0004: 자동 ingest env 설정은 전역(읽기 전용) — projectId 차원 없음.
  autoIngestConfig: () => [...feedbackKeys.all, "auto-ingest-config"] as const,
};

export async function getIngests(projectId: string) {
  return (await apiGet(`/api/feedback/ingests?projectId=${projectId}`, ingestBundleListResponseSchema))
    .ingests;
}

export async function getProjectProposals(projectId: string, status?: ImprovementProposalStatus) {
  const query = new URLSearchParams({ projectId });
  if (status !== undefined) query.set("status", status);
  return apiGet(`/api/feedback/proposals?${query.toString()}`, z.array(proposalWithSourceSchema));
}

export async function getIngestDetail(ingestId: string) {
  return apiGet(`/api/feedback/ingest/${ingestId}`, ingestBundleDetailSchema);
}

export async function getAutoIngestConfig() {
  return apiGet(`/api/feedback/auto-ingest-config`, autoIngestConfigSchema);
}

export async function approveProposal(proposalId: string) {
  return apiPost(`/api/feedback/proposals/${proposalId}/approve`, {}, improvementProposalSchema);
}

export async function rejectProposal(proposalId: string) {
  return apiPost(`/api/feedback/proposals/${proposalId}/reject`, {}, improvementProposalSchema);
}

export async function applyProposal(proposalId: string) {
  return apiPost(
    `/api/feedback/proposals/${proposalId}/apply`,
    feedbackApplyRequestSchema.parse({ confirm: true }),
    feedbackProposalApplyResponseSchema,
  );
}

export async function reprocessIngest(ingestId: string) {
  return apiPost(`/api/feedback/ingest/${ingestId}/reprocess`, {}, ingestBundleDetailSchema);
}

export async function reviewIngest(ingestId: string) {
  return apiPost(`/api/feedback/ingest/${ingestId}/review`, {}, ingestBundleDetailSchema);
}

export async function reprocessReviewIngest(ingestId: string) {
  return apiPost(`/api/feedback/ingest/${ingestId}/reprocess-review`, {}, ingestBundleDetailSchema);
}
