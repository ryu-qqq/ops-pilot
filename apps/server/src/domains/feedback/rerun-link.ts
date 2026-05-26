import type { Run } from "@opspilot/shared-types";
import { getIngestBundle, mergeIngestContext, updateIngestStatus } from "./repository.js";

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

/** Runs 탭 rerun — retro 에 feedbackIngestId 가 있으면 ingest 의 eval/review run id 를 새 run 으로 갱신. */
export function relinkFeedbackRunOnRerun(oldRun: Run, newRunId: string): void {
  const retro = parseFeedbackRetro(oldRun.retro);
  if (!retro?.feedbackIngestId) return;

  const ingest = getIngestBundle(retro.feedbackIngestId);
  if (!ingest) return;

  if (retro.feedbackPhase === "review") {
    mergeIngestContext(retro.feedbackIngestId, {
      reviewRunId: newRunId,
      reviewError: undefined,
      skipReviewReason: undefined,
    });
    updateIngestStatus(retro.feedbackIngestId, "reviewing");
    return;
  }

  mergeIngestContext(retro.feedbackIngestId, {
    evalRunId: newRunId,
    evalError: undefined,
  });
  updateIngestStatus(retro.feedbackIngestId, "evaluating");
}
