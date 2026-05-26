import type { ProposalReviewItem, ProposalReviewMeta, Scenario } from "@opspilot/shared-types";
import { getProject } from "../project/repository.js";
import { listAssets, listVersions } from "../registry/repository.js";
import { RunInputError, startRun } from "../run/service.js";
import { fixtureSource, localClaudeSource } from "../run/source.js";
import { getRun } from "../run/repository.js";
import {
  createScenario,
  getScenarioByAssetAndName,
  updateScenario,
} from "../scenario/repository.js";
import type { FeedbackEvalSource } from "./eval-queue.js";
import { applyProposal, approveProposal, rejectProposal } from "./proposal-service.js";
import { parseReviewFromRun } from "./review-parser.js";
import { shouldAutoApply } from "./review-policy.js";
import { buildReviewFixtureText, reviewFixtureEvents } from "./review-fixture.js";
import {
  FEEDBACK_REVIEW_SCENARIO_NAME,
  buildProposalReviewScenarioInput,
} from "./review-scenario-template.js";
import {
  getImprovementProposal,
  getIngestBundle,
  listProposalsByIngestId,
  mergeIngestContext,
  updateIngestStatus,
  updateProposalContent,
} from "./repository.js";

interface ReviewAsset {
  assetId: string;
  versionId: string;
}

interface FeedbackRetro {
  feedbackIngestId?: string;
  feedbackPhase?: string;
}

function parseFeedbackRetro(retro: string | null | undefined): FeedbackRetro | null {
  if (!retro) return null;
  try {
    return JSON.parse(retro) as FeedbackRetro;
  } catch {
    return null;
  }
}

function markReviewFailed(ingestId: string, reason: string): void {
  mergeIngestContext(ingestId, { reviewError: reason });
  updateIngestStatus(ingestId, "done");
}

function findProposalReviewer(projectId: string): ReviewAsset | null {
  const asset = listAssets(projectId).find(
    (a) => a.kind === "agent" && a.name === "proposal-reviewer",
  );
  if (!asset) return null;
  const versions = listVersions(asset.id);
  const latest = versions[0];
  if (!latest) return null;
  return { assetId: asset.id, versionId: latest.id };
}

function upsertReviewScenario(assetId: string, input: string): Scenario {
  const existing = getScenarioByAssetAndName(assetId, FEEDBACK_REVIEW_SCENARIO_NAME);
  if (existing) {
    const updated = updateScenario(existing.id, {
      input,
      description: "TASK-5 — proposal-reviewer ingest 치환 시나리오",
    });
    if (!updated) throw new Error("scenario update failed");
    return updated;
  }
  return createScenario({
    assetId,
    name: FEEDBACK_REVIEW_SCENARIO_NAME,
    description: "TASK-5 — proposal-reviewer ingest 치환 시나리오",
    input,
    expectation: {},
  });
}

function reviewMetaFromItem(item: ProposalReviewItem): ProposalReviewMeta {
  return {
    decision: item.decision,
    confidence: item.confidence,
    risk: item.risk,
    autoApply: item.autoApply,
    rationale: item.rationale,
    conflicts: item.conflicts,
  };
}

/** eval 완료 후 proposal-reviewer run 큐. agent 없으면 skip. */
export function queueProposalReview(
  ingestId: string,
  evalSource: FeedbackEvalSource = "local-claude",
): void {
  const bundle = getIngestBundle(ingestId);
  if (!bundle) return;

  const drafts = listProposalsByIngestId(ingestId).filter((p) => p.status === "draft");
  if (drafts.length === 0) {
    mergeIngestContext(ingestId, { skipReviewReason: "no draft proposals" });
    return;
  }

  const project = getProject(bundle.projectId);
  if (!project) {
    markReviewFailed(ingestId, "project not found");
    return;
  }

  const reviewAsset = findProposalReviewer(project.id);
  if (!reviewAsset) {
    mergeIngestContext(ingestId, {
      skipReviewReason: "proposal-reviewer agent not found — sync_agent_crew 후 scan_project",
    });
    return;
  }

  let scenario: Scenario;
  try {
    scenario = upsertReviewScenario(
      reviewAsset.assetId,
      buildProposalReviewScenarioInput(bundle, project.name, project.clonePath, drafts),
    );
  } catch (e) {
    markReviewFailed(ingestId, `review scenario upsert failed: ${(e as Error).message}`);
    return;
  }

  updateIngestStatus(ingestId, "reviewing");

  const fixtureText = buildReviewFixtureText(drafts);
  const source =
    evalSource === "fixture"
      ? fixtureSource(reviewFixtureEvents(fixtureText))
      : localClaudeSource();

  try {
    const run = startRun({
      assetVersionId: reviewAsset.versionId,
      scenarioId: scenario.id,
      source,
      retro: JSON.stringify({ feedbackIngestId: ingestId, feedbackPhase: "review" }),
    });
    mergeIngestContext(ingestId, {
      reviewRunId: run.id,
      reviewError: undefined,
      skipReviewReason: undefined,
    });
  } catch (e) {
    const msg = e instanceof RunInputError ? e.message : (e as Error).message;
    markReviewFailed(ingestId, `review startRun failed: ${msg}`);
  }
}

