import { machineGateStatusSchema, type MachineGateStatus } from "@opspilot/shared-types";
import { z } from "zod";
import { extractJsonObject, runClaudeOnce } from "../assist/claude.js";
import { getRun, listLastAssistantTexts } from "../run/repository.js";
import { getScenario } from "../scenario/repository.js";
import { createScoreWithDetail } from "./repository.js";

// 결정적 사전 판정: 기준이 아예 없으면(빈 줄 제외) no_criteria, 아니면 null
//  → null 이면 LLM 이 "모호한가(criteria_weak)" vs "충분한가(scored)" 를 판정한다.
// LLM 호출 없이 즉시 가른다(빈 기준에 토큰 낭비 금지).
export function evaluateCriteriaGate(
  assertions: string[],
): Extract<MachineGateStatus, "no_criteria"> | null {
  const meaningful = assertions.filter((a) => a.trim() !== "");
  return meaningful.length === 0 ? "no_criteria" : null;
}

export class MachineScoreError extends Error {}

// LLM 응답: 게이트 판정(scored|criteria_weak) + 채점 + 기준 비평/보강제안 을 한 번에.
const machineGradeSchema = z.object({
  // SSOT: shared-types 의 게이트 enum 에서 파생. LLM 은 scored/criteria_weak 만 판정 —
  // no_criteria 는 결정적 게이트(evaluateCriteriaGate) 몫이라 제외한다.
  gateStatus: machineGateStatusSchema.exclude(["no_criteria"]),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  criteriaCritique: z.string(),
  suggestedCriteria: z.array(z.string()),
});

const SYSTEM = `당신은 Claude Code 실행 결과 채점자다. 먼저 시나리오 성공조건(assertions)이
작성자의 의도를 *변별*할 만큼 충분한지 판정한 뒤, 출력을 채점한다.

게이트 판정:
- "scored": 기준이 구체적이고 좋은 출력만 통과시킨다(변별력 있음).
- "criteria_weak": 기준이 모호하거나 너무 느슨해 틀린 출력도 통과시킬 수 있다.
  (이 경우에도 채점은 하되, 신뢰는 낮다.)

채점 규칙(엄격):
- 표면적 준수는 FAIL. 단어만 언급하고 실제 수행 안 했거나, 비었거나, 우연히 맞으면 FAIL.
- 의심스러우면 입증 책임은 PASS 쪽 — 근거 약하면 FAIL.

suggestedCriteria: 이 시나리오에 추가하면 변별력이 오를 성공조건 0~3개(criteria_weak 이면 필수).

JSON 한 객체만 출력. 코드펜스/설명 금지.
{ "gateStatus": "scored|criteria_weak", "passed": true, "score": 0.0,
  "criteriaCritique": "<1-2문장 한국어>", "suggestedCriteria": ["<조건>"] }`;

type MachineGradeLlm = z.infer<typeof machineGradeSchema>;

// LLM 으로 게이트 판정 + 채점.
async function gradeWithCriteria(
  assertions: string[],
  output: string,
): Promise<MachineGradeLlm> {
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
    throw new MachineScoreError(`머신 채점 응답 파싱 실패: ${(e as Error).message}`);
  }
  const parsed = machineGradeSchema.safeParse(obj);
  if (!parsed.success) {
    throw new MachineScoreError(
      `머신 채점 결과 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

// 기준 없을 때(no_criteria) LLM 으로 초안 성공조건만 제안(채점 안 함).
async function suggestCriteriaForEmpty(
  scenarioInput: string,
  output: string,
): Promise<string[]> {
  const prompt = `다음 Claude Code 시나리오에는 성공조건(assertions)이 없다.
이 시나리오의 의도를 변별할 성공조건 1~3개를 제안하라. JSON 배열만 출력(설명 금지).
예: ["응답에 'X' 포함", "파일 Y 를 수정"]

--- 시나리오 입력 ---
${scenarioInput.slice(0, 2000)}
--- 실행 출력(참고) ---
${output.slice(0, 2000)}`;
  try {
    const raw = await runClaudeOnce(prompt, { timeoutMs: 60_000 });
    const obj = extractJsonObject(raw);
    const arr = z.array(z.string()).safeParse(obj);
    return arr.success ? arr.data.slice(0, 3) : [];
  } catch (e) {
    // 제안 실패는 치명적 아님 — 빈 제안으로 둔다(단, 인프라 장애를 침묵시키지 않게 흔적).
    console.warn(`머신 스코어러 기준 제안 실패: ${(e as Error).message}`);
    return [];
  }
}

export interface MachineScoreResult {
  runId: string;
  gateStatus: MachineGateStatus;
  passed: boolean;
  score: number | null;
  criteriaCritique: string;
  suggestedCriteria: string[];
}

// run 의 마지막 응답 + 시나리오 assertions 로 머신 채점하고 score(scorer='machine') 저장.
// 3상태: scored / criteria_weak (LLM) / no_criteria (결정적).
export async function machineScoreRun(runId: string): Promise<MachineScoreResult> {
  const run = getRun(runId);
  if (!run) throw new MachineScoreError(`run not found: ${runId}`);
  const scenario = getScenario(run.scenarioId);
  if (!scenario) throw new MachineScoreError("scenario not found");
  const assertions = scenario.expectation.assertions ?? [];
  const output = listLastAssistantTexts([runId])[runId] ?? "";

  let result: MachineScoreResult;
  if (evaluateCriteriaGate(assertions) === "no_criteria") {
    const suggested = await suggestCriteriaForEmpty(scenario.input, output);
    result = {
      runId,
      gateStatus: "no_criteria",
      passed: false, // 채점 불가를 통과로 위장 금지(spec §3).
      score: null,
      criteriaCritique:
        "성공조건이 비어 있어 채점할 수 없음 — 아래 제안을 시나리오에 추가하세요.",
      suggestedCriteria: suggested,
    };
  } else {
    const g = await gradeWithCriteria(assertions, output);
    result = {
      runId,
      gateStatus: g.gateStatus,
      passed: g.passed,
      score: g.score,
      criteriaCritique: g.criteriaCritique,
      suggestedCriteria: g.suggestedCriteria,
    };
  }

  createScoreWithDetail({
    runId,
    scorer: "machine",
    passed: result.passed,
    score: result.score,
    detail: {
      reason: result.criteriaCritique,
      gateStatus: result.gateStatus,
      criteriaCritique: result.criteriaCritique,
      suggestedCriteria: result.suggestedCriteria,
    },
  });
  return result;
}

// ADR 0004 OPS_AUTO_INGEST 선례와 일관 — env 전역 토글, 기본 off(LLM 비용 방어).
export function isAutoMachineScoreEnabled(): boolean {
  return process.env.OPS_AUTO_MACHINE_SCORE === "1";
}

// runLoop 말미에서 호출. 토글 off 면 즉시 noop. on 이면 비동기로 머신 채점을 띄우고
// 실패는 흡수(실행 결과·다른 자동측정에 영향 X). assertion 자동채점과 동일한 안전 계약.
export function maybeAutoMachineScore(runId: string): void {
  if (!isAutoMachineScoreEnabled()) return;
  void machineScoreRun(runId).catch((e) => {
    console.warn(`머신 스코어러 자동 채점 실패(run ${runId}): ${(e as Error).message}`);
  });
}
