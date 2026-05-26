/** feedback ingest 파이프라인 run — retro JSON 에 feedbackIngestId 가 있음. */
export function isFeedbackPipelineRun(retro: string | null | undefined): boolean {
  if (!retro) return false;
  try {
    const parsed = JSON.parse(retro) as { feedbackIngestId?: string };
    return parsed.feedbackIngestId != null;
  } catch {
    return false;
  }
}

export function feedbackPipelinePhase(
  retro: string | null | undefined,
): "eval" | "review" | null {
  if (!retro || !isFeedbackPipelineRun(retro)) return null;
  try {
    const parsed = JSON.parse(retro) as { feedbackPhase?: string };
    return parsed.feedbackPhase === "review" ? "review" : "eval";
  } catch {
    return "eval";
  }
}
