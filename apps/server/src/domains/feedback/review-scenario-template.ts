import type { ImprovementProposal, IngestBundle } from "@opspilot/shared-types";

export const FEEDBACK_REVIEW_SCENARIO_NAME = "cursor-feedback-review";

const REVIEW_JSON_BLOCK = `\`\`\`json
{
  "reviews": [
    {
      "proposalId": "00000000-0000-0000-0000-000000000001",
      "decision": "approve",
      "confidence": "high",
      "risk": "low",
      "autoApply": true,
      "rationale": "신규 rule 파일, 기존 rule 과 주제 중복 없음",
      "conflicts": []
    },
    {
      "proposalId": "00000000-0000-0000-0000-000000000002",
      "decision": "reject",
      "confidence": "high",
      "risk": "high",
      "autoApply": false,
      "rationale": "ci.yml 에 동일 upload step 이미 존재",
      "conflicts": [".github/workflows/ci.yml: Upload test reports"]
    }
  ],
  "summary": "cursor_rule 승인·workflow_patch 거절"
}
\`\`\``;

export function buildProposalReviewScenarioInput(
  bundle: IngestBundle,
  projectName: string,
  clonePath: string,
  proposals: ImprovementProposal[],
): string {
  const proposalJson = JSON.stringify(
    proposals.map((p) => ({
      proposalId: p.id,
      targetKind: p.targetKind,
      targetPath: p.targetPath,
      rationale: p.rationale,
      content: p.content,
    })),
    null,
    2,
  );

  return `## 컨텍스트
- 프로젝트: ${projectName}
- clone: ${clonePath}
- ingest git: ${bundle.gitRef}
- 회고: ${bundle.contextJson.retro ?? "(없음)"}

## diff (eval 시점)
${bundle.diffSummary.slice(0, 12000)}

## draft proposals
${proposalJson}

## 요청
proposal-reviewer 로 각 draft 를 검토하라.

1. clone 에서 targetPath 및 관련 파일을 Read/Grep 한다.
   - cursor_rule: .cursor/rules/*.mdc 전체와 주제 중복 확인
   - workflow_patch: .github/workflows/*.yml 의 steps 와 append 시 중복·충돌 확인
2. proposalId 마다 decision: approve | reject | revise
3. workflow_patch 는 기본 risk=high, autoApply=false (중복 step 없고 명확한 gap 만 approve)
4. revise 는 revisedContent 에 수정본 전체를 넣는다 (선택)

## 출력 (JSON 만)
${REVIEW_JSON_BLOCK}`;
}
