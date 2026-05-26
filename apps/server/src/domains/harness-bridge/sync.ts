import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import matter from "gray-matter";
import {
  BRIDGE_EXCLUDED_AGENTS,
  derivedAgentRuleName,
  generatedHeader,
  isGeneratedHarnessContent,
} from "./config.js";

export type HarnessBridgeAction = "create" | "update" | "unchanged";

export interface HarnessBridgePlanItem {
  relPath: string;
  action: HarnessBridgeAction;
  sourcePath: string;
}

export class HarnessBridgeSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessBridgeSyncError";
  }
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

function listSkillDirs(claudeDir: string): string[] {
  const skillsRoot = join(claudeDir, "skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(skillsRoot, d.name));
}

function normalizeContent(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function planWrite(
  clonePath: string,
  relPath: string,
  nextContent: string,
  sourcePath: string,
  plan: HarnessBridgePlanItem[],
): void {
  const abs = join(clonePath, relPath);
  const normalized = normalizeContent(nextContent);
  if (existsSync(abs)) {
    const current = readFileSync(abs, "utf8");
    plan.push({
      relPath,
      action: current === normalized ? "unchanged" : "update",
      sourcePath,
    });
    return;
  }
  plan.push({ relPath, action: "create", sourcePath });
}

function writeIfNeeded(
  clonePath: string,
  relPath: string,
  nextContent: string,
  sourcePath: string,
  written: string[],
): void {
  const abs = join(clonePath, relPath);
  const normalized = normalizeContent(nextContent);
  if (existsSync(abs)) {
    const current = readFileSync(abs, "utf8");
    if (current === normalized) return;
    if (
      (relPath.startsWith(".cursor/skills/") || relPath.startsWith(".cursor/commands/")) &&
      !isGeneratedHarnessContent(current)
    ) {
      return;
    }
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, normalized, "utf8");
  written.push(relPath);
}

function mirrorSkill(clonePath: string, skillDir: string): { relPath: string; content: string; source: string } | null {
  const skillName = basename(skillDir);
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const sourceRel = relative(clonePath, skillFile).replace(/\\/g, "/");
  const body = readFileSync(skillFile, "utf8");
  const relPath = `.cursor/skills/${skillName}/SKILL.md`;
  const content = generatedHeader(sourceRel) + body.replace(/^\s*<!--[^>]*opspilot:generated[^>]*-->\s*/i, "");
  return { relPath, content, source: sourceRel };
}

function mirrorCommand(
  clonePath: string,
  commandFile: string,
): { relPath: string; content: string; source: string } {
  const name = basename(commandFile, ".md");
  const sourceRel = relative(clonePath, commandFile).replace(/\\/g, "/");
  const body = readFileSync(commandFile, "utf8");
  const relPath = `.cursor/commands/${name}.md`;
  const content = generatedHeader(sourceRel) + body.replace(/^\s*<!--[^>]*opspilot:generated[^>]*-->\s*/i, "");
  return { relPath, content, source: sourceRel };
}

function deriveAgentRule(
  clonePath: string,
  agentFile: string,
): { relPath: string; content: string; source: string } {
  const agentName = basename(agentFile, ".md");
  const sourceRel = relative(clonePath, agentFile).replace(/\\/g, "/");
  const parsed = matter(readFileSync(agentFile, "utf8"));
  const description =
    typeof parsed.data.description === "string" && parsed.data.description.trim() !== ""
      ? parsed.data.description.trim()
      : `Derived from Claude agent ${agentName}`;

  const relPath = `.cursor/rules/${derivedAgentRuleName(agentName)}`;
  const body = parsed.content.trim();
  const toolsNote =
    parsed.data["allowed-tools"] !== undefined
      ? "\n\n> **Note:** 원본 Claude agent의 `allowed-tools`는 Cursor에서 동일하지 않을 수 있다. 필요 시 MCP·Cursor 도구를 수동 매핑.\n"
      : "";

  const descEsc = description.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const frontmatter = `---
description: "${descEsc}"
alwaysApply: false
---
`;
  const content =
    generatedHeader(sourceRel) +
    frontmatter +
    `# ${agentName} (Claude agent → Cursor rule)\n\n` +
    body +
    toolsNote;

  return { relPath, content, source: sourceRel };
}

function collectMirrorItems(clonePath: string): { relPath: string; content: string; source: string }[] {
  const claudeDir = join(clonePath, ".claude");
  if (!existsSync(claudeDir)) {
    throw new HarnessBridgeSyncError(`.claude 디렉터리가 없습니다: ${claudeDir}`);
  }

  const items: { relPath: string; content: string; source: string }[] = [];

  for (const skillDir of listSkillDirs(claudeDir)) {
    const mirrored = mirrorSkill(clonePath, skillDir);
    if (mirrored) items.push(mirrored);
  }

  for (const commandFile of listMdFiles(join(claudeDir, "commands"))) {
    items.push(mirrorCommand(clonePath, commandFile));
  }

  for (const agentFile of listMdFiles(join(claudeDir, "agents"))) {
    const agentName = basename(agentFile, ".md");
    if (BRIDGE_EXCLUDED_AGENTS.has(agentName)) continue;
    items.push(deriveAgentRule(clonePath, agentFile));
  }

  return items;
}

/** dry-run: `.claude` → `.cursor` mirror 계획. */
export function planCursorHarnessSync(clonePath: string): HarnessBridgePlanItem[] {
  const plan: HarnessBridgePlanItem[] = [];
  for (const item of collectMirrorItems(clonePath)) {
    planWrite(clonePath, item.relPath, item.content, item.source, plan);
  }
  return plan;
}

/** `.claude` → `.cursor` mirror 적용. 변경된 relPath 목록 반환. */
export function applyCursorHarnessSync(clonePath: string): string[] {
  const written: string[] = [];
  for (const item of collectMirrorItems(clonePath)) {
    writeIfNeeded(clonePath, item.relPath, item.content, item.source, written);
  }
  return written;
}

/** hand-authored `.cursor/rules` 보호 — generated·derived agent rule 만 bridge 대상. */
export function isBridgeManagedCursorPath(relPath: string): boolean {
  if (relPath.startsWith(".cursor/skills/")) return true;
  if (relPath.startsWith(".cursor/commands/")) return true;
  if (relPath.startsWith(".cursor/rules/") && basename(relPath).startsWith("opspilot-agent-")) {
    return true;
  }
  return false;
}

export function readBridgeManagedRulePaths(clonePath: string): string[] {
  const rulesDir = join(clonePath, ".cursor/rules");
  if (!existsSync(rulesDir)) return [];
  return readdirSync(rulesDir)
    .filter((name) => name.startsWith("opspilot-agent-") && name.endsWith(".mdc"))
    .map((name) => `.cursor/rules/${name}`);
}

/** stale derived rule 탐지 (agent 제거됨) — v1은 report only. */
export function listStaleDerivedRules(clonePath: string): string[] {
  const claudeAgents = new Set(
    listMdFiles(join(clonePath, ".claude/agents"))
      .map((f) => basename(f, ".md"))
      .filter((n) => !BRIDGE_EXCLUDED_AGENTS.has(n)),
  );
  return readBridgeManagedRulePaths(clonePath).filter((rel) => {
    const agentName = basename(rel, ".mdc").slice("opspilot-agent-".length);
    return !claudeAgents.has(agentName);
  });
}

export function assertClonePath(clonePath: string): void {
  if (!existsSync(clonePath) || !statSync(clonePath).isDirectory()) {
    throw new HarnessBridgeSyncError(`clonePath not found: ${clonePath}`);
  }
}

export { isGeneratedHarnessContent };
