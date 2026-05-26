import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Project } from "@opspilot/shared-types";

const SYNC_DIRS = ["agents", "skills", "references"] as const;
const DEFAULT_CREW_PATH = join(homedir(), "Documents/ryu-qqq/agent-crew");
const DEFAULT_SOURCE = "git@github.com:ryu-qqq/agent-crew.git";

export class AgentCrewSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentCrewSyncError";
  }
}

export interface AgentCrewLockFile {
  version: string;
  tag?: string;
  commit?: string;
  source?: string;
  syncedAt?: string;
  includes?: string[];
}

export interface AgentCrewSyncResult {
  tag: string;
  commit: string;
  source: string;
  crewRepoPath: string;
  copiedDirs: string[];
  lockPath: string;
  missingFeedbackAgents: string[];
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}

function parseLockYaml(text: string): Partial<AgentCrewLockFile> {
  const pick = (key: string) => text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    version: pick("version"),
    tag: pick("tag"),
    commit: pick("commit"),
    source: pick("source"),
    syncedAt: pick("syncedAt"),
  };
}

function readProjectYamlAgentCrew(clonePath: string): Partial<AgentCrewLockFile> {
  const yamlPath = join(clonePath, ".claude/project.yaml");
  if (!existsSync(yamlPath)) return {};
  const text = readFileSync(yamlPath, "utf8");
  const block = text.match(/agentCrew:\s*\n((?: {2}.+\n?)+)/);
  if (!block?.[1]) return {};
  return parseLockYaml(block[1].replace(/^ {2}/gm, ""));
}

export function readAgentCrewLock(clonePath: string): AgentCrewLockFile | null {
  const lockPath = join(clonePath, ".claude/agent-crew.lock");
  if (existsSync(lockPath)) {
    const parsed = parseLockYaml(readFileSync(lockPath, "utf8"));
    if (parsed.version) return parsed as AgentCrewLockFile;
  }
  const fromYaml = readProjectYamlAgentCrew(clonePath);
  if (fromYaml.version) {
    return {
      version: fromYaml.version,
      tag: fromYaml.tag ?? fromYaml.version,
      source: fromYaml.source ?? DEFAULT_SOURCE,
    };
  }
  return null;
}

function resolveTargetTag(clonePath: string, tagOverride?: string): string {
  if (tagOverride) return tagOverride;
  const lock = readAgentCrewLock(clonePath);
  if (!lock) {
    throw new AgentCrewSyncError(
      ".claude/agent-crew.lock 또는 project.yaml agentCrew.version 없음 — tag 지정 또는 lock 생성 필요",
    );
  }
  return lock.tag ?? lock.version;
}

function resolveCrewRepoPath(): string {
  const path = process.env.OPS_AGENT_CREW_PATH ?? DEFAULT_CREW_PATH;
  if (!existsSync(join(path, ".git"))) {
    throw new AgentCrewSyncError(
      `agent-crew repo not found: ${path} (OPS_AGENT_CREW_PATH 또는 clone 필요)`,
    );
  }
  return path;
}

function checkoutTag(crewRepoPath: string, tag: string): string {
  try {
    git(crewRepoPath, ["fetch", "--tags", "origin"]);
  } catch {
    // offline/local tag only
  }
  git(crewRepoPath, ["checkout", "--force", tag]);
  return git(crewRepoPath, ["rev-parse", "HEAD"]);
}

function writeLockFile(
  clonePath: string,
  tag: string,
  commit: string,
  source: string,
): string {
  const lockPath = join(clonePath, ".claude/agent-crew.lock");
  const syncedAt = new Date().toISOString();
  const body = `# agent-crew 핀 — OpsPilot sync_agent_crew 로 갱신
version: ${tag}
commit: ${commit}
source: ${source}
tag: ${tag}
syncedAt: "${syncedAt}"
includes:
  - agents/
  - skills/
  - references/
`;
  mkdirSync(join(clonePath, ".claude"), { recursive: true });
  writeFileSync(lockPath, body, "utf8");
  return lockPath;
}

function patchProjectYamlVersion(clonePath: string, tag: string): void {
  const yamlPath = join(clonePath, ".claude/project.yaml");
  if (!existsSync(yamlPath)) return;
  const text = readFileSync(yamlPath, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  let next = text.replace(/(\nagentCrew:\s*\n(?: {2}.+\n)*? {2}version:\s*)v[\d.]+/m, `$1${tag}`);
  if (next === text) {
    next = text.replace(/(agentCrew:\s*\n(?: {2}.+\n)*? {2}version:\s*)v[\d.]+/m, `$1${tag}`);
  }
  next = next.replace(/(syncedAt:\s*")[^"]*(")/, `$1${today}$2`);
  if (next !== text) writeFileSync(yamlPath, next, "utf8");
}

function copySyncDirs(crewRepoPath: string, clonePath: string): string[] {
  const copied: string[] = [];
  const claudeDir = join(clonePath, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  for (const dir of SYNC_DIRS) {
    const src = join(crewRepoPath, dir);
    if (!existsSync(src)) continue;
    const dest = join(claudeDir, dir);
    cpSync(src, dest, { recursive: true, force: true });
    copied.push(dir);
  }
  return copied;
}

function listMissingFeedbackAgents(clonePath: string): string[] {
  const required = ["work-evaluator", "proposal-reviewer"];
  const agentsDir = join(clonePath, ".claude/agents");
  if (!existsSync(agentsDir)) return required;
  return required.filter((name) => !existsSync(join(agentsDir, `${name}.md`)));
}

/** agent-crew tag → 소비 프로젝트 clone `.claude/` sync (project.yaml·lock 제외 덮어쓰기). */
export function syncAgentCrewToProject(project: Project, tagOverride?: string): AgentCrewSyncResult {
  const tag = resolveTargetTag(project.clonePath, tagOverride);
  const crewRepoPath = resolveCrewRepoPath();
  const lock = readAgentCrewLock(project.clonePath);
  const source = lock?.source ?? DEFAULT_SOURCE;

  const commit = checkoutTag(crewRepoPath, tag);
  const copiedDirs = copySyncDirs(crewRepoPath, project.clonePath);
  const lockPath = writeLockFile(project.clonePath, tag, commit, source);
  patchProjectYamlVersion(project.clonePath, tag);

  return {
    tag,
    commit,
    source,
    crewRepoPath,
    copiedDirs,
    lockPath,
    missingFeedbackAgents: listMissingFeedbackAgents(project.clonePath),
  };
}

export function checkAgentCrewDrift(project: Project): {
  drift: boolean;
  lockTag: string | null;
  lockCommit: string | null;
  projectYamlTag: string | null;
} {
  const lock = readAgentCrewLock(project.clonePath);
  const yaml = readProjectYamlAgentCrew(project.clonePath);
  const lockTag = lock?.tag ?? lock?.version ?? null;
  const projectYamlTag = yaml.version ?? null;
  const drift =
    lockTag !== null && projectYamlTag !== null && lockTag !== projectYamlTag;
  return { drift, lockTag, lockCommit: lock?.commit ?? null, projectYamlTag };
}
