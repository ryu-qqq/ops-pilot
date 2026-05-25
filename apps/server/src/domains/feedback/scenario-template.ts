import type { IngestBundle } from "@opspilot/shared-types";

export const FEEDBACK_SCENARIO_NAME = "cursor-feedback-mvp";

const PROPOSAL_JSON_BLOCK = `\`\`\`json
{
  "proposals": [
    {
      "targetKind": "cursor_rule",
      "targetPath": ".cursor/rules/example.mdc",
      "rationale": "...",
      "content": "..."
    }
  ]
}
\`\`\``;

/** ingest 번들 → work-evaluator 시나리오 입력 (설계 §6 템플릿). */
export function buildFeedbackScenarioInput(bundle: IngestBundle, projectName: string): string {
  const notion = bundle.notionTaskUrl ?? "(없음)";
  const retro = bundle.contextJson.retro ?? "(없음)";
  const transcript = bundle.contextJson.transcriptExcerpt ?? "(없음)";

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
다음 형식의 **개선안 0~2개**만 JSON으로 출력:

${PROPOSAL_JSON_BLOCK}`;
}
