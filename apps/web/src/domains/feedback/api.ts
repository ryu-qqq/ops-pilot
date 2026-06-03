import { z } from "zod";
import {
  type ImprovementProposalStatus,
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
