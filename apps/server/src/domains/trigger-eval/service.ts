import type {
  TriggerEvalResult,
  TriggerQueryResult,
} from "@opspilot/shared-types";
import {
  ClaudeAssistError,
  extractJsonObject,
  runClaudeOnce,
} from "../assist/claude.js";
import { getAsset, latestContent } from "../registry/repository.js";
import { type TriggerKind, probeTrigger } from "./probe.js";

// 트리거 정확도 평가 — description 이 켜져야 할 때 켜지고 아닐 때 안 켜지나 측정.
// T3(안 쓰는 자산)의 짝: 자산이 안 쓰이는 이유가 description 이 발화를 못 일으켜서인지 진단.

export class TriggerEvalError extends Error {}

/** 평가 입력 — should-trigger(켜져야 함) / should-NOT(near-miss) 라벨. */
export interface LabeledQuery {
  text: string;
  shouldTrigger: boolean;
}

export interface SuggestedQueries {
  positives: string[];
  negatives: string[];
}

function requireTriggerable(assetId: string): {
  kind: TriggerKind;
  name: string;
  content: string;
} {
  const asset = getAsset(assetId);
  if (!asset) throw new TriggerEvalError(`asset not found: ${assetId}`);
  if (asset.kind !== "agent" && asset.kind !== "skill") {
    throw new TriggerEvalError(
      `트리거 평가는 agent·skill 만 지원 (kind=${asset.kind})`,
    );
  }
  const content = latestContent(assetId);
  if (!content)
    throw new TriggerEvalError("자산 버전 내용 없음 — 먼저 스캔/저장 필요");
  return { kind: asset.kind, name: asset.name, content };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * 자산 description 기반으로 should-trigger / should-NOT(near-miss) 쿼리를 자동 생성.
 * near-miss = 키워드는 겹치지만 이 자산이 켜지면 안 되는 요청 (변별력 가장 높음).
 */
export async function suggestTriggerQueries(
  assetId: string,
  n = 5,
): Promise<SuggestedQueries> {
  const { kind, name, content } = requireTriggerable(assetId);
  const prompt = `당신은 Claude Code 자산의 트리거(자동 발화) 평가용 쿼리를 만든다.
아래는 ${kind === "skill" ? "스킬(SKILL.md)" : "에이전트(.md)"} "${name}" 의 정의다.

--- 자산 정의 ---
${content.slice(0, 4000)}
--- 끝 ---

두 종류의 현실적인 한국어 사용자 요청을 각 ${String(n)}개씩 만들어라.
1. positives: 이 자산이 *마땅히 발화돼야 하는* 요청.
2. negatives: 이 자산이 *발화되면 안 되는* 요청. 단, 명백히 무관한 것 말고
   **near-miss** — 키워드·주제가 겹치지만 실제론 다른 게 필요한 함정 요청으로.

규칙:
- 실제 사용자가 칠 법한 자연스러운 문장. 구체적(파일경로·상황)일수록 좋다.
- description 문구를 그대로 베끼지 말고 다양한 표현으로.
- 반드시 아래 JSON 한 객체만 출력. 다른 텍스트·코드펜스 금지.
{ "positives": ["..."], "negatives": ["..."] }`;

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new TriggerEvalError(
      `쿼리 생성 응답 파싱 실패: ${(e as Error).message}`,
    );
  }
  const o = obj as { positives?: unknown; negatives?: unknown };
  const positives = parseStringArray(o.positives);
  const negatives = parseStringArray(o.negatives);
  if (positives.length === 0)
    throw new TriggerEvalError("positives 쿼리 생성 실패");
  return { positives, negatives };
}

/** 한 자산을 라벨된 쿼리 셋으로 평가. 각 쿼리를 runsPerQuery 회 probe. */
export async function evaluateTrigger(
  assetId: string,
  queries: LabeledQuery[],
  runsPerQuery = 3,
): Promise<TriggerEvalResult> {
  const { kind, name, content } = requireTriggerable(assetId);
  if (queries.length === 0) throw new TriggerEvalError("queries 가 비어있음");

  const results: TriggerQueryResult[] = [];
  for (const { text, shouldTrigger } of queries) {
    let triggered = 0;
    const firstTools: string[] = [];
    for (let i = 0; i < runsPerQuery; i += 1) {
      let r;
      try {
        r = await probeTrigger(kind, name, content, text);
      } catch (e) {
        throw new TriggerEvalError(`probe 실패: ${(e as Error).message}`);
      }
      if (r.triggered) triggered += 1;
      if (r.firstTool) firstTools.push(r.firstTool);
    }
    const triggerRate = triggered / runsPerQuery;
    const pass = shouldTrigger ? triggerRate >= 0.5 : triggerRate < 0.5;
    results.push({
      query: text,
      shouldTrigger,
      runs: runsPerQuery,
      triggered,
      triggerRate,
      pass,
      firstTools,
    });
  }

  const positives = results.filter((r) => r.shouldTrigger);
  const negatives = results.filter((r) => !r.shouldTrigger);
  const avg = (rows: TriggerQueryResult[]) =>
    rows.reduce((s, r) => s + r.triggerRate, 0) / rows.length;
  return {
    assetId,
    kind,
    name,
    runsPerQuery,
    positiveRate: positives.length === 0 ? 0 : avg(positives),
    negativeFireRate: negatives.length === 0 ? null : avg(negatives),
    accuracy:
      results.reduce((s, r) => s + (r.pass ? 1 : 0), 0) / results.length,
    queries: results,
  };
}

export { ClaudeAssistError };