async function applyReviewItem(
  ingestId: string,
  item: ProposalReviewItem,
  meta: ProposalReviewMeta,
): Promise<ProposalReviewMeta> {
  const proposal = getImprovementProposal(item.proposalId);
  if (!proposal || proposal.ingestId !== ingestId) {
    return { ...meta, applyError: "proposal not found for ingest" };
  }

  if (proposal.status === "applied") {
    return { ...meta, applied: true };
  }

  if (item.decision === "reject") {
    if (proposal.status === "draft") rejectProposal(item.proposalId);
    return meta;
  }

  if (proposal.status === "rejected") {
    return { ...meta, applyError: "proposal already rejected" };
  }

  if (proposal.status === "draft") {
    if (item.decision === "revise") {
      if (item.revisedContent !== undefined && item.revisedContent.trim() !== "") {
        updateProposalContent(item.proposalId, item.revisedContent);
      } else {
        rejectProposal(item.proposalId);
        return { ...meta, rationale: `${meta.rationale} (revise without content → rejected)` };
      }
    }
    approveProposal(item.proposalId);
  } else if (proposal.status !== "approved") {
    return { ...meta, applyError: `unexpected proposal status (${proposal.status})` };
  }

  const current = getImprovementProposal(item.proposalId);
  if (!current) {
    return { ...meta, applyError: "proposal missing after approve" };
  }

  if (!shouldAutoApply(item, current)) {
    return meta;
  }

  try {
    const result = applyProposal(item.proposalId);
    return {
      ...meta,
      applied: true,
      applyError: undefined,
      rationale: `${meta.rationale} · applied ${result.appliedCommit.slice(0, 8)}`,
    };
  } catch (e) {
    return { ...meta, applyError: (e as Error).message.slice(0, 300) };
  }
}

/** review run 종료 → approve/reject/apply 정책 실행. */
export async function handleProposalReviewRunCompleted(runId: string): Promise<void> {
  const run = getRun(runId);
  const retro = parseFeedbackRetro(run?.retro);
  if (!retro || retro.feedbackPhase !== "review") return;

  const ingestId = retro.feedbackIngestId;
  if (!ingestId) return;

  const ingest = getIngestBundle(ingestId);
  if (!ingest || ingest.status !== "reviewing") return;

  if (run?.status === "failed") {
    markReviewFailed(ingestId, run.error ?? "review run failed");
    return;
  }

  if (run?.status !== "succeeded") return;

  const parsed = parseReviewFromRun(runId);
  if (!parsed.ok) {
    markReviewFailed(ingestId, parsed.error);
    return;
  }

  const proposalReviews: Record<string, ProposalReviewMeta> = {};
  for (const item of parsed.review.reviews) {
    const meta = reviewMetaFromItem(item);
    proposalReviews[item.proposalId] = await applyReviewItem(ingestId, item, meta);
  }

  mergeIngestContext(ingestId, {
    reviewSummary: parsed.review.summary,
    reviewError: undefined,
    skipReviewReason: undefined,
    proposalReviews,
  });
  updateIngestStatus(ingestId, "reviewed");
}

/** review run 은 끝났으나 후처리만 실패한 경우 재파싱. */
export async function reprocessProposalReview(ingestId: string): Promise<void> {
  const ingest = getIngestBundle(ingestId);
  if (!ingest) throw new Error("ingest not found");

  const reviewRunId = ingest.contextJson.reviewRunId;
  if (!reviewRunId) throw new Error("reviewRunId 없음");

  const run = getRun(reviewRunId);
  if (!run) throw new Error("review run not found");
  if (run.status === "running") throw new Error("review run still running");

  updateIngestStatus(ingestId, "reviewing");
  await handleProposalReviewRunCompleted(reviewRunId);
}
