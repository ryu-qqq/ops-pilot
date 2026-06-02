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
import { crewAgentPath, loadCrewAgentBody } from "../assist/crew-asset.js";
import { getAsset, latestContent } from "../registry/repository.js";
import { type TriggerKind, probeTrigger } from "./probe.js";

// 트리거 정확도 평가 — description 이 켜져야 할 때 켜지고 아닐 때 안 켜지나 측정.
// T3(안 쓰는 자산)의 짝: 자산이 안 쓰이는 이유가 description 이 발화를 못 일으켜서인지 진단.
//
// ADR 0002 (1B·4B·2C): "설계(생성)" 로직(① 쿼리 생성 / ② description 개선)의 프롬프트
// 단일 진실은 ops-pilot baked 상수가 아니라 agent-crew 자산 `harness-trigger-designer`
// 본문이다. 두 모드("신규 설계 모드"=①, "description 개선 모드"=②)를 한 자산이 담으므로
// 입력부에서 어느 모드인지 명시한다. 자산 본문(frontmatter 제거)을 runClaudeOnce 에 주입(1B)
// 하고, 자산 미발견(미sync) 또는 실행 실패면 baked fallback(4B)을 탄다. 출력 파싱·검증은
// ops-pilot 책임(2C, SSOT=zod 정신) — 자산이 내는 형태를 ops-pilot 이 견고하게 정규화한다.
// 측정 러너(probe·run·split·평가)는 불변(ADR 결정 3·후속 3).

export class TriggerEvalError extends Error {}

const TRIGGER_DESIGNER_ASSET = "harness-trigger-designer";

/** 어느 프롬프트 경로를 탔는가 — "asset"=자산 본문 주입(1B), "baked"=fallback(4B). */
export interface TriggerDesignMeta {
  source: "asset" | "baked";
  /** source="baked" 일 때만. 자산 미발견(미sync) 또는 자산 경로 실행 실패 사유. */
  fallbackReason?: string;
  /**
   * 자산 경로(source="asset")에서만 의미. 자산이 문서화된 배열 형식
   * `[{query, should_trigger}]` 이 아니라 baked 호환 객체 형식
   * `{positives, negatives}` 으로 파싱됐으면 true(형식 드리프트 — 동작은 맞지만 자산이
   * 문서와 다른 형식을 냄). baked 경로는 정상 형식이므로 항상 undefined.
   */
  formatDrift?: boolean;
}

/** 루프 단위 source 집계 — 스텝별 improveDescriptionWithMeta meta.source 누적. */
export interface SourceCounts {
  asset: number;
  baked: number;
}

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

// ── ① 신규 설계(쿼리 생성) 모드 ──────────────────────────────

