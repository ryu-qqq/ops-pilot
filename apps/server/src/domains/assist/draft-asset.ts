import { z } from "zod";
import type { AssetKind } from "@opspilot/shared-types";
import { ClaudeAssistError, extractJsonObject, runClaudeOnce } from "./claude.js";

// OPSP-27 follow-up: 사용자가 "CTO 에이전트" 같이 한 줄 컨셉만 적으면
// Claude 가 Claude Code 공식 frontmatter 스펙에 맞춘 *완성된 초안* 을 만들어
// 폼에 자동 채움. 사용자 마찰 가장 큰 지점("뭘부터 어떻게 적어야 할지 모르겠다")
// 을 직접 해결. 시나리오 어시스트와 같은 구조(JSON 강제 + zod).

export const draftAssetSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.string().optional(),
  // allowed-tools 는 skill/command 용. yaml 키 그대로.
  "allowed-tools": z.string().optional(),
  model: z.enum(["inherit", "sonnet", "opus", "haiku"]).optional(),
  body: z.string().min(1),
});
export type AssetDraft = z.infer<typeof draftAssetSchema>;

function systemPrompt(kind: AssetKind): string {
  const kindGuide: Record<AssetKind, string> = {
    agent:
      "에이전트(.claude/agents/<name>.md): 특정 작업을 위임받아 격리된 서브세션에서 수행. " +
      "description = 언제 이 에이전트를 부를지(자동 위임 트리거). " +
      "본문 = 시스템 프롬프트(역할·절차·체크리스트).",
    skill:
      "스킬(.claude/skills/<name>/SKILL.md): 메인 세션 안에서 발화되는 절차서. " +
      "description = 언제 트리거되는지 자연어 신호. " +
      "본문 = 단계별 절차·참조.",
    command:
      "커맨드(.claude/commands/<name>.md): 사용자가 / 로 호출하는 매크로. " +
      "description = 무엇을 하는 명령인지. " +
      "본문 = 명령 절차.",
  };
  return `당신은 Claude Code 자산 작성 가이드다. 사용자가 한 줄 컨셉을 주면
공식 frontmatter 스펙에 맞는 *완성된* 자산 초안을 작성한다.

선택된 kind: ${kind}
${kindGuide[kind]}

반드시 다음 JSON 한 객체만 출력하라. 코드펜스 라벨/설명 텍스트 금지.

{
  "name": "<kebab-case 영숫자. 예: cto-reviewer>",
  "description": "<한 줄. 언제 이 자산을 부를지의 트리거 신호를 한국어로 구체적으로.>",
  "tools": "<agent 전용. 쉼표 구분 도구 allowlist. 예: 'Read, Grep, Glob'. 필요 없으면 생략 가능>",
  "allowed-tools": "<skill/command 전용. 'Bash(git *), Read'. 필요 없으면 생략 가능>",
  "model": "<inherit | sonnet | opus | haiku. 비싼 작업만 opus, 대부분 sonnet, 무거우면 inherit>",
  "body": "<markdown. # 제목 + 역할·절차·체크리스트. 한국어. 10-30줄 정도. 추측 금지·구체적으로.>"
}

규칙:
- kind 가 agent 면 'tools' 키만, skill/command 면 'allowed-tools' 키만 사용(둘 다 비울 수도 있음).
- description 은 *트리거* 가 명확해야 한다. "코드 리뷰" 같은 막연한 문구 X. "PR diff 리뷰 요청 시", "/cto 호출 시" 같이 구체적으로.
- 본문은 단순 설명이 아니라 *지시문*(당신은 ... 입니다. 작업 시: 1. 2. ...).`;
}

export async function draftAsset(input: {
  kind: AssetKind;
  prompt: string;
}): Promise<AssetDraft> {
  if (input.prompt.trim() === "") throw new ClaudeAssistError("컨셉을 한 줄이라도 적어 주세요.");

  const fullPrompt = [systemPrompt(input.kind), "", "--- 사용자 컨셉 ---", input.prompt.trim()].join("\n");
  const raw = await runClaudeOnce(fullPrompt, { timeoutMs: 90_000 });
  const obj = extractJsonObject(raw);
  const parsed = draftAssetSchema.safeParse(obj);
  if (!parsed.success) {
    throw new ClaudeAssistError(
      `초안 JSON 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`,
    );
  }
  return parsed.data;
}
