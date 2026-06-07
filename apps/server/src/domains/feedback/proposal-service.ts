import type {
  FeedbackProposalApplyResponse,
  ImprovementProposal,
  ImprovementProposalStatus,
  ProposalWithSource,
} from "@opspilot/shared-types";
import { readAgentCrewLock } from "../agent-crew/sync.js";
import { applyClaudeRulesBridge } from "../harness-bridge/claude-rules-bridge.js";
import { maybeSyncCursorHarnessAfterApply } from "../harness-bridge/service.js";
import { getProject } from "../project/repository.js";
import { FeedbackApplyError, applyProposalToProject } from "./apply.js";
import { classifyProposalTarget, UpstreamRequiredError } from "./classify-target.js";
import {
  getImprovementProposal,
  getIngestBundle,
  listProposalsByIngestId,
  listProposalsByProject,
  markProposalApplied,
  updateProposalStatus,
} from "./repository.js";

const BRIDGE_AFTER_APPLY_KINDS = new Set<ImprovementProposal["targetKind"]>([
  "agent",
  "skill",
  "command",
]);

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

/** 프로젝트 전역 proposal 큐. status 없으면 전체. crewBound 채워서 반환. */
export function listProposalsForProject(
  projectId: string,
  status?: ImprovementProposalStatus,
): ProposalWithSource[] {
  const rows = listProposalsByProject(projectId, status);
  const project = getProject(projectId);
  const lock = project ? readAgentCrewLock(project.clonePath) : null;
  return rows.map((p) => ({
    ...p,
    crewBound: classifyProposalTarget(lock, p.targetKind, p.targetPath) === "crew",
  }));
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
    if (e instanceof UpstreamRequiredError) throw e; // 상류행 — ApplyError 로 뭉개지 않음
    const msg = e instanceof FeedbackApplyError ? e.message : (e as Error).message;
    throw new FeedbackProposalError("ApplyError", msg);
  }

  const updated = markProposalApplied(id, appliedCommit);
  if (!updated) throw new FeedbackProposalError("NotFound", "proposal not found");
  // 역방향: cursor_rule 이 적용됐으면 Claude 가 그 룰을 읽도록 브릿지 설치 보장(멱등).
  if (proposal.targetKind === "cursor_rule") {
    try {
      applyClaudeRulesBridge(project.clonePath);
    } catch {
      // best-effort — 설치 실패가 apply 자체를 깨지 않게 한다.
    }
  }
  const bridgeResult =
    project.workspaceMode === "linked" && BRIDGE_AFTER_APPLY_KINDS.has(proposal.targetKind)
      ? maybeSyncCursorHarnessAfterApply(project)
      : null;
  return {
    proposal: updated,
    appliedCommit,
    ...(bridgeResult !== null
      ? {
          cursorHarnessSync: {
            dryRun: bridgeResult.dryRun,
            written: bridgeResult.written,
            commit: bridgeResult.commit,
            staleDerivedRules: bridgeResult.staleDerivedRules,
            ...(bridgeResult.skippedReason ? { skippedReason: bridgeResult.skippedReason } : {}),
          },
        }
      : {}),
  };
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
