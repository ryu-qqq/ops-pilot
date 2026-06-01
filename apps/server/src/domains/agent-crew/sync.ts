import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Project } from "@opspilot/shared-types";

const SYNC_DIRS = ["agents", "skills", "references"] as const;
const DEFAULT_CREW_PATH = join(homedir(), "Documents/ryu-qqq/agent-crew");
const DEFAULT_SOURCE = "git@github.com:ryu-qqq/agent-crew.git";

const MUST_REF_BEGIN = "<!-- agent-crew:must-reference:begin (auto-managed by ops-pilot — do not edit by hand) -->";
const MUST_REF_END = "<!-- agent-crew:must-reference:end -->";
const MUST_REF_BLOCK_RE = /<!-- agent-crew:must-reference:begin[\s\S]*?<!-- agent-crew:must-reference:end -->\n?/;

/** mustReference 배열에 항상 포함되는 핵심 키 — 빠지면 블록 자체를 제거한다. */
const PRINCIPLES_KEY = "work-evaluator-4-principles";
/** "활성화된 컨벤션" 섹션 — project.yaml.mustReference 키 → 표시 줄. */
const CONVENTION_LINES: Record<string, string> = {
  "commit-format": "- 커밋 메시지: `agent-crew/references/conventions/commit-format.md`",
  "pr-title": "- PR 제목: `agent-crew/references/conventions/pr-title.md`",
};
const CURSOR_RULE_REL = ".cursor/rules/agent-crew-must.mdc";

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
  mustReference: MustReferenceResult;
  tagSource: "override" | "project-yaml-newer" | "lock";
}

export type ProjectIde = "claude-code" | "cursor";
/** project.yaml project.ide 값 — both 는 두 IDE 모두에 주입. */
export type ProjectIdeConfig = ProjectIde | "both";

export interface MustReferenceTarget {
  ide: ProjectIde;
  targetPath: string;
  action: "injected" | "replaced" | "removed";
}

export interface MustReferenceResult {
  /** 하나 이상의 타겟 파일을 실제로 쓰거나 지웠는가. */
  applied: boolean;
  /** project.yaml.agentCrew.mustReference 에서 읽은 활성 키 목록. */
  items: string[];
  /** 실제 주입/제거된 파일들 (both 면 2개). */
  targets: MustReferenceTarget[];
  /** applied=false 또는 부분 동작 시 사유. */
  reason?: string;
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

/** lock 파일만 읽는다 (project.yaml 폴백 없음 — tag 출처 비교용). */
function readLockFileOnly(clonePath: string): AgentCrewLockFile | null {
  const lockPath = join(clonePath, ".claude/agent-crew.lock");
  if (!existsSync(lockPath)) return null;
  const parsed = parseLockYaml(readFileSync(lockPath, "utf8"));
  return parsed.version ? (parsed as AgentCrewLockFile) : null;
}

export function readAgentCrewLock(clonePath: string): AgentCrewLockFile | null {
  const fromLock = readLockFileOnly(clonePath);
  if (fromLock) return fromLock;
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

/** semver(앞의 v 허용) 비교 — a>b 면 양수. 비교 불가 토큰은 0 취급. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

type TagSource = AgentCrewSyncResult["tagSource"];

/**
 * sync 대상 tag 와 그 출처를 결정한다.
 * - override: 호출자가 tag 명시
 * - project-yaml-newer: project.yaml.agentCrew.version 이 lock 보다 신버전(또는 lock 부재)
 * - lock: lock 핀 사용 (project.yaml 이 같거나 구버전)
 * 이로써 "lock 만 보고 신버전 project.yaml 을 다운그레이드" 함정을 막는다.
 */
function resolveTargetTag(clonePath: string, tagOverride?: string): { tag: string; source: TagSource } {
  if (tagOverride) return { tag: tagOverride, source: "override" };
  const lock = readLockFileOnly(clonePath);
  const lockTag = lock?.tag ?? lock?.version ?? null;
  const yamlTag = readProjectYamlAgentCrew(clonePath).version ?? null;
  if (!lockTag && !yamlTag) {
    throw new AgentCrewSyncError(
      ".claude/agent-crew.lock 또는 project.yaml agentCrew.version 없음 — tag 지정 또는 lock 생성 필요",
    );
  }
  if (yamlTag && (!lockTag || compareVersions(yamlTag, lockTag) > 0)) {
    return { tag: yamlTag, source: "project-yaml-newer" };
  }
  return { tag: lockTag as string, source: "lock" };
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

/** 소비 프로젝트 project.yaml 에서 project.ide 와 agentCrew.mustReference 배열을 읽는다. */
function readMustReferenceConfig(clonePath: string): { ide: ProjectIdeConfig | null; items: string[] } {
  const yamlPath = join(clonePath, ".claude/project.yaml");
  if (!existsSync(yamlPath)) return { ide: null, items: [] };
  const text = readFileSync(yamlPath, "utf8");
  const ide = (text.match(/^\s*ide:\s*(claude-code|cursor|both)\b/m)?.[1] ?? null) as ProjectIdeConfig | null;
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\s*mustReference:\s*$/.test(line));
  const items: string[] = [];
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^\s*#/.test(line)) continue; // 주석 처리된 항목은 비활성
      const match = line.match(/^\s+-\s+(\S+)/);
      if (match?.[1]) {
        items.push(match[1]);
        continue;
      }
      break; // 빈 줄 또는 다음 키 = 리스트 끝
    }
  }
  return { ide, items };
}

