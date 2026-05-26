import type { IngestBundleListItem } from "@opspilot/shared-types";

export type ListPipelineChipState = "done" | "active" | "error" | "skipped" | "upcoming";

export interface ListPipelineChip {
  id: string;
  label: string;
  state: ListPipelineChipState;
}

/** 목록 한 줄용 — eval · review · HITL · 반영 단계 요약. */
export function deriveIngestListPipeline(
  item: Pick<
    IngestBundleListItem,
    | "status"
    | "evalRunId"
    | "reviewRunId"
    | "draftProposalCount"
    | "approvedProposalCount"
    | "appliedProposalCount"
  >,
): ListPipelineChip[] {
  const chips: ListPipelineChip[] = [];

  chips.push(deriveEvalChip(item));
  chips.push(deriveReviewChip(item));
  chips.push(deriveHitlChip(item));
  chips.push(deriveApplyChip(item));

  return chips;
}

function deriveEvalChip(
  item: Pick<IngestBundleListItem, "status" | "evalRunId">,
): ListPipelineChip {
  if (item.status === "evaluating") {
    return { id: "eval", label: "eval …", state: "active" };
  }
  if (item.status === "failed" && item.evalRunId != null) {
    return { id: "eval", label: "eval ✗", state: "error" };
  }
  if (item.evalRunId != null || item.status !== "pending") {
    return { id: "eval", label: "eval ✓", state: "done" };
  }
  return { id: "eval", label: "eval", state: "upcoming" };
}

function deriveReviewChip(
  item: Pick<IngestBundleListItem, "status" | "reviewRunId">,
): ListPipelineChip {
  if (item.status === "reviewing") {
    return { id: "review", label: "review …", state: "active" };
  }
  if (item.status === "reviewed") {
    return { id: "review", label: "review ✓", state: "done" };
  }
  if (item.reviewRunId != null && item.status === "failed") {
    return { id: "review", label: "review ✗", state: "error" };
  }
  if (item.reviewRunId != null) {
    return { id: "review", label: "review ✓", state: "done" };
  }
  if (item.status === "done") {
    return { id: "review", label: "review —", state: "skipped" };
  }
  return { id: "review", label: "review", state: "upcoming" };
}

function deriveHitlChip(
  item: Pick<IngestBundleListItem, "draftProposalCount" | "status">,
): ListPipelineChip {
  const n = item.draftProposalCount;
  if (n > 0 && (item.status === "done" || item.status === "reviewed")) {
    return { id: "hitl", label: `draft ${String(n)}`, state: "active" };
  }
  if (n === 0 && (item.status === "done" || item.status === "reviewed")) {
    return { id: "hitl", label: "HITL ✓", state: "done" };
  }
  return { id: "hitl", label: "HITL", state: "upcoming" };
}

function deriveApplyChip(
  item: Pick<IngestBundleListItem, "approvedProposalCount" | "appliedProposalCount">,
): ListPipelineChip {
  const approved = item.approvedProposalCount ?? 0;
  const applied = item.appliedProposalCount ?? 0;
  if (approved > 0) {
    return { id: "apply", label: `승인 ${String(approved)}`, state: "active" };
  }
  if (applied > 0) {
    return { id: "apply", label: `반영 ${String(applied)}`, state: "done" };
  }
  return { id: "apply", label: "반영", state: "upcoming" };
}
