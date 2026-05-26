import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";
import type { AssetKind, ImprovementProposal, Project } from "@opspilot/shared-types";
import { AuthoringError, writeAsset } from "../authoring/service.js";

export class FeedbackApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackApplyError";
  }
}

function git(clonePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: clonePath,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function assertSafeRelativePath(relPath: string): string {
  const normalized = normalize(relPath).replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new FeedbackApplyError(`unsafe path: ${relPath}`);
  }
  return normalized;
}

function gitCommitRelPath(
  project: Project,
  relPath: string,
  message: string,
): string {
  git(project.clonePath, ["add", "-f", "--", relPath]);
  try {
    git(project.clonePath, ["diff", "--cached", "--quiet", "--", relPath]);
    return git(project.clonePath, ["rev-parse", "HEAD"]);
  } catch {
    // staged diff exists — commit
  }
  try {
    git(project.clonePath, [
      "-c",
      "user.email=opspilot@local",
      "-c",
      "user.name=OpsPilot",
      "commit",
      "-m",
      message,
      "--",
      relPath,
    ]);
  } catch (e) {
    throw new FeedbackApplyError(`커밋 실패: ${(e as Error).message.slice(0, 300)}`);
  }
  return git(project.clonePath, ["rev-parse", "HEAD"]);
}

function applyCursorRule(
  project: Project,
  targetPath: string,
  content: string,
  rationale: string,
): string {
  const rel = assertSafeRelativePath(targetPath);
  if (!rel.startsWith(".cursor/rules/")) {
    throw new FeedbackApplyError("cursor_rule target must be under .cursor/rules/");
  }

  const abs = join(project.clonePath, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content.endsWith("\n") ? content : `${content}\n`, "utf8");

  const message =
    `ops(feedback/cursor_rule): apply proposal to ${rel}\n\n` +
    `why: ${rationale.trim() === "" ? "(미기재)" : rationale}\n\n` +
    `[opspilot feedback apply]`;
  return gitCommitRelPath(project, rel, message);
}

function applyCursorSkill(
  project: Project,
  targetPath: string,
  content: string,
  rationale: string,
): string {
  const rel = assertSafeRelativePath(targetPath);
  if (!/^\.cursor\/skills\/[^/]+\/SKILL\.md$/.test(rel)) {
    throw new FeedbackApplyError("cursor_skill target must be .cursor/skills/<name>/SKILL.md");
  }

  const abs = join(project.clonePath, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content.endsWith("\n") ? content : `${content}\n`, "utf8");

  const message =
    `ops(feedback/cursor_skill): apply proposal to ${rel}\n\n` +
    `why: ${rationale.trim() === "" ? "(미기재)" : rationale}\n\n` +
    `[opspilot feedback apply]`;
  return gitCommitRelPath(project, rel, message);
}

/** jobs.*.steps 끝에 YAML fragment append (v1). */
function appendWorkflowStepsFragment(yaml: string, fragment: string): string {
  const lines = yaml.split("\n");
  let stepsIdx = -1;
  let stepsIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = line.match(/^(\s+)steps:\s*$/);
    if (m?.[1]) {
      stepsIdx = i;
      stepsIndent = m[1].length;
      break;
    }
  }
  if (stepsIdx === -1) {
    throw new FeedbackApplyError("workflow_patch: steps: block not found in workflow YAML");
  }

  let insertAt = stepsIdx + 1;
  for (let i = stepsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() === "") {
      insertAt = i + 1;
      continue;
    }
    const indent = (line.match(/^(\s*)/)?.[1] ?? "").length;
    if (indent <= stepsIndent) {
      insertAt = i;
      break;
    }
    insertAt = i + 1;
  }

  const fragmentLines = normalizeWorkflowStepFragment(fragment, stepsIndent + 2);
  lines.splice(insertAt, 0, ...fragmentLines);
  return lines.join("\n");
}

