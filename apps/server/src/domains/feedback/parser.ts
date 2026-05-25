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

/** run trace 마지막 assistant JSON block → proposals. 파싱 실패 시 null. */
export function parseProposalsFromRun(runId: string): ParsedProposal[] | null {
  const text = getLastAssistantText(runId);
  if (!text) return null;
  try {
    const obj = extractJsonObject(text);
    const parsed = proposalOutputSchema.safeParse(obj);
    if (!parsed.success) return null;
    return parsed.data.proposals;
  } catch {
    return null;
  }
}
