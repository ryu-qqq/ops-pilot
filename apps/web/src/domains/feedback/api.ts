import {
  feedbackApplyRequestSchema,
  feedbackProposalApplyResponseSchema,
  improvementProposalSchema,
  ingestBundleDetailSchema,
  ingestBundleListResponseSchema,
} from "@opspilot/shared-types";
import { apiGet, apiPost } from "../../lib/api-client";

export const feedbackKeys = {
  all: ["feedback"] as const,
  list: (projectId: string) => [...feedbackKeys.all, "list", projectId] as const,
  detail: (ingestId: string) => [...feedbackKeys.all, "detail", ingestId] as const,
};

export async function getIngests(projectId: string) {
  return (await apiGet(`/api/feedback/ingests?projectId=${projectId}`, ingestBundleListResponseSchema))
    .ingests;
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
