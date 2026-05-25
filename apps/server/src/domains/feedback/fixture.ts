// fixture run → proposal parser 검증용 (5c). local-claude 없이 결정론.

const FIXTURE_PROPOSALS = {
  proposals: [
    {
      targetKind: "cursor_rule" as const,
      targetPath: ".cursor/rules/ops-pilot-feedback-test.mdc",
      rationale: "검증용 fixture proposal",
      content: "---\ndescription: test\n---\n# Feedback fixture",
    },
    {
      targetKind: "workflow_patch" as const,
      targetPath: ".github/workflows/ci.yml",
      rationale: "fixture workflow_patch parser/apply 검증",
      content: "      - name: OpsPilot fixture step\n        run: echo fixture",
    },
  ],
};

const assistantText = `4원칙 채점 완료. 개선안 JSON:

\`\`\`json
${JSON.stringify(FIXTURE_PROPOSALS, null, 2)}
\`\`\``;

export const FEEDBACK_EVAL_FIXTURE: unknown[] = [
  { type: "system", subtype: "init", tools: ["Read"] },
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
    result: "feedback eval fixture",
    usage: { input_tokens: 100, output_tokens: 50 },
    total_cost_usd: 0,
  },
];
