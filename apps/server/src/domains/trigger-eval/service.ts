import {
  ClaudeAssistError,
  extractJsonObject,
  runClaudeOnce,
} from "../assist/claude.js";
import { getAsset, latestContent } from "../registry/repository.js";
import { type TriggerKind, probeTrigger } from "./probe.js";

// 트리거 정확도 평가 — description 이 "켜져야 할 때 켜지나"를 측정한다.
// T3(안 쓰는 자산)의 짝: 자산이 안 쓰이는 이유가 description 이 발화를 못 일으켜서인지 진단.

export class TriggerEvalError extends Error {}

export interface TriggerQueryResult {
  query: string;
  runs: number;
  triggered: number;
  triggerRate: number;
  firstTools: string[];
}

export interface TriggerEvalResult {
  assetId: string;
  kind: TriggerKind;
  name: string;
  runsPerQuery: number;
  queries: TriggerQueryResult[];
  /** 쿼리별 트리거율 평균. */
  overallRate: number;
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

/** 자산 description 기반으로 should-trigger 쿼리를 자동 생성. */
export async function suggestTriggerQueries(
  assetId: string,
  n = 5,
): Promise<string[]> {
  const { kind, name, content } = requireTriggerable(assetId);
  const prompt = `당신은 Claude Code 자산의 트리거(자동 발화) 평가용 쿼리를 만든다.
아래는 ${kind === "skill" ? "스킬(SKILL.md)" : "에이전트(.md)"} "${name}" 의 정의다.

--- 자산 정의 ---
${content.slice(0, 4000)}
--- 끝 ---

이 자산이 *마땅히 발화돼야 하는* 현실적인 사용자 요청 ${String(n)}개를 만들어라.
- 실제 사용자가 칠 법한 자연스러운 한국어 문장. 구체적(파일경로·상황 포함) 일수록 좋다.
- description 의 문구를 그대로 베끼지 말고, 의도가 같은 다양한 표현으로.
- 반드시 아래 JSON 한 객체만 출력. 다른 텍스트·코드펜스 금지.
{ "queries": ["...", "..."] }`;

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new TriggerEvalError(
      `쿼리 생성 응답 파싱 실패: ${(e as Error).message}`,
    );
  }
  const queries = (obj as { queries?: unknown }).queries;
  if (!Array.isArray(queries) || queries.some((q) => typeof q !== "string")) {
    throw new TriggerEvalError("쿼리 생성 결과가 string 배열이 아님");
  }
  return (queries as string[]).map((q) => q.trim()).filter(Boolean);
}

/** 쿼리 셋으로 트리거율을 측정. 각 쿼리를 runsPerQuery 회 probe. */
export async function evaluateTrigger(
  assetId: string,
  queries: string[],
  runsPerQuery = 3,
): Promise<TriggerEvalResult> {
  const { kind, name, content } = requireTriggerable(assetId);
  if (queries.length === 0) throw new TriggerEvalError("queries 가 비어있음");

  const results: TriggerQueryResult[] = [];
  for (const query of queries) {
    let triggered = 0;
    const firstTools: string[] = [];
    for (let i = 0; i < runsPerQuery; i += 1) {
      let r;
      try {
        r = await probeTrigger(kind, name, content, query);
      } catch (e) {
        throw new TriggerEvalError(`probe 실패: ${(e as Error).message}`);
      }
      if (r.triggered) triggered += 1;
      if (r.firstTool) firstTools.push(r.firstTool);
    }
    results.push({
      query,
      runs: runsPerQuery,
      triggered,
      triggerRate: triggered / runsPerQuery,
      firstTools,
    });
  }
  const overallRate =
    results.length === 0
      ? 0
      : results.reduce((s, r) => s + r.triggerRate, 0) / results.length;
  return { assetId, kind, name, runsPerQuery, queries: results, overallRate };
}

export { ClaudeAssistError };
