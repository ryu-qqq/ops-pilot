import { proposalReviewOutputSchema, type ProposalReviewOutput } from "@opspilot/shared-types";
import type { z } from "zod";
import { extractJsonObject, extractLastFencedJson } from "../assist/claude.js";
import { listAssistantTextsNewestFirst } from "../run/repository.js";

export type ParseReviewResult =
  | { ok: true; review: ProposalReviewOutput }
  | { ok: false; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join(".") : "root"}: ${i.message}`)
    .join("; ");
}

function riskHint(error: z.ZodError): string {
  const badRisk = error.issues.some((i) => i.path.includes("risk"));
  return badRisk ? " (risk 는 low 또는 high 만 — medium 은 high 로 매핑)" : "";
}

/** proposal-reviewer 가 medium 등을 쓰면 서버 안전망 — 스키마는 low|high. */
function normalizeReviewPayload(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  const root = obj as { reviews?: unknown[]; summary?: string };
  if (!Array.isArray(root.reviews)) return obj;
  return {
    ...root,
    reviews: root.reviews.map((item) => {
      if (item === null || typeof item !== "object") return item;
      const review = item as { risk?: string };
      if (review.risk === "medium") return { ...review, risk: "high" };
      return item;
    }),
  };
}

function looksLikeReviewOutput(obj: unknown): boolean {
  return obj !== null && typeof obj === "object" && "reviews" in obj;
}

function tryParseReviewText(text: string): ParseReviewResult | null {
  const candidates: unknown[] = [];
  const fenced = extractLastFencedJson(text);
  if (fenced !== null) candidates.push(normalizeReviewPayload(fenced));
  try {
    candidates.push(normalizeReviewPayload(extractJsonObject(text)));
  } catch {
    // 이 turn 에 JSON 없음
  }

  for (const obj of candidates) {
    if (!looksLikeReviewOutput(obj)) continue;
    const parsed = proposalReviewOutputSchema.safeParse(obj);
    if (parsed.success) return { ok: true, review: parsed.data };
    return {
      ok: false,
      error: `review JSON parse failed: ${formatZodError(parsed.error)}${riskHint(parsed.error)}`,
    };
  }
  return null;
}

/** proposal-reviewer run trace → review JSON. 마지막 turn 만이 아니라 전 turn 역순 검색. */
export function parseReviewFromRun(runId: string): ParseReviewResult {
  const texts = listAssistantTextsNewestFirst(runId);
  if (texts.length === 0) {
    return { ok: false, error: "review JSON parse failed: no assistant text in run trace" };
  }

  for (const text of texts) {
    const parsed = tryParseReviewText(text);
    if (parsed !== null) return parsed;
  }

  return {
    ok: false,
    error:
      "review JSON parse failed: trace에 ```json { \"reviews\": [...] } ``` block 없음 — " +
      "proposal-reviewer 마지막 출력에 JSON fence 필수",
  };
}
