import type { AssetKind } from "@opspilot/shared-types";
import { runClaudeOnce } from "./claude.js";

// OPSP-27 A: 자산 저작 어시스트.
// 사용자가 작성 중인 자산 초안을 받아 (1) 어떤 의도로 읽히는지 한국어 한 줄
// (2) 개선 제안 몇 가지를 자유 텍스트로 회신. 자동 적용 없음 — 사용자가 보고 결정.

const SYSTEM = `당신은 Claude Code 자산(에이전트/스킬/커맨드) 리뷰어다.
사용자가 작성 중인 초안을 보고 한국어로 짧게 평하라.

규칙:
- 추측하지 말고 초안 자체에서 읽히는 의도만 말하라.
- 개선 제안은 구체적으로(필드명/예시 인용). 일반론 금지.
- 마크다운으로 출력하되 6~12줄을 넘기지 말 것.

출력 형식(헤더 그대로):
**의도**: <한 줄로 이 자산이 무엇을 하려는지>
**잘된 점**: <짧게 1-2개>
**개선 제안**: <1-3개, 각 줄 앞에 - >
**확인 질문**: <초안만으로 모호한 점 1개. 없으면 "없음">`;

export async function reviewAuthoringDraft(input: {
  kind: AssetKind;
  name: string;
  content: string;
}): Promise<string> {
  const prompt = [
    SYSTEM,
    "",
    `--- 초안 (kind=${input.kind}, name=${input.name}) ---`,
    input.content,
    "--- 끝 ---",
  ].join("\n");
  return runClaudeOnce(prompt, { timeoutMs: 90_000 });
}
