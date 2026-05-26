/** OpsPilot eval/review 전용 — Cursor mirror 제외 (스펙 §5). */
export const BRIDGE_EXCLUDED_AGENTS = new Set([
  "work-evaluator",
  "proposal-reviewer",
  "proposal-applier",
]);

export const GENERATED_MARKER = "opspilot:generated";

export const DERIVED_AGENT_RULE_PREFIX = "opspilot-agent-";

export function derivedAgentRuleName(agentName: string): string {
  return `${DERIVED_AGENT_RULE_PREFIX}${agentName}.mdc`;
}

export function generatedHeader(sourcePath: string): string {
  return `<!-- ${GENERATED_MARKER} from ${sourcePath} — sync_cursor_harness 로 갱신; 수동 편집 금지 -->\n\n`;
}

export function isGeneratedHarnessContent(content: string): boolean {
  return content.includes(GENERATED_MARKER);
}
