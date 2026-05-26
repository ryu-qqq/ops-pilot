import type { IngestBundle } from "@opspilot/shared-types";

export const FEEDBACK_SCENARIO_NAME = "cursor-feedback-mvp";

/** work-evaluator eval 프롬프트·파서·apply 와 동기화할 kind 목록. */
export const FEEDBACK_PROPOSAL_TARGET_KINDS = [
  "cursor_rule",
  "cursor_skill",
  "agent",
  "skill",
  "command",
  "workflow_patch",
] as const;

const PROPOSAL_JSON_BLOCK = `\`\`\`json
{
  "proposals": [
    {
      "targetKind": "cursor_rule",
      "targetPath": ".cursor/rules/example-eval-guard.mdc",
      "rationale": "ingest 회고와 gitRef diff 정합성 검증 rule",
      "content": "---\\ndescription: Eval 전 retro-git 정합성\\nalwaysApply: false\\n---\\n# Retro vs commit\\n\\n- gitRef 커밋 diff에 없는 변경을 회고에 쓰지 않는다\\n- 불일치 시 가정/범위 축 ✗\\n"
    }
  ]
}
\`\`\``;

/** ingest 번들 → work-evaluator 시나리오 입력 (설계 §6 템플릿). */
export function buildFeedbackScenarioInput(bundle: IngestBundle, projectName: string): string {
  const notion = bundle.notionTaskUrl ?? "(없음)";
  const retro = bundle.contextJson.retro ?? "(없음)";
  const transcript = bundle.contextJson.transcriptExcerpt ?? "(없음)";
  const kinds = FEEDBACK_PROPOSAL_TARGET_KINDS.join(", ");

  return `## 컨텍스트
- 프로젝트: ${projectName}
- Notion Task: ${notion}
- git: ${bundle.gitRef}
- 회고: ${retro}

## diff
${bundle.diffSummary}

## transcript 발췌 (있으면)
${transcript}

## 요청
work-evaluator 4원칙으로 이 작업을 채점하고,
마지막에 **기계 파싱용 JSON block 하나**를 출력한다.

### CRITICAL — proposal JSON (content 필수)

OpsPilot은 JSON만 파싱한다. **각 proposal은 네 필드 모두 non-empty**:

- targetKind, targetPath, rationale, **content**

**content** = apply 시 clone에 **그대로 write**할 파일 본문.
- rationale만 있고 content 없으면 → **ingest failed** (이번 실패 원인)
- vault evaluation 시드·마크다운 채점에만 본문 두고 JSON 생략 금지
- 본문을 지금 못 쓰면 그 proposal 빼고 \`"proposals": []\`

허용 targetKind (0~2개): ${kinds}
- cursor_rule: .cursor/rules/*.mdc — frontmatter+본문 전체
- cursor_skill: .cursor/skills/<name>/SKILL.md — frontmatter+본문 전체 (Cursor native)
- workflow_patch: .github/workflows/*.yml — steps YAML fragment (append, 들여쓰기 포함)
- agent/skill/command: .claude/ 아래 — md **전체 본문**

개선안 0~2개. 없으면 \`"proposals": []\`.

${PROPOSAL_JSON_BLOCK}

### 출력 순서 (고정 — 위반 시 ingest failed)

1. (선택) 채점 마크다운
2. **반드시 마지막에** 위와 같은 \`\`\`json code fence **하나** — 그 안에 \`{ "proposals": [...] }\` 전체
3. 「JSON 출력함」 선언만 하고 fence 생략 금지 (파서는 JSON/fence만 읽음)
4. JSON turn이 별도 assistant 메시지여도 됨 — **없으면 failed**`;
}
