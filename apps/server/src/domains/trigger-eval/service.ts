import type {
  ImproveResult,
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

interface ProbeSetResult {
  queries: TriggerQueryResult[];
  positiveRate: number;
  negativeFireRate: number | null;
  accuracy: number;
}

const avgRate = (rows: TriggerQueryResult[]) =>
  rows.reduce((s, r) => s + r.triggerRate, 0) / rows.length;

/** 주어진 content(=특정 description) 로 라벨 쿼리 셋을 probe. 루프·평가 공통 코어. */
async function runProbeSet(
  kind: TriggerKind,
  name: string,
  content: string,
  queries: LabeledQuery[],
  runsPerQuery: number,
): Promise<ProbeSetResult> {
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
  return {
    queries: results,
    positiveRate: positives.length === 0 ? 0 : avgRate(positives),
    negativeFireRate: negatives.length === 0 ? null : avgRate(negatives),
    accuracy:
      results.reduce((s, r) => s + (r.pass ? 1 : 0), 0) / results.length,
  };
}

/** 한 자산을 라벨된 쿼리 셋으로 평가. 각 쿼리를 runsPerQuery 회 probe. */
export async function evaluateTrigger(
  assetId: string,
  queries: LabeledQuery[],
  runsPerQuery = 3,
): Promise<TriggerEvalResult> {
  const { kind, name, content } = requireTriggerable(assetId);
  if (queries.length === 0) throw new TriggerEvalError("queries 가 비어있음");
  const set = await runProbeSet(kind, name, content, queries, runsPerQuery);
  return { assetId, kind, name, runsPerQuery, ...set };
}

// ── description 자동개선 루프 ────────────────────────────────

/** frontmatter 첫 description 라인 추출 (없으면 빈 문자열). */
export function extractDescription(content: string): string {
  return content.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
}

/** frontmatter 의 description 라인을 새 값으로 교체 (단일 라인 plain scalar). */
export function withDescription(content: string, description: string): string {
  const oneLine = description.replace(/\s*\n\s*/g, " ").trim();
  if (/^description:\s*.+$/m.test(content)) {
    return content.replace(/^description:\s*.+$/m, `description: ${oneLine}`);
  }
  // frontmatter 가 없으면 맨 위에 최소 frontmatter 삽입.
  return `---\ndescription: ${oneLine}\n---\n\n${content}`;
}

/** train 결과의 실패(켜졌어야/안켜졌어야)로부터 개선된 description 후보를 생성. */
export async function improveDescription(
  kind: TriggerKind,
  name: string,
  content: string,
  current: string,
  trainResults: TriggerQueryResult[],
): Promise<string> {
  const failedTriggers = trainResults
    .filter((r) => r.shouldTrigger && !r.pass)
    .map((r) => r.query);
  const falseTriggers = trainResults
    .filter((r) => !r.shouldTrigger && !r.pass)
    .map((r) => r.query);
  const body = content.replace(/^---[\s\S]*?---\n?/, "").slice(0, 2500);
  const prompt = `Claude Code ${kind} "${name}" 의 description(자동 발화 트리거 문구)을 개선한다.

현재 description:
${current}

본문 발췌:
${body}

평가 실패 사례:
- 켜졌어야 하는데 안 켜진 요청(failed): ${failedTriggers.length ? JSON.stringify(failedTriggers, null, 0) : "없음"}
- 안 켜졌어야 하는데 켜진 요청(false): ${falseTriggers.length ? JSON.stringify(falseTriggers, null, 0) : "없음"}

failed 는 더 잘 잡고 false 는 배제하도록 description 을 다시 써라.
- 개별 쿼리에 과적합하지 말고 사용자 의도의 더 넓은 범주로 일반화.
- 한 줄, 1024자 이내. 트리거 신호가 구체적이어야 한다(언제 부르는지).
- 반드시 아래 JSON 한 객체만 출력. 코드펜스 금지.
{ "description": "..." }`;

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new TriggerEvalError(`개선 응답 파싱 실패: ${(e as Error).message}`);
  }
  const desc = (obj as { description?: unknown }).description;
  if (typeof desc !== "string" || desc.trim() === "") {
    throw new TriggerEvalError("개선된 description 이 비어있음");
  }
  return desc
    .replace(/\s*\n\s*/g, " ")
    .trim()
    .slice(0, 1024);
}

/** shouldTrigger 로 층화해 holdout 비율만큼 test 로 분리 (과적합 방지, 결정적). */
export function splitTrainTest(
  queries: LabeledQuery[],
  holdout: number,
): { train: LabeledQuery[]; test: LabeledQuery[] } {
  const train: LabeledQuery[] = [];
  const test: LabeledQuery[] = [];
  for (const group of [true, false]) {
    const rows = queries.filter((q) => q.shouldTrigger === group);
    const nTest = Math.floor(rows.length * holdout);
    rows.forEach((q, i) => (i < nTest ? test : train).push(q));
  }
  // train 이 비면 안 됨 — 모두 train 으로.
  if (train.length === 0) return { train: queries, test: [] };
  return { train, test };
}

export interface ImproveOptions {
  runsPerQuery?: number;
  maxIterations?: number;
  holdout?: number;
}

/**
 * description 자동개선 루프 (skill-creator run_loop 판).
 * train 으로 개선·반복, test 정확도 최댓값을 best 로 고른다. 자산은 수정하지 않고 제안만 반환.
 */
export async function improveDescriptionLoop(
  assetId: string,
  queries: LabeledQuery[],
  opts: ImproveOptions = {},
): Promise<ImproveResult> {
  const runsPerQuery = opts.runsPerQuery ?? 2;
  const maxIterations = opts.maxIterations ?? 3;
  const holdout = opts.holdout ?? 0.4;
  const { kind, name, content } = requireTriggerable(assetId);
  if (queries.length < 2)
    throw new TriggerEvalError("개선 루프는 쿼리 2개 이상 필요");

  const original = extractDescription(content);
  const { train, test } = splitTrainTest(queries, holdout);
  const iterations: ImproveResult["iterations"] = [];
  let current = original;
  let best = { description: original, testAccuracy: -1 };

  for (let iter = 0; iter <= maxIterations; iter += 1) {
    const probeContent = withDescription(content, current);
    const trainSet = await runProbeSet(
      kind,
      name,
      probeContent,
      train,
      runsPerQuery,
    );
    const testSet =
      test.length > 0
        ? await runProbeSet(kind, name, probeContent, test, runsPerQuery)
        : null;
    const testAccuracy = testSet ? testSet.accuracy : trainSet.accuracy;
    iterations.push({
      iteration: iter,
      description: current,
      trainAccuracy: trainSet.accuracy,
      testAccuracy,
    });
    if (testAccuracy > best.testAccuracy)
      best = { description: current, testAccuracy };

    if (trainSet.accuracy === 1 || iter === maxIterations) break;
    current = await improveDescription(
      kind,
      name,
      content,
      current,
      trainSet.queries,
    );
  }

  return {
    assetId,
    kind,
    name,
    runsPerQuery,
    trainCount: train.length,
    testCount: test.length,
    originalDescription: original,
    bestDescription: best.description,
    bestTestAccuracy: best.testAccuracy,
    improved: best.description.trim() !== original.trim(),
    iterations,
  };
}

export { ClaudeAssistError };
