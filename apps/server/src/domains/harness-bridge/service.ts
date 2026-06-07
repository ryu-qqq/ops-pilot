import { execFileSync } from "node:child_process";
import type { Project } from "@opspilot/shared-types";
import {
  HarnessBridgeSyncError,
  applyCursorHarnessSync,
  assertClonePath,
  listStaleDerivedRules,
  planCursorHarnessSync,
  type HarnessBridgePlanItem,
} from "./sync.js";
import { applyClaudeRulesBridge } from "./claude-rules-bridge.js";

export { HarnessBridgeSyncError } from "./sync.js";

export interface SyncCursorHarnessOptions {
  dryRun?: boolean;
  commit?: boolean;
}

export interface SyncCursorHarnessResult {
  dryRun: boolean;
  plan: HarnessBridgePlanItem[];
  written: string[];
  commit: string | null;
  staleDerivedRules: string[];
  skippedReason?: string;
}

function git(clonePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: clonePath,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function gitCommitPaths(project: Project, paths: string[]): string | null {
  if (paths.length === 0) return null;
  for (const rel of paths) {
    git(project.clonePath, ["add", "-f", "--", rel]);
  }
  try {
    git(project.clonePath, ["diff", "--cached", "--quiet", "--", ...paths]);
    return null;
  } catch {
    // has staged changes
  }
  try {
    git(project.clonePath, [
      "-c",
      "user.email=opspilot@local",
      "-c",
      "user.name=OpsPilot",
      "commit",
      "-m",
      `ops(harness-bridge): sync .claude → .cursor

why: Cursor Composer가 Claude harness derived layer를 소비

[opspilot harness-bridge]`,
      "--",
      ...paths,
    ]);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("nothing to commit") || msg.includes("no changes added to commit")) {
      return null;
    }
    throw new HarnessBridgeSyncError(`bridge commit failed: ${msg.slice(0, 300)}`);
  }
  return git(project.clonePath, ["rev-parse", "HEAD"]);
}

/** `.claude` SSOT → `.cursor` derived mirror (linked·managed 공통). */
export function syncCursorHarnessForProject(
  project: Project,
  opts: SyncCursorHarnessOptions = {},
): SyncCursorHarnessResult {
  assertClonePath(project.clonePath);
  const dryRun = opts.dryRun === true;
  const plan = planCursorHarnessSync(project.clonePath);
  const staleDerivedRules = listStaleDerivedRules(project.clonePath);

  if (dryRun) {
    return {
      dryRun: true,
      plan,
      written: plan.filter((p) => p.action !== "unchanged").map((p) => p.relPath),
      commit: null,
      staleDerivedRules,
    };
  }

  const written = applyCursorHarnessSync(project.clonePath);
  const claudeBridge = applyClaudeRulesBridge(project.clonePath);
  written.push(...claudeBridge.written);
  const shouldCommit = opts.commit !== false;
  const commit = shouldCommit ? gitCommitPaths(project, written) : null;

  return {
    dryRun: false,
    plan,
    written,
    commit,
    staleDerivedRules,
  };
}

/** linked 프로젝트 apply 후 best-effort bridge sync. */
export function maybeSyncCursorHarnessAfterApply(project: Project): SyncCursorHarnessResult | null {
  if (project.workspaceMode !== "linked") {
    return null;
  }
  try {
    return syncCursorHarnessForProject(project, { dryRun: false, commit: true });
  } catch (e) {
    const msg = e instanceof HarnessBridgeSyncError ? e.message : (e as Error).message;
    return {
      dryRun: false,
      plan: [],
      written: [],
      commit: null,
      staleDerivedRules: [],
      skippedReason: msg,
    };
  }
}
