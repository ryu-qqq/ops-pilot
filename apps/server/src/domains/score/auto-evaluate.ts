import { getDb } from "../../db/index.js";
import { getRun } from "../run/repository.js";
import { getScenario } from "../scenario/repository.js";
import { createScoreWithDetail } from "./repository.js";

// OPSP-20: 시나리오 expectation.assertions 각 줄을 트레이스 텍스트에 substring 매칭.
// 약한 규칙임을 인정하나(자유 자연어 단언), 사용자가 OPSP-16 폼에서 적은 단언
// (예: "응답에 'AWS_SECRET_KEY' 또는 '시크릿' 문자열 포함")의 *키워드* 들이 응답에
// 들어있는지가 결정론 1차 신호로 충분. 정밀 규칙 엔진(정규식/count:/<= DSL)은 후속.
//
// 매칭 텍스트 = 모든 트레이스 이벤트의 output(JSON 문자열 합본). 마지막 응답뿐 아니라
// 도구 호출 결과·시스템 메시지도 포함해 "에이전트가 그 단어를 어딘가에서 입에 올렸는가"
// 를 본다. 너무 너그러우면 false positive — 후속에서 가중치 분리.

// 단언 한 줄에서 따옴표 안 키워드 추출 → 매칭에 우선 사용.
// 예: '응답에 "AWS_SECRET_KEY" 또는 "시크릿" 문자열 포함' → ["AWS_SECRET_KEY", "시크릿"] (OR)
// 따옴표 없으면 전체 단언을 그대로 substring 시도(아주 약한 매칭).
function extractKeywords(assertion: string): string[] {
  const matches = [...assertion.matchAll(/[`"']([^`"']{2,})[`"']/g)].map((m) => m[1] ?? "").filter((s) => s !== "");
  if (matches.length > 0) return matches;
  // 따옴표 없으면 어절 단위로 자르고, 길이 2자 이상 의미 있어 보이는 키워드만.
  // 1차는 통째 substring 만 — 가장 보수적(통과하기 어려움).
  return [assertion.trim()];
}

function gatherTraceText(runId: string): string {
  const rows = getDb()
    .prepare(`SELECT output FROM trace_event WHERE run_id = ? ORDER BY seq ASC`)
    .all(runId) as { output: string | null }[];
  return rows
    .map((r) => r.output ?? "")
    .filter((s) => s !== "")
    .join("\n");
}

interface AssertionEval {
  assertion: string;
  passed: boolean;
  matchedKeyword: string | null;
}

function evaluateOne(assertion: string, haystack: string): AssertionEval {
  const keywords = extractKeywords(assertion);
  // 단언 안 키워드들은 OR — 하나라도 매칭되면 통과(자연스러운 한국어 단언이 그런 식).
  for (const kw of keywords) {
    if (haystack.includes(kw)) {
      return { assertion, passed: true, matchedKeyword: kw };
    }
  }
  return { assertion, passed: false, matchedKeyword: null };
}

/**
 * run 종료 후 호출. 시나리오에 assertions 없으면 noop. 있으면 score 한 행 추가.
 * 실패해도 throw 안 함(실행 결과에 영향 X).
 */
export function evaluateAssertionsForRun(runId: string): void {
  try {
    const run = getRun(runId);
    if (!run) return;
    const scenario = getScenario(run.scenarioId);
    if (!scenario) return;
    const assertions = scenario.expectation.assertions ?? [];
    if (assertions.length === 0) return;

    const haystack = gatherTraceText(runId);
    const evals = assertions.map((a) => evaluateOne(a, haystack));
    const passCount = evals.filter((e) => e.passed).length;
    const score = evals.length === 0 ? 0 : passCount / evals.length;
    createScoreWithDetail({
      runId,
      scorer: "assertion",
      passed: passCount === evals.length,
      score,
      detail: {
        reason: `${String(passCount)}/${String(evals.length)} 단언 통과 (substring 매칭)`,
        expected: assertions,
        actual: evals,
      },
    });
  } catch {
    // 자동 측정 실패가 실행 결과에 영향주지 않게 흡수.
  }
}
