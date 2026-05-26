import type { ImprovementProposal, ProposalReviewItem } from "@opspilot/shared-types";

/** 서버 안전망 — agent 가 autoApply=true 를 줘도 workflow_patch 는 기본 차단. */
export function shouldAutoApply(
  review: ProposalReviewItem,
  proposal: ImprovementProposal,
): boolean {
  if (review.decision !== "approve") return false;
  if (!review.autoApply) return false;
  if (review.risk === "high") return false;
  if (review.confidence === "low") return false;

  if (proposal.targetKind === "workflow_patch") {
    return process.env.OPS_FEEDBACK_AUTO_APPLY_WORKFLOW === "1";
  }

  return true;
}
