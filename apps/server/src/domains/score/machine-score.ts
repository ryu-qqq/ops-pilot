import type { MachineGateStatus } from "@opspilot/shared-types";

// 결정적 사전 판정: 기준이 아예 없으면(빈 줄 제외) no_criteria, 아니면 null
//  → null 이면 LLM 이 "모호한가(criteria_weak)" vs "충분한가(scored)" 를 판정한다.
// LLM 호출 없이 즉시 가른다(빈 기준에 토큰 낭비 금지).
export function evaluateCriteriaGate(
  assertions: string[],
): Extract<MachineGateStatus, "no_criteria"> | null {
  const meaningful = assertions.filter((a) => a.trim() !== "");
  return meaningful.length === 0 ? "no_criteria" : null;
}
