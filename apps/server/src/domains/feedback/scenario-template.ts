import type { IngestBundle } from "@opspilot/shared-types";

export const FEEDBACK_SCENARIO_NAME = "cursor-feedback-mvp";

/** work-evaluator eval 프롬프트·파서·apply 와 동기화할 kind 목록. */
export const FEEDBACK_PROPOSAL_TARGET_KINDS = [
  "cursor_rule",
  "agent",
  "skill",
  "command",
  "workflow_patch",
] as const;

const PROPOSAL_JSON_BLOCK = `\`\`\`json
{
  "proposals": [
    {
      "targetKind": "workflow_patch",
      "targetPath": ".github/workflows/ci.yml",
      "rationale": "CI에 테스트 리포트 업로드 step 추가",
      "content": "      - name: Example step\\n        run: echo ok"
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
다음 형식의 **개선안 0~2개**만 JSON으로 출력.

허용 targetKind: ${kinds}
- workflow_patch: targetPath는 .github/workflows/*.yml, content는 steps YAML fragment (append)
- cursor_rule: .cursor/rules/*.mdc
- agent/skill/command: .claude/ 아래 경로

${PROPOSAL_JSON_BLOCK}`;
}
