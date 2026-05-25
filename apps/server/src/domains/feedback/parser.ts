import {
  improvementTargetKindSchema,
  type ImprovementTargetKind,
} from "@opspilot/shared-types";
import { z } from "zod";
import { extractJsonObject } from "../assist/claude.js";
import { getLastAssistantText } from "../run/repository.js";

const proposalItemSchema = z.object({
  targetKind: improvementTargetKindSchema,
  targetPath: z.string().min(1),
  rationale: z.string(),
  content: z.string(),
});

const proposalOutputSchema = z.object({
  proposals: z.array(proposalItemSchema).max(2),
});

export interface ParsedProposal {
  targetKind: ImprovementTargetKind;
  targetPath: string;
  rationale: string;
  content: string;
}

export type ParseProposalsResult =
  | { ok: true; proposals: ParsedProposal[] }
  | { ok: false; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join(".") : "root"}: ${i.message}`)
    .join("; ");
}

/** run trace 마지막 assistant JSON block → proposals. */
export function parseProposalsFromRun(runId: string): ParseProposalsResult {
  const text = getLastAssistantText(runId);
  if (!text) {
    return { ok: false, error: "proposal JSON parse failed: no assistant text in run trace" };
  }
  try {
    const obj = extractJsonObject(text);
    const parsed = proposalOutputSchema.safeParse(obj);
    if (!parsed.success) {
      return {
        ok: false,
        error: `proposal JSON parse failed: ${formatZodError(parsed.error)}`,
      };
    }
    return { ok: true, proposals: parsed.data.proposals };
  } catch (e) {
    return {
      ok: false,
      error: `proposal JSON parse failed: ${(e as Error).message.slice(0, 300)}`,
    };
  }
}
