import type {
  FeedbackProposalApplyResponse,
  ImprovementProposal,
  ImprovementProposalStatus,
} from "@opspilot/shared-types";
import { getProject } from "../project/repository.js";
import { FeedbackApplyError, applyProposalToProject } from "./apply.js";
import {
  getImprovementProposal,
  getIngestBundle,
  listProposalsByIngestId,
  markProposalApplied,
  updateProposalStatus,
} from "./repository.js";

export class FeedbackProposalError extends Error {
  constructor(
    readonly code: "NotFound" | "InvalidState" | "ApplyError",
    message: string,
  ) {
    super(message);
    this.name = "FeedbackProposalError";
  }
}

export function getProposalDetail(id: string): ImprovementProposal | undefined {
  return getImprovementProposal(id);
}

export function listProposalsForIngest(
  ingestId: string,
  status: ImprovementProposalStatus | "all" = "draft",
): { ingestId: string; ingestStatus: string; proposals: ImprovementProposal[] } {
  const ingest = getIngestBundle(ingestId);
  if (!ingest) throw new FeedbackProposalError("NotFound", "ingest bundle not found");
  let proposals = listProposalsByIngestId(ingestId);
  if (status !== "all") {
    proposals = proposals.filter((p) => p.status === status);
  }
  return { ingestId: ingest.id, ingestStatus: ingest.status, proposals };
}

export function approveProposal(id: string): ImprovementProposal {
  const proposal = getImprovementProposal(id);
  if (!proposal) throw new FeedbackProposalError("NotFound", "proposal not found");
  if (proposal.status !== "draft") {
    throw new FeedbackProposalError("InvalidState", `cannot approve from status ${proposal.status}`);
  }
  const updated = updateProposalStatus(id, "approved");
  if (!updated) throw new FeedbackProposalError("NotFound", "proposal not found");
  return updated;
}

export function rejectProposal(id: string): ImprovementProposal {
  const proposal = getImprovementProposal(id);
  if (!proposal) throw new FeedbackProposalError("NotFound", "proposal not found");
  if (proposal.status !== "draft") {
    throw new FeedbackProposalError("InvalidState", `cannot reject from status ${proposal.status}`);
  }
  const updated = updateProposalStatus(id, "rejected");
  if (!updated) throw new FeedbackProposalError("NotFound", "proposal not found");
  return updated;
}

export function applyProposal(id: string): FeedbackProposalApplyResponse {
  const proposal = getImprovementProposal(id);
  if (!proposal) throw new FeedbackProposalError("NotFound", "proposal not found");
  if (proposal.status !== "approved") {
    throw new FeedbackProposalError(
      "InvalidState",
      `apply requires approved status (current: ${proposal.status})`,
    );
  }

  const ingest = getIngestBundle(proposal.ingestId);
  if (!ingest) throw new FeedbackProposalError("NotFound", "ingest bundle not found");
  const project = getProject(ingest.projectId);
  if (!project) throw new FeedbackProposalError("NotFound", "project not found");

  let appliedCommit: string;
  try {
    appliedCommit = applyProposalToProject(project, proposal);
  } catch (e) {
    const msg = e instanceof FeedbackApplyError ? e.message : (e as Error).message;
    throw new FeedbackProposalError("ApplyError", msg);
  }

  const updated = markProposalApplied(id, appliedCommit);
  if (!updated) throw new FeedbackProposalError("NotFound", "proposal not found");
  return { proposal: updated, appliedCommit };
}

/** MCP HITL: confirm=true 이면 draft 도 승인 후 apply (REST 는 approve·apply 분리). */
export function applyProposalHitl(id: string): FeedbackProposalApplyResponse {
  const proposal = getImprovementProposal(id);
  if (!proposal) throw new FeedbackProposalError("NotFound", "proposal not found");
  if (proposal.status === "draft") {
    approveProposal(id);
  } else if (proposal.status !== "approved") {
    throw new FeedbackProposalError(
      "InvalidState",
      `apply requires draft or approved (current: ${proposal.status})`,
    );
  }
  return applyProposal(id);
}