/** MUST 블록 본문(마커 제외)을 구성한다. IDE 별로 work-evaluator 경로만 다르다. */
function buildMustReferenceBody(items: string[], ide: ProjectIde): string {
  const workEvalPath = ide === "cursor" ? "agent-crew/agents/work-evaluator.md" : "agents/work-evaluator.md";
  const conventionLines = items
    .filter((key) => key !== PRINCIPLES_KEY)
    .map((key) => CONVENTION_LINES[key] ?? `- \`${key}\``);
  const lines = [
    "# ⚠️ MUST — 작업 시작 전 반드시 참조",
    "",
    "이 프로젝트는 agent-crew 공유 자산을 사용한다. 모든 작업(코드·문서·자산 저작)은",
    "다음 원칙·컨벤션을 **먼저 읽고** 그 기준으로 수행한다.",
    "",
    "## 작업 원칙 4줄 (work-evaluator 채점 축)",
    "",
    "1. **가정하지 마라.** 모르면 묻는다. 혼란을 숨기지 말고 트레이드오프를 드러낸다.",
    "2. **최소만 만들어라.** 문제를 푸는 최소한의 코드·자산만. 추측성 산출 금지.",
    "3. **범위를 지켜라.** 꼭 필요한 것만 건드린다. 요청보다 부푼 diff 금지.",
    "4. **성공 기준을 정하고 검증하라.** 완료 조건을 명시하고, 검증될 때까지 돈다.",
    "",
    "> 작업이 끝났다고 보고하기 전에 위 4축으로 self-check 한다.",
    `> 모호하면 \`${workEvalPath}\` 본문을 직접 Read.`,
  ];
  if (conventionLines.length > 0) {
    lines.push("", "## 활성화된 컨벤션", "", ...conventionLines);
  }
  return lines.join("\n");
}

/** Claude Code: CLAUDE.md 맨 위 마커 블록을 idempotent 주입/교체. */
function applyClaudeCode(clonePath: string, items: string[]): MustReferenceTarget {
  const targetPath = join(clonePath, "CLAUDE.md");
  const block = `${MUST_REF_BEGIN}\n${buildMustReferenceBody(items, "claude-code")}\n\n${MUST_REF_END}`;
  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  if (MUST_REF_BLOCK_RE.test(existing)) {
    writeFileSync(targetPath, existing.replace(MUST_REF_BLOCK_RE, `${block}\n`), "utf8");
    return { ide: "claude-code", targetPath, action: "replaced" };
  }
  const next = existing.length > 0 ? `${block}\n\n${existing}` : `${block}\n`;
  writeFileSync(targetPath, next, "utf8");
  return { ide: "claude-code", targetPath, action: "injected" };
}

