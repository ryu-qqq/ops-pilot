import { readFileSync } from "node:fs";

export const DEFAULT_TRANSCRIPT_EXCERPT_BYTES = 32 * 1024;

/** 로컬 절대경로 transcript — 발췌만 읽는다(전체 dump 금지). */
export function readTranscriptExcerpt(
  transcriptPath: string,
  maxBytes = DEFAULT_TRANSCRIPT_EXCERPT_BYTES,
): string {
  const raw = readFileSync(transcriptPath, "utf8");
  if (raw.length <= maxBytes) return raw;
  return raw.slice(0, maxBytes);
}
