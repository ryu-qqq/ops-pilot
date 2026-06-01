import { z } from "zod";
import {
  ClaudeAssistError,
  extractJsonObject,
  runClaudeOnce,
} from "../assist/claude.js";
import { getRun, listLastAssistantTexts } from "../run/repository.js";
import { getScenario } from "../scenario/repository.js";
import { createScoreWithDetail } from "./repository.js";

// T4-e: substring 자동채점(auto-evaluate)을 LLM grader 로 보강.
// 핵심 — 표면적 준수(surface compliance)는 FAIL: 단어만 언급하고 실제로 수행 안 했거나,
// 출력이 비었거나 우연히 맞은 건 FAIL. + 각 assertion 의 변별력 비평.
// (skill-creator grader.md 판)

export class GradeError extends Error {}

export const gradeResultSchema = z.object({
  results: z.array(
    z.object({
      assertion: z.string(),
      passed: z.boolean(),
      evidence: z.string(),
    }),
  ),
  // assertion 들이 좋은 출력만 통과시키는가에 대한 비평 (약하면 지적).
  critique: z.string(),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;

const SYSTEM = `당신은 Claude Code 실행 결과 채점자다. 시나리오 성공조건(assertions)을 각각 PASS/FAIL 로 채점한다.

엄격 규칙:
- **표면적 준수는 FAIL.** 출력이 단어만 언급하고 실제로 그 일을 수행하지 않았거나, 비어있거나, 우연히 맞은 경우 FAIL.
- 의심스러우면 입증 책임은 PASS 쪽에 — 근거가 약하면 FAIL.
- evidence 는 출력에서 가져온 구체적 근거 1문장.

추가로, 각 assertion 이 *변별력* 있는지 비평하라 — "이 조건은 틀린 출력도 통과시킨다" 거나
"중요한 결과를 아무 조건도 검사 안 한다" 면 critique 에 지적.

JSON 한 객체만 출력. 코드펜스/설명 텍스트 금지.
{
  "results": [{ "assertion": "<원문 그대로>", "passed": true, "evidence": "<근거 1문장>" }],
  "critique": "<assertion 변별력에 대한 1-2문장 한국어>"
}`;

/** 출력 + assertions 를 LLM 으로 채점. 직접 호출 가능(테스트·재사용). */
export async function gradeAssertions(
  assertions: string[],
  output: string,
): Promise<GradeResult> {
  if (assertions.length === 0) throw new GradeError("assertions 가 비어있음");
  const prompt = `${SYSTEM}

--- 실행 출력 ---
${output.trim() === "" ? "(출력 없음)" : output.slice(0, 6000)}
--- 끝 ---

성공조건(assertions):
${assertions.map((a, i) => `${String(i + 1)}. ${a}`).join("\n")}`;

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new GradeError(`채점 응답 파싱 실패: ${(e as Error).message}`);
  }
  const parsed = gradeResultSchema.safeParse(obj);
  if (!parsed.success) {
    throw new GradeError(
      `채점 결과 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

export interface RunGradeResult extends GradeResult {
  runId: string;
  passed: boolean;
  score: number;
}

/** run 의 마지막 응답 + 시나리오 assertions 를 LLM 으로 채점하고 score(llm_judge) 저장. */
export async function gradeRunAssertions(
  runId: string,
): Promise<RunGradeResult> {
  const run = getRun(runId);
  if (!run) throw new GradeError(`run not found: ${runId}`);
  const scenario = getScenario(run.scenarioId);
  if (!scenario) throw new GradeError("scenario not found");
  const assertions = scenario.expectation.assertions ?? [];
  if (assertions.length === 0)
    throw new GradeError("시나리오에 assertions 가 없음 — 채점 대상 없음");

  const output = listLastAssistantTexts([runId])[runId] ?? "";
  const graded = await gradeAssertions(assertions, output);

  const passCount = graded.results.filter((r) => r.passed).length;
  const total = graded.results.length || assertions.length;
  const passed = passCount === total;
  const score = total === 0 ? 0 : passCount / total;
  createScoreWithDetail({
    runId,
    scorer: "llm_judge",
    passed,
    score,
    detail: {
      reason: `${String(passCount)}/${String(total)} 단언 통과 (LLM grader · 표면준수 FAIL). ${graded.critique}`,
      expected: assertions,
      actual: graded.results,
    },
  });
  return { runId, passed, score, ...graded };
}

export { ClaudeAssistError };
