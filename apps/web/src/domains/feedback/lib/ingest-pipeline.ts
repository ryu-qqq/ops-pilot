import type { IngestBundleDetail } from "@opspilot/shared-types";

export type PipelineStepState = "upcoming" | "active" | "done" | "skipped" | "error";

export interface PipelineStep {
  id: string;
  label: string;
  state: PipelineStepState;
  detail?: string;
}

export interface PipelineSummary {
  steps: PipelineStep[];
  nextAction: string | null;
}

export function deriveIngestPipeline(data: IngestBundleDetail): PipelineSummary {
  const { status, proposals, contextJson: ctx } = data;
  const drafts = proposals.filter((p) => p.status === "draft");
  const approved = proposals.filter((p) => p.status === "approved");
  const applied = proposals.filter((p) => p.status === "applied");
  const rejected = proposals.filter((p) => p.status === "rejected");
  const hasProposals = proposals.length > 0;
  const evalFailed = ctx.evalError !== undefined || (status === "failed" && !ctx.reviewError);

  const ingest: PipelineStep = {
    id: "ingest",
    label: "Ingest",
    state: status === "pending" ? "active" : "done",
  };

  let evalState: PipelineStepState = "upcoming";
  let evalDetail: string | undefined;
  if (status === "evaluating") {
    evalState = "active";
    evalDetail = "work-evaluator";
  } else if (ctx.evalError !== undefined) {
    evalState = "error";
    evalDetail = truncate(ctx.evalError, 72);
  } else if (status !== "pending") {
    evalState = "done";
    evalDetail = hasProposals ? `개선안 ${String(proposals.length)}건` : "개선안 없음";
  }

  let reviewState: PipelineStepState = "upcoming";
  let reviewDetail: string | undefined;
  if (ctx.skipReviewReason !== undefined) {
    reviewState = "skipped";
    reviewDetail = truncate(ctx.skipReviewReason, 56);
  } else if (status === "reviewing") {
    reviewState = "active";
    reviewDetail = "proposal-reviewer";
  } else if (status === "reviewed") {
    reviewState = "done";
    reviewDetail = ctx.reviewSummary !== undefined ? truncate(ctx.reviewSummary, 48) : undefined;
  } else if (ctx.reviewError !== undefined) {
    reviewState = "error";
    reviewDetail = truncate(ctx.reviewError, 72);
  } else if (evalState === "done" && !hasProposals) {
    reviewState = "skipped";
    reviewDetail = "draft 없음";
  } else if (evalState === "done" && hasProposals && status === "done" && drafts.length === 0) {
    reviewState = "done";
  }

  let hitlState: PipelineStepState = "upcoming";
  let hitlDetail: string | undefined;
  if (evalFailed || (!hasProposals && evalState === "done")) {
    hitlState = "skipped";
  } else if (drafts.length > 0 && (status === "done" || status === "reviewed")) {
    hitlState = "active";
    hitlDetail = `draft ${String(drafts.length)}건`;
  } else if (hasProposals && drafts.length === 0) {
    hitlState = "done";
    hitlDetail = `${String(approved.length + applied.length)}승인 · ${String(rejected.length)}거절`;
  }

  let applyState: PipelineStepState = "upcoming";
  let applyDetail: string | undefined;
  if (approved.length > 0) {
    applyState = "active";
    applyDetail = `${String(approved.length)}건 대기`;
  } else if (applied.length > 0) {
    applyState = "done";
    applyDetail = `${String(applied.length)}건 반영됨`;
  } else if (hasProposals && drafts.length === 0 && approved.length === 0) {
    applyState = "skipped";
    applyDetail = "승인안 없음";
  } else if (!hasProposals && evalState === "done") {
    applyState = "skipped";
  }

  const steps: PipelineStep[] = [
    ingest,
    { id: "eval", label: "Eval", state: evalState, detail: evalDetail },
    { id: "review", label: "Review", state: reviewState, detail: reviewDetail },
    { id: "hitl", label: "HITL", state: hitlState, detail: hitlDetail },
    { id: "apply", label: "반영", state: applyState, detail: applyDetail },
  ];

  const nextAction = deriveNextAction(data, {
    drafts,
    approved,
    applied,
    hasProposals,
    evalFailed,
  });

  return { steps, nextAction };
}

function deriveNextAction(
  data: IngestBundleDetail,
  ctx: {
    drafts: IngestBundleDetail["proposals"];
    approved: IngestBundleDetail["proposals"];
    applied: IngestBundleDetail["proposals"];
    hasProposals: boolean;
    evalFailed: boolean;
  },
): string | null {
  const { status, contextJson: cj } = data;
  const { drafts, approved, applied, hasProposals, evalFailed } = ctx;

  if (status === "pending") return "eval이 곧 시작됩니다…";
  if (status === "evaluating") return "「eval 실시간 트레이스」로 work-evaluator 진행을 확인하세요.";
  if (status === "reviewing") return "「review 트레이스」로 proposal-reviewer 진행을 확인하세요.";
  if (evalFailed) return "eval 오류 — 「eval 재처리」를 시도하거나 트레이스를 확인하세요.";
  if (cj.reviewError !== undefined) {
    return "review 오류 — 「review 재처리」 또는 「review 시작」을 시도하세요.";
  }
  if (drafts.length > 0 && (status === "done" || status === "reviewed")) {
    return `아래 개선안 ${String(drafts.length)}건을 검토하고 승인/거절하세요.`;
  }
  if (approved.length > 0) {
    return `승인된 ${String(approved.length)}건을 「clone에 반영」하세요.`;
  }
  if (applied.length > 0 && drafts.length === 0 && approved.length === 0) {
    return "이 ingest 처리가 완료되었습니다.";
  }
  if (!hasProposals && status === "done") {
    return "개선안이 없습니다 — eval 트레이스에서 evaluator 출력을 확인하세요.";
  }
  if (cj.skipReviewReason !== undefined && drafts.length > 0 && status === "done") {
    return "자동 review가 건너뛰어졌습니다 — 「review 시작」 또는 draft를 직접 HITL하세요.";
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