function normalizeWorkflowStepFragment(fragment: string, stepIndent: number): string[] {
  const raw = fragment.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const nonEmpty = raw.filter((l) => l.trim() !== "");
  if (nonEmpty.length === 0) {
    throw new FeedbackApplyError("workflow_patch: empty content fragment");
  }
  const minIndent = Math.min(
    ...nonEmpty.map((l) => (l.match(/^(\s*)/)?.[1] ?? "").length),
  );
  const pad = " ".repeat(stepIndent);
  return raw.map((line) => {
    if (line.trim() === "") return "";
    return pad + line.slice(minIndent);
  });
}

function applyWorkflowPatch(
  project: Project,
  targetPath: string,
  content: string,
  rationale: string,
): string {
  const rel = assertSafeRelativePath(targetPath);
  if (!rel.startsWith(".github/workflows/") || !/\.ya?ml$/i.test(rel)) {
    throw new FeedbackApplyError(
      "workflow_patch target must be .github/workflows/*.yml or *.yaml",
    );
  }

  const abs = join(project.clonePath, rel);
  if (!existsSync(abs)) {
    throw new FeedbackApplyError(`workflow_patch: file not found: ${rel}`);
  }

  const existing = readFileSync(abs, "utf8");
  const next = appendWorkflowStepsFragment(existing, content);
  writeFileSync(abs, next.endsWith("\n") ? next : `${next}\n`, "utf8");

  const message =
    `ops(feedback/workflow_patch): append steps to ${rel}\n\n` +
    `why: ${rationale.trim() === "" ? "(미기재)" : rationale}\n\n` +
    `[opspilot feedback apply]`;
  return gitCommitRelPath(project, rel, message);
}

function parseClaudeAssetTarget(targetPath: string): { kind: AssetKind; name: string } {
  const rel = assertSafeRelativePath(targetPath);
  const parts = rel.split("/");
  if (parts[0] !== ".claude") {
    throw new FeedbackApplyError("agent/skill/command target must be under .claude/");
  }
  if (parts[1] === "agents" && parts[2]?.endsWith(".md")) {
    return { kind: "agent", name: parts[2].slice(0, -3) };
  }
  if (parts[1] === "commands" && parts[2]?.endsWith(".md")) {
    return { kind: "command", name: parts[2].slice(0, -3) };
  }
  if (parts[1] === "skills" && parts[2] && parts[3] === "SKILL.md") {
    return { kind: "skill", name: parts[2] };
  }
  throw new FeedbackApplyError(`unsupported .claude target path: ${targetPath}`);
}

/** HITL 승인된 proposal 을 프로젝트 clone 에 반영하고 git SHA 를 반환한다. */
export function applyProposalToProject(
  project: Project,
  proposal: ImprovementProposal,
): string {
  const summary = `feedback proposal ${proposal.id.slice(0, 8)} → ${posix.basename(proposal.targetPath)}`;

  if (proposal.targetKind === "cursor_rule") {
    return applyCursorRule(project, proposal.targetPath, proposal.content, proposal.rationale);
  }

  if (proposal.targetKind === "cursor_skill") {
    return applyCursorSkill(project, proposal.targetPath, proposal.content, proposal.rationale);
  }

  if (proposal.targetKind === "workflow_patch") {
    return applyWorkflowPatch(
      project,
      proposal.targetPath,
      proposal.content,
      proposal.rationale,
    );
  }

  const { kind, name } = parseClaudeAssetTarget(proposal.targetPath);
  if (kind !== proposal.targetKind) {
    throw new FeedbackApplyError(
      `targetKind ${proposal.targetKind} 와 path 불일치: ${proposal.targetPath}`,
    );
  }

  try {
    const { committed } = writeAsset(project, {
      kind,
      name,
      content: proposal.content,
      changeSummary: summary,
      rationale: proposal.rationale,
    });
    return committed;
  } catch (e) {
    if (e instanceof AuthoringError) {
      throw new FeedbackApplyError(e.message);
    }
    throw e;
  }
}
