import type { FeedbackIngestRequest, IngestBundleDetail, ReviewProposalRequest } from "@opspilot/shared-types";
import { readAgentCrewLock } from "../agent-crew/sync.js";
import { getProject } from "../project/repository.js";
import {
  collectCommitDiff,
  DEFAULT_MAX_DIFF_BYTES,
  resolveCommitMeta,
  resolveCommitSubject,
} from "./diff.js";
import { assertCommitSubjectForIngest } from "./commit-format.js";
import { classifyProposalTarget } from "./classify-target.js";
import { queueFeedbackEval, reprocessFeedbackEval, type FeedbackEvalSource } from "./eval-queue.js";
import { queueProposalReview, reprocessProposalReview } from "./review-queue.js";
import { createIngestBundle, createImprovementProposal, getIngestBundle, listIngestBundlesByProject, listProposalsByIngestId } from "./repository.js";
import { readTranscriptExcerpt } from "./transcript.js";
import { getAutoEval } from "../setting/repository.js";
import { getDb } from "../../db/index.js";

export class FeedbackIngestError extends Error {
  constructor(
    readonly code:
      | "NotFound"
      | "InvalidGitRef"
      | "TranscriptReadError"
      | "EvalSetupError"
      | "InvalidCommitSubject",
    message: string,
  ) {
    super(message);
    this.name = "FeedbackIngestError";
  }
}

export function ingestFeedback(input: FeedbackIngestRequest): IngestBundleDetail {
  const project = getProject(input.projectId);
  if (!project) {
    throw new FeedbackIngestError("NotFound", "project not found");
  }

  const maxDiffBytes = input.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
  let diffSummary: string;
  let diffTruncated = false;
  try {
    const collected = collectCommitDiff(project.clonePath, input.gitRef, maxDiffBytes);
    diffSummary = collected.diffSummary;
    diffTruncated = collected.truncated;
  } catch {
    throw new FeedbackIngestError("InvalidGitRef", `git ref not found: ${input.gitRef}`);
  }

  const contextJson: IngestBundleDetail["contextJson"] = {};
  if (input.retro) contextJson.retro = input.retro;
  if (diffTruncated) contextJson.diffTruncated = true;
  const commitSubject = resolveCommitSubject(project.clonePath, input.gitRef);
  if (commitSubject) {
    const subjectError = assertCommitSubjectForIngest(project.clonePath, commitSubject);
    if (subjectError) {
      throw new FeedbackIngestError("InvalidCommitSubject", subjectError);
    }
    contextJson.commitSubject = commitSubject;
  }
  // 작업 목록 표시용 커밋 메타(날짜·저자). git 조회 실패는 빈값 → 저장 생략(graceful).
  const commitMeta = resolveCommitMeta(project.clonePath, input.gitRef);
  if (commitMeta.committedAt) contextJson.commitDate = commitMeta.committedAt;
  if (commitMeta.author) contextJson.commitAuthor = commitMeta.author;

  if (input.transcriptPath) {
    try {
      contextJson.transcriptExcerpt = readTranscriptExcerpt(input.transcriptPath);
    } catch {
      throw new FeedbackIngestError(
        "TranscriptReadError",
        `cannot read transcript: ${input.transcriptPath}`,
      );
    }
  }

  const bundle = createIngestBundle({
    projectId: project.id,
    notionTaskUrl: input.notionTaskUrl ?? null,
    gitRef: input.gitRef,
    diffSummary,
    contextJson,
    status: "pending",
    trigger: input.trigger,
  });

  // 자동 평가 off(기본)면 ingest 는 pending 으로 유입만 하고 멈춘다.
  // 사람이 작업 상세에서 수동으로 평가(evaluateFeedbackIngest)한다.
  if (getAutoEval()) queueFeedbackEval(bundle.id, input.evalSource);

  const updated = getIngestDetail(bundle.id);
  if (!updated) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after eval queue");
  }
  return updated;
}

export function getIngestDetail(id: string): IngestBundleDetail | undefined {
  const bundle = getIngestBundle(id);
  if (!bundle) return undefined;
  const project = getProject(bundle.projectId);
  const lock = project ? readAgentCrewLock(project.clonePath) : null;
  const proposals = listProposalsByIngestId(id).map((p) => ({
    ...p,
    crewBound: classifyProposalTarget(lock, p.targetKind, p.targetPath) === "crew",
  }));
  return { ...bundle, proposals };
}

