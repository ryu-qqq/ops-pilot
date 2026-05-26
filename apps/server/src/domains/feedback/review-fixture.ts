import type { ImprovementProposal } from "@opspilot/shared-types";

/** fixture review run — proposal-reviewer parser·policy 검증용. */

export function buildReviewFixtureText(proposals: ImprovementProposal[]): string {
  const reviews = proposals.map((p) => {
    if (p.targetKind === "workflow_patch") {
      return {
        proposalId: p.id,
        decision: "reject" as const,
        confidence: "high" as const,
        risk: "high" as const,
        autoApply: false,
        rationale: "fixture: workflow_patch duplicate step risk",
        conflicts: [p.targetPath],
      };
    }
    return {
      proposalId: p.id,
      decision: "approve" as const,
      confidence: "high" as const,
      risk: "low" as const,
      autoApply: true,
      rationale: "fixture: cursor_rule ok",
      conflicts: [] as string[],
    };
  });

  return `검토 완료.

\`\`\`json
${JSON.stringify({ reviews, summary: "fixture review" }, null, 2)}
\`\`\``;
}

export function reviewFixtureEvents(assistantText: string): unknown[] {
  return [
    { type: "system", subtype: "init", tools: ["Read", "Grep"] },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: assistantText }],
      },
    },
    {
      type: "result",
      subtype: "success",
      result: "feedback review fixture",
      usage: { input_tokens: 80, output_tokens: 120 },
      total_cost_usd: 0,
    },
  ];
}