// 4B fallback: harness-trigger-designer 자산을 못 읽거나 실행 실패할 때만 사용.
// 자산 본문(1B 주입)이 정상 동작하면 이 baked 프롬프트는 타지 않는다. 졸업조건(무fallback
// 안정 산출 확인) 충족 시 ADR 0002 결정 5에 따라 제거 예정.
function bakedSuggestPrompt(
  kind: TriggerKind,
  name: string,
  content: string,
  n: number,
): string {
  return `당신은 Claude Code 자산의 트리거(자동 발화) 평가용 쿼리를 만든다.
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
}

// 1B 자산 주입용 입력부 — harness-trigger-designer 본문 뒤에 붙는다.
// 자산은 두 모드를 담으므로 "신규 설계 모드"임을 명시한다. 출력은 자산이 문서화한
// `[{query, should_trigger}]` 형식으로 받아 ops-pilot 이 positives/negatives 로 변환한다(2C).
function buildSuggestInputSection(
  kind: TriggerKind,
  name: string,
  content: string,
  n: number,
): string {
  return `## 입력 — 신규 설계(쿼리 생성) 모드

평가 대상 자산: ${kind === "skill" ? "스킬(SKILL.md)" : "에이전트(.md)"} "${name}".

--- 자산 정의 ---
${content.slice(0, 4000)}
--- 자산 끝 ---

이 자산의 트리거(자동 발화) 정확도를 측정할 예시 쿼리를 생성하라.
- should_trigger=true(positives): 이 자산이 *마땅히 발화돼야 하는* 현실적 한국어 요청. ${String(n)}개.
- should_trigger=false(negatives): 발화되면 안 되는 **near-miss** — 키워드·주제는 겹치나 실제론
  다른 게 필요한 함정 요청. 명백히 무관한 쉬운 음성 말고 변별력 있게. ${String(n)}개.

출력: 본문 산출 형식대로 JSON 배열 한 개만. 다른 텍스트·코드펜스 금지.
[ { "query": "...", "should_trigger": true }, { "query": "...", "should_trigger": false } ]`;
}

/** parseSuggested 가 실제로 어느 형식으로 파싱했는지 — 형식 드리프트 관측용(①b). */
type SuggestedFormat = "array" | "object";

/**
 * 자산/baked 응답을 SuggestedQueries 로 정규화(2C, SSOT=zod 정신, 파싱은 ops-pilot).
 * 두 형태를 견고하게 수용한다:
 *  - 자산 문서화 형식: `[{query, should_trigger}]` (또는 `{queries:[...]}` 래핑) → "array"
 *  - baked 형식: `{positives:[...], negatives:[...]}` → "object"
 * 어느 쪽이 와도 positives(should_trigger=true)·negatives(false)로 변환한다.
 * 반환에 어느 형식으로 파싱했는지 라벨을 곁들여 호출부가 형식 드리프트를 관측하게 한다(①b).
 */
function parseSuggested(raw: string): {
  queries: SuggestedQueries;
  format: SuggestedFormat;
} {
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new TriggerEvalError(
      `쿼리 생성 응답 파싱 실패: ${(e as Error).message}`,
    );
  }
  // 배열 형식(자산) — 직접 배열이거나 { queries: [...] } 래핑.
  const arr = Array.isArray(obj)
    ? obj
    : Array.isArray((obj as { queries?: unknown }).queries)
      ? (obj as { queries: unknown[] }).queries
      : null;
  if (arr) {
    const positives: string[] = [];
    const negatives: string[] = [];
    for (const item of arr) {
      if (item === null || typeof item !== "object") continue;
      const { query, should_trigger } = item as {
        query?: unknown;
        should_trigger?: unknown;
      };
      if (typeof query !== "string" || query.trim() === "") continue;
      (should_trigger === true ? positives : negatives).push(query.trim());
    }
    if (positives.length === 0)
      throw new TriggerEvalError("positives 쿼리 생성 실패");
    return { queries: { positives, negatives }, format: "array" };
  }
  // 객체 형식(baked) — { positives, negatives }.
  const o = obj as { positives?: unknown; negatives?: unknown };
  const positives = parseStringArray(o.positives);
  const negatives = parseStringArray(o.negatives);
  if (positives.length === 0)
    throw new TriggerEvalError("positives 쿼리 생성 실패");
  return { queries: { positives, negatives }, format: "object" };
}

/**
 * 자산 description 기반으로 should-trigger / should-NOT(near-miss) 쿼리를 자동 생성.
 * near-miss = 키워드는 겹치지만 이 자산이 켜지면 안 되는 요청 (변별력 가장 높음).
 * 기존 계약 유지를 위한 얇은 래퍼 — meta 가 필요하면 suggestTriggerQueriesWithMeta 를 쓴다.
 */
export async function suggestTriggerQueries(
  assetId: string,
  n = 5,
): Promise<SuggestedQueries> {
  return (await suggestTriggerQueriesWithMeta(assetId, n)).queries;
}

/**
 * ① 신규 설계 모드. 1B(자산 본문 주입) 우선, 실패 시 baked fallback(4B).
 * 자산 경로 fallback 은 runClaudeOnce 실행 실패에만 한정 — parseSuggested(스키마/JSON
 * 파싱 실패)는 자산 품질 문제이므로 fallback 없이 throw(baked 재호출로 토큰 2배·품질 은폐 방지).
 */
export async function suggestTriggerQueriesWithMeta(
  assetId: string,
  n = 5,
): Promise<{ queries: SuggestedQueries; meta: TriggerDesignMeta }> {
  const { kind, name, content } = requireTriggerable(assetId);
  const designerBody = loadCrewAgentBody(TRIGGER_DESIGNER_ASSET);

  let fallbackReason = "사유 미상";
  if (designerBody !== null) {
    const prompt = [
      designerBody,
      "",
      buildSuggestInputSection(kind, name, content, n),
    ].join("\n");
    let raw: string | null = null;
    try {
      raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
    } catch (e) {
      fallbackReason = `자산 경로 실행 실패: ${(e as Error).message}`;
    }
    if (raw !== null) {
      const { queries, format } = parseSuggested(raw);
      // ①b: 자산이 문서화된 배열 형식 대신 baked 호환 객체 형식을 냈으면 형식 드리프트.
      // 동작은 정확하므로 throw 하지 않고 meta 로만 관측(route 가 warn).
      return {
        queries,
        meta: { source: "asset", formatDrift: format !== "array" },
      };
    }
  } else {
    fallbackReason = `${TRIGGER_DESIGNER_ASSET} 자산 미발견(미sync): ${crewAgentPath(TRIGGER_DESIGNER_ASSET)}`;
  }

  const raw = await runClaudeOnce(bakedSuggestPrompt(kind, name, content, n), {
    timeoutMs: 90_000,
  });
  // baked 경로는 객체 형식이 정상 — 드리프트 대상 아님(formatDrift 미설정).
  return {
    queries: parseSuggested(raw).queries,
    meta: { source: "baked", fallbackReason },
  };
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

// ── ② description 개선 모드 ─────────────────────────────────

/** train 결과의 실패를 failed(켜졌어야 안켜짐) / false(안켜졌어야 켜짐) 쿼리로 분류. */
function classifyFailures(trainResults: TriggerQueryResult[]): {
  failedTriggers: string[];
  falseTriggers: string[];
} {
  return {
    failedTriggers: trainResults
      .filter((r) => r.shouldTrigger && !r.pass)
      .map((r) => r.query),
    falseTriggers: trainResults
      .filter((r) => !r.shouldTrigger && !r.pass)
      .map((r) => r.query),
  };
}

// 4B fallback: harness-trigger-designer 자산 미발견/실행 실패 시에만.
function bakedImprovePrompt(
  kind: TriggerKind,
  name: string,
  content: string,
  current: string,
  trainResults: TriggerQueryResult[],
): string {
  const { failedTriggers, falseTriggers } = classifyFailures(trainResults);
  const body = content.replace(/^---[\s\S]*?---\n?/, "").slice(0, 2500);
  return `Claude Code ${kind} "${name}" 의 description(자동 발화 트리거 문구)을 개선한다.

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
}

