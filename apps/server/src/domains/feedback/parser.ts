import {
  improvementTargetKindSchema,
  type ImprovementTargetKind,
} from "@opspilot/shared-types";
import { z } from "zod";
import { extractJsonObject, extractLastFencedJson } from "../assist/claude.js";
import { listAssistantTextsNewestFirst } from "../run/repository.js";

const proposalItemSchema = z.object({
  targetKind: improvementTargetKindSchema,
  targetPath: z.string().min(1),
  rationale: z.string(),
  content: z.string().min(1),
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

function contentMissingHint(error: z.ZodError): string {
  const missingContent = error.issues.some(
    (i) => i.path.includes("content") || String(i.message).includes("content"),
  );
  return missingContent
    ? " (work-evaluator JSON에 content=적용 가능한 파일 전체 본문 필수 — rationale만 있으면 실패)"
    : "";
}

function looksLikeProposalOutput(obj: unknown): boolean {
  return obj !== null && typeof obj === "object" && "proposals" in obj;
}

function tryParseProposalText(text: string): ParseProposalsResult | null {
  const candidates: unknown[] = [];
  const fenced = extractLastFencedJson(text);
  if (fenced !== null) candidates.push(fenced);
  try {
    candidates.push(extractJsonObject(text));
  } catch {
    // 이 assistant turn 에 파싱 가능한 JSON 객체 없음 — 다음 turn 시도.
  }

  for (const obj of candidates) {
    if (!looksLikeProposalOutput(obj)) continue;
    const parsed = proposalOutputSchema.safeParse(obj);
    if (parsed.success) return { ok: true, proposals: parsed.data.proposals };
    return {
      ok: false,
      error: `proposal JSON parse failed: ${formatZodError(parsed.error)}${contentMissingHint(parsed.error)}`,
    };
  }
  return null;
}

/** run trace assistant turn(s) 에서 proposals JSON → 파싱. 마지막 turn 만이 아니라 전 turn 역순 검색. */
export function parseProposalsFromRun(runId: string): ParseProposalsResult {
  const texts = listAssistantTextsNewestFirst(runId);
  if (texts.length === 0) {
    return { ok: false, error: "proposal JSON parse failed: no assistant text in run trace" };
  }

  for (const text of texts) {
    const parsed = tryParseProposalText(text);
    if (parsed !== null) return parsed;
  }

  return {
    ok: false,
    error:
      "proposal JSON parse failed: trace에 ```json { \"proposals\": [...] } ``` block 없음 — " +
      "assistant가 JSON을 선언만 하고 출력하지 않음. 시나리오대로 마지막에 JSON code fence 필수",
  };
}