export function listIngestsByProject(projectId: string) {
  const project = getProject(projectId);
  if (!project) {
    throw new FeedbackIngestError("NotFound", "project not found");
  }
  return listIngestBundlesByProject(projectId).map((row) => {
    if (row.commitSubject != null && row.commitSubject.trim() !== "") return row;
    const subject = resolveCommitSubject(project.clonePath, row.gitRef);
    return subject ? { ...row, commitSubject: subject } : row;
  });
}

export async function reprocessFeedbackIngest(id: string): Promise<IngestBundleDetail> {
  const bundle = getIngestBundle(id);
  if (!bundle) {
    throw new FeedbackIngestError("NotFound", "ingest bundle not found");
  }
  try {
    await reprocessFeedbackEval(id);
  } catch (e) {
    throw new FeedbackIngestError("EvalSetupError", (e as Error).message);
  }
  const detail = getIngestDetail(id);
  if (!detail) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after reprocess");
  }
  return detail;
}

/**
 * 수동 평가(pending → eval). 자동 평가 off 일 때 사람이 고른 ingest 만 평가 큐에 올린다.
 * reprocess 계열은 evalRunId 가 있어야 동작해 pending 엔 못 쓰므로 별도 경로.
 * 이미 평가중/완료/검토 단계면 거부 — pending 만 허용.
 */
export function evaluateFeedbackIngest(id: string): IngestBundleDetail {
  const bundle = getIngestBundle(id);
  if (!bundle) {
    throw new FeedbackIngestError("NotFound", "ingest bundle not found");
  }
  if (bundle.status !== "pending") {
    throw new FeedbackIngestError(
      "EvalSetupError",
      `이미 평가가 시작된 작업입니다 (status: ${bundle.status})`,
    );
  }
  const evalSource: FeedbackEvalSource = bundle.contextJson.evalSource ?? "local-claude";
  queueFeedbackEval(id, evalSource);
  const detail = getIngestDetail(id);
  if (!detail) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after eval queue");
  }
  return detail;
}

export function reviewFeedbackIngest(
  id: string,
  evalSource: FeedbackEvalSource = "local-claude",
): IngestBundleDetail {
  const bundle = getIngestBundle(id);
  if (!bundle) {
    throw new FeedbackIngestError("NotFound", "ingest bundle not found");
  }
  if (bundle.status === "reviewing") {
    throw new FeedbackIngestError("EvalSetupError", "review already in progress");
  }
  queueProposalReview(id, evalSource);
  const detail = getIngestDetail(id);
  if (!detail) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after review queue");
  }
  return detail;
}

export async function reprocessReviewFeedbackIngest(id: string): Promise<IngestBundleDetail> {
  const bundle = getIngestBundle(id);
  if (!bundle) {
    throw new FeedbackIngestError("NotFound", "ingest bundle not found");
  }
  try {
    await reprocessProposalReview(id);
  } catch (e) {
    throw new FeedbackIngestError("EvalSetupError", (e as Error).message);
  }
  const detail = getIngestDetail(id);
  if (!detail) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after review reprocess");
  }
  return detail;
}

/**
 * PR 리뷰 출처 기반 ingest — eval 스킵(사람이 이미 판단).
 * ingest_trigger='pr_review', status='done' 번들 + 'draft' proposal을 단일 트랜잭션으로 생성.
 */
export function ingestReviewProposal(
  input: ReviewProposalRequest,
): { ingestId: string; proposalId: string } {
  if (!getProject(input.projectId)) {
    throw new FeedbackIngestError("NotFound", `project not found: ${input.projectId}`);
  }
  return getDb().transaction(() => {
    const bundle = createIngestBundle({
      projectId: input.projectId,
      notionTaskUrl: null,
      gitRef: `pr-${input.review.prNumber}`,
      diffSummary: `PR #${input.review.prNumber}: ${input.review.mistakeType}`,
      contextJson: { review: input.review, scenarioId: input.scenarioId ?? null },
      trigger: "pr_review",
      status: "done",
    });
    const proposal = createImprovementProposal({
      ingestId: bundle.id,
      runId: null,
      targetKind: input.targetKind,
      targetPath: input.targetPath,
      rationale: input.rationale,
      content: input.content,
    });
    return { ingestId: bundle.id, proposalId: proposal.id };
  })();
}
