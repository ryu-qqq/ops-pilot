import { z } from "zod";
import { ClaudeAssistError, extractJsonObject, runClaudeOnce } from "./claude.js";
import { getAsset, latestContent } from "../registry/repository.js";

// OPSP-27 B: 시나리오 어시스트.
// 자산 본문(최신 버전 content)을 보고 시나리오 폼 5개 필드 초안을 JSON 으로 생성.
// 사용자 hint(자연어 "이런 상황 테스트하고 싶다") 가 있으면 함께 전달.

export const scenarioSuggestionSchema = z.object({
  name: z.string().min(1),
  purpose: z.string(),
  input: z.string().min(1),
  expectedBehavior: z.string(),
  successCriteria: z.array(z.string()),
});
export type ScenarioSuggestion = z.infer<typeof scenarioSuggestionSchema>;

const SYSTEM = `당신은 Claude Code 에이전트/스킬을 평가할 시나리오를 설계한다.
사용자가 만든 자산을 보고, 그 자산을 *의미 있게 검증할* 시나리오 한 건의 초안을 만든다.

반드시 다음 JSON 한 객체만 출력하라. 다른 텍스트(설명·코드펜스 라벨)는 금지.

{
  "name": "<짧은 시나리오 이름. 한국어. 예: '큰 코드베이스에서 X 찾기'>",
  "purpose": "<이 시나리오로 무엇을 검증하는가. 1-2문장 한국어>",
  "input": "<에이전트에 줄 실제 지시. 구체적 한국어. 자산의 트리거 조건과 일치하게.>",
  "expectedBehavior": "<옳다고 볼 행동. 1-2문장 한국어. judge 기준이 됨>",
  "successCriteria": ["<결정론 단언 1>", "<결정론 단언 2>"]
}

규칙:
- successCriteria 는 결정론적 단언(예: "응답에 함수명 X 포함", "Grep 호출 3회 이하"). 추상 문구 금지.
- 자산 본문의 description / 본문에서 의도를 정확히 읽고, 추측·과장 금지.
- 자산이 위험한 도구(예: 파일 삭제)를 다룰 경우 안전한 read-only 시나리오로.`;

export async function suggestScenario(input: {
  assetId: string;
  hint?: string;
}): Promise<ScenarioSuggestion> {
  const asset = getAsset(input.assetId);
  if (!asset) throw new ClaudeAssistError("자산을 찾을 수 없음");
  const content = latestContent(input.assetId) ?? "(자산 본문 없음)";

  const prompt = [
    SYSTEM,
    "",
    `--- 자산 (kind=${asset.kind}, name=${asset.name}) ---`,
    content,
    "--- 끝 ---",
    input.hint && input.hint.trim() !== ""
      ? `\n사용자 힌트(자연어로 시나리오 의도): ${input.hint.trim()}`
      : "",
  ].join("\n");

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  const obj = extractJsonObject(raw);
  const parsed = scenarioSuggestionSchema.safeParse(obj);
  if (!parsed.success) {
    throw new ClaudeAssistError(
      `시나리오 JSON 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  }
  return parsed.data;
}