/** Cursor: .cursor/rules/agent-crew-must.mdc (alwaysApply) 파일 전체를 쓴다. */
function applyCursor(clonePath: string, items: string[], tag: string): MustReferenceTarget {
  const targetPath = join(clonePath, CURSOR_RULE_REL);
  const existed = existsSync(targetPath);
  const frontmatter = [
    "---",
    "description: agent-crew 공유 자산 강제 참조 룰 — 모든 요청에 자동 주입",
    'globs: ["*"]',
    "alwaysApply: true",
    "---",
    "",
  ].join("\n");
  const footer = [
    "",
    "---",
    "",
    `${MUST_REF_BEGIN}`,
    `<!-- 동기화 정보: agent-crew ${tag} -->`,
    `${MUST_REF_END}`,
    "",
  ].join("\n");
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${frontmatter}${buildMustReferenceBody(items, "cursor")}\n${footer}`, "utf8");
  return { ide: "cursor", targetPath, action: existed ? "replaced" : "injected" };
}

/** 비활성(work-evaluator-4-principles 부재) 시 기존 블록/파일을 제거. */
function removeMustReference(clonePath: string, ide: ProjectIde): MustReferenceTarget | null {
  if (ide === "claude-code") {
    const targetPath = join(clonePath, "CLAUDE.md");
    if (!existsSync(targetPath)) return null;
    const content = readFileSync(targetPath, "utf8");
    if (!MUST_REF_BLOCK_RE.test(content)) return null;
    writeFileSync(targetPath, content.replace(MUST_REF_BLOCK_RE, ""), "utf8");
    return { ide, targetPath, action: "removed" };
  }
  const targetPath = join(clonePath, CURSOR_RULE_REL);
  if (!existsSync(targetPath)) return null;
  rmSync(targetPath);
  return { ide, targetPath, action: "removed" };
}

/**
 * project.yaml.ide + agentCrew.mustReference 를 읽어 IDE 별 강제 참조 스니펫을 배포한다.
 * work-evaluator-4-principles 가 빠지면 블록 자체를 제거한다 (스펙: 핵심 키 부재 = 블록 제거).
 */
function applyMustReference(clonePath: string, tag: string): MustReferenceResult {
  const { ide, items } = readMustReferenceConfig(clonePath);
  if (!ide) {
    return { applied: false, items, targets: [], reason: "project.yaml project.ide 미설정 — 스니펫 배포 생략" };
  }
  const targetIdes: ProjectIde[] = ide === "both" ? ["claude-code", "cursor"] : [ide];
  const active = items.includes(PRINCIPLES_KEY);
  const targets: MustReferenceTarget[] = [];
  for (const targetIde of targetIdes) {
    if (active) {
      targets.push(
        targetIde === "claude-code"
          ? applyClaudeCode(clonePath, items)
          : applyCursor(clonePath, items, tag),
      );
    } else {
      const removed = removeMustReference(clonePath, targetIde);
      if (removed) targets.push(removed);
    }
  }
  if (active) {
    return { applied: true, items, targets };
  }
  return {
    applied: targets.length > 0,
    items,
    targets,
    reason:
      targets.length > 0
        ? "work-evaluator-4-principles 부재 — 기존 MUST 블록 제거"
        : "work-evaluator-4-principles 부재 — 주입 생략",
  };
}

/** agent-crew tag → 소비 프로젝트 clone `.claude/` sync (project.yaml·lock 제외 덮어쓰기). */
export function syncAgentCrewToProject(project: Project, tagOverride?: string): AgentCrewSyncResult {
  const { tag, source: tagSource } = resolveTargetTag(project.clonePath, tagOverride);
  const crewRepoPath = resolveCrewRepoPath();
  const lock = readAgentCrewLock(project.clonePath);
  const source = lock?.source ?? DEFAULT_SOURCE;

  const commit = checkoutTag(crewRepoPath, tag);
  const copiedDirs = copySyncDirs(crewRepoPath, project.clonePath);
  const lockPath = writeLockFile(project.clonePath, tag, commit, source);
  patchProjectYamlVersion(project.clonePath, tag);
  const mustReference = applyMustReference(project.clonePath, tag);

  return {
    tag,
    commit,
    source,
    crewRepoPath,
    copiedDirs,
    lockPath,
    missingFeedbackAgents: listMissingFeedbackAgents(project.clonePath),
    mustReference,
    tagSource,
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