// 1B 자산 주입용 입력부 — "description 개선 모드"임을 명시. 실패 사례는 자산 본문이
// 받게 저작된 `[{query, expected, actual}]` 형식으로 정규화해 넘긴다.
function buildImproveInputSection(
  kind: TriggerKind,
  name: string,
  content: string,
  current: string,
  trainResults: TriggerQueryResult[],
): string {
  const body = content.replace(/^---[\s\S]*?---\n?/, "").slice(0, 2500);
  // 실패 = pass=false. expected/actual 을 자연어로 정규화(자산은 텍스트만 받는다).
  const failures = trainResults
    .filter((r) => !r.pass)
    .map((r) => ({
      query: r.query,
      expected: r.shouldTrigger ? "발화(trigger)" : "비발화(no-trigger)",
      actual: r.triggerRate >= 0.5 ? "발화(trigger)" : "비발화(no-trigger)",
    }));
  return `## 입력 — description 개선 모드

대상: Claude Code ${kind} "${name}".

현재 description:
${current}

본문 발췌:
${body}

평가 실패 사례(트리거 정확도 측정 결과, expected≠actual):
${failures.length ? JSON.stringify(failures, null, 0) : "[]"}

위 실패 사례(켜졌어야 하는데 안 켜진 것·안 켜졌어야 하는데 켜진 것)를 줄이도록 description 을
다시 써라. 개별 쿼리 과적합 금지(더 넓은 사용자 의도 범주로 일반화), 한 줄·1024자 이내,
트리거 신호 구체화(언제 부르는지).

출력: 아래 JSON 한 객체만. 다른 텍스트·코드펜스 금지.
{ "description": "..." }`;
}

