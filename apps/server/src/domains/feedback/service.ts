import type { FeedbackIngestRequest, IngestBundleDetail } from "@opspilot/shared-types";
import { getProject } from "../project/repository.js";
import { collectCommitDiff, DEFAULT_MAX_DIFF_BYTES } from "./diff.js";
import { queueFeedbackEval } from "./eval-queue.js";
import { createIngestBundle, getIngestBundle, listIngestBundlesByProject, listProposalsByIngestId } from "./repository.js";
import { readTranscriptExcerpt } from "./transcript.js";

export class FeedbackIngestError extends Error {
  constructor(
    readonly code: "NotFound" | "InvalidGitRef" | "TranscriptReadError" | "EvalSetupError",
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
  });

  queueFeedbackEval(bundle.id, input.evalSource);

  const updated = getIngestDetail(bundle.id);
  if (!updated) {
    throw new FeedbackIngestError("EvalSetupError", "ingest row lost after eval queue");
  }
  return updated;
}

export function getIngestDetail(id: string): IngestBundleDetail | undefined {
  const bundle = getIngestBundle(id);
  if (!bundle) return undefined;
  return { ...bundle, proposals: listProposalsByIngestId(id) };
}

export function listIngestsByProject(projectId: string) {
  const project = getProject(projectId);
  if (!project) {
    throw new FeedbackIngestError("NotFound", "project not found");
  }
  return listIngestBundlesByProject(projectId);
}
