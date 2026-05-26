import { proposalReviewOutputSchema, type ProposalReviewOutput } from "@opspilot/shared-types";
import type { z } from "zod";
import { extractJsonObject } from "../assist/claude.js";
import { getLastAssistantText } from "../run/repository.js";

export type ParseReviewResult =
  | { ok: true; review: ProposalReviewOutput }
  | { ok: false; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join(".") : "root"}: ${i.message}`)
    .join("; ");
}

/** proposal-reviewer run trace → review JSON. */
export function parseReviewFromRun(runId: string): ParseReviewResult {
  const text = getLastAssistantText(runId);
  if (!text) {
    return { ok: false, error: "review JSON parse failed: no assistant text in run trace" };
  }
  try {
    const obj = extractJsonObject(text);
    const parsed = proposalReviewOutputSchema.safeParse(obj);
    if (!parsed.success) {
      return {
        ok: false,
        error: `review JSON parse failed: ${formatZodError(parsed.error)}`,
      };
    }
    return { ok: true, review: parsed.data };
  } catch (e) {
    return {
      ok: false,
      error: `review JSON parse failed: ${(e as Error).message.slice(0, 300)}`,
    };
  }
}