/** 자산/baked 응답에서 개선된 description 을 파싱·검증(2C, ops-pilot 책임). */
function parseImproved(raw: string): string {
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

/**
 * train 결과의 실패로부터 개선된 description 후보를 생성(LLM 한 스텝).
 * 기존 계약 유지를 위한 얇은 래퍼 — 루프(improveDescriptionLoop)가 그대로 호출한다.
 * 루프 골격(train/test·반복·best)은 ops-pilot 제어로 불변(ADR 결정 3).
 */
export async function improveDescription(
  kind: TriggerKind,
  name: string,
  content: string,
  current: string,
  trainResults: TriggerQueryResult[],
): Promise<string> {
  return (
    await improveDescriptionWithMeta(kind, name, content, current, trainResults)
  ).description;
}

/**
 * ② description 개선 모드(LLM 한 스텝). 1B(자산 본문 주입) 우선, 실패 시 baked fallback(4B).
 * 자산 경로 fallback 은 runClaudeOnce 실행 실패에만 한정 — parseImproved 실패는 throw.
 */
export async function improveDescriptionWithMeta(
  kind: TriggerKind,
  name: string,
  content: string,
  current: string,
  trainResults: TriggerQueryResult[],
): Promise<{ description: string; meta: TriggerDesignMeta }> {
  const designerBody = loadCrewAgentBody(TRIGGER_DESIGNER_ASSET);

  let fallbackReason = "사유 미상";
  if (designerBody !== null) {
    const prompt = [
      designerBody,
      "",
      buildImproveInputSection(kind, name, content, current, trainResults),
    ].join("\n");
    let raw: string | null = null;
    try {
      raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
    } catch (e) {
      fallbackReason = `자산 경로 실행 실패: ${(e as Error).message}`;
    }
    if (raw !== null) {
      return { description: parseImproved(raw), meta: { source: "asset" } };
    }
  } else {
    fallbackReason = `${TRIGGER_DESIGNER_ASSET} 자산 미발견(미sync): ${crewAgentPath(TRIGGER_DESIGNER_ASSET)}`;
  }

  const raw = await runClaudeOnce(
    bakedImprovePrompt(kind, name, content, current, trainResults),
    { timeoutMs: 90_000 },
  );
  return {
    description: parseImproved(raw),
    meta: { source: "baked", fallbackReason },
  };
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
 * 기존 계약 유지를 위한 얇은 래퍼 — 루프 단위 source 집계가 필요하면
 * improveDescriptionLoopWithMeta 를 쓴다(반환 ImproveResult·루프 골격 불변).
 */
export async function improveDescriptionLoop(
  assetId: string,
  queries: LabeledQuery[],
  opts: ImproveOptions = {},
): Promise<ImproveResult> {
  return (await improveDescriptionLoopWithMeta(assetId, queries, opts)).result;
}

/**
 * ① description 개선 루프 + 루프 단위 source 관측(①a).
 * 스텝마다 improveDescriptionWithMeta 를 불러 meta.source 를 누적(sourceCounts)한다.
 * 루프 골격(train/test split·N회 반복·best 선택)·반환 ImproveResult 필드는 불변 —
 * sourceCounts 는 곁들이는 관측 데이터일 뿐 ImproveResult 에 싣지 않는다(응답 계약 불변,
 * /suggest 와 동일하게 route 가 읽어 fastify.log 로만 남긴다).
 */
export async function improveDescriptionLoopWithMeta(
  assetId: string,
  queries: LabeledQuery[],
  opts: ImproveOptions = {},
): Promise<{ result: ImproveResult; sourceCounts: SourceCounts }> {
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
  const sourceCounts: SourceCounts = { asset: 0, baked: 0 };

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
    // ①a: meta 버리는 얇은 래퍼 대신 WithMeta 로 스텝별 source 를 수집.
    const step = await improveDescriptionWithMeta(
      kind,
      name,
      content,
      current,
      trainSet.queries,
    );
    sourceCounts[step.meta.source] += 1;
    current = step.description;
  }

  const result: ImproveResult = {
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
  return { result, sourceCounts };
}

export { ClaudeAssistError };
