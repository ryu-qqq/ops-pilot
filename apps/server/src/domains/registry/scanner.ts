import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import matter from "gray-matter";
import type { AssetKind, AssetScope } from "@opspilot/shared-types";

// 스캔 결과(아직 DB 행 아님). git 커밋 = 버전 (CONVENTIONS / DATA_MODEL).
export interface ScannedVersion {
  gitCommit: string;
  gitRef: string | null;
  committedAt: string;
  commitMessage: string | null;
  content: string;
  contentHash: string;
}
export interface ScannedAsset {
  kind: AssetKind;
  name: string;
  scope: AssetScope;
  sourcePath: string; // 레포 기준 상대 경로
  description: string | null;
  versions: ScannedVersion[];
}

const MAX_VERSIONS_PER_ASSET = 50;

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function currentGitRef(root: string): string | null {
  try {
    return git(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || null;
  } catch {
    return null;
  }
}

// 한 파일의 git 이력 → 커밋별 스냅샷. --follow 로 rename 추적.
function versionsOf(repoPath: string, relPath: string, currentRef: string | null): ScannedVersion[] {
  let log: string;
  try {
    log = git(repoPath, [
      "log",
      `-n${String(MAX_VERSIONS_PER_ASSET)}`,
      "--follow",
      "--format=%H%x1f%cI%x1f%s",
      "--",
      relPath,
    ]);
  } catch {
    return [];
  }
  if (!log) return [];

  const versions: ScannedVersion[] = [];
  for (const line of log.split("\n")) {
    const [commit, committedAt, message] = line.split("\x1f");
    if (!commit || !committedAt) continue;
    let content: string;
    try {
      content = git(repoPath, ["show", `${commit}:${relPath}`]);
    } catch {
      continue;
    }
    versions.push({
      gitCommit: commit,
      gitRef: currentRef,
      committedAt: new Date(committedAt).toISOString(),
      commitMessage: message ?? null,
      content,
      contentHash: sha256(content),
    });
  }
  return versions;
}

function parseMeta(filePath: string, fallbackName: string): { name: string; description: string | null } {
  const raw = readFileSync(filePath, "utf8");
  try {
    const fm = matter(raw).data as { name?: unknown; description?: unknown };
    return {
      name: typeof fm.name === "string" && fm.name.length > 0 ? fm.name : fallbackName,
      description: typeof fm.description === "string" ? fm.description : null,
    };
  } catch {
    return { name: fallbackName, description: null };
  }
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && statSync(join(dir, f)).isFile())
    .map((f) => join(dir, f));
}

function listMdc(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdc") && statSync(join(dir, f)).isFile())
    .map((f) => join(dir, f));
}

function basenameNoExt(filePath: string, ext: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(new RegExp(`${ext.replace(".", "\\.")}$`), "");
}

function scanClaudeAssets(root: string, scope: AssetScope, currentRef: string | null): ScannedAsset[] {
  const claudeDir = join(root, ".claude");
  if (!existsSync(claudeDir)) {
    throw new Error(`.claude 디렉터리가 없습니다: ${claudeDir}`);
  }

  const assets: ScannedAsset[] = [];
  const add = (kind: AssetKind, filePath: string, fallback: string) => {
    const relPath = relative(root, filePath).split("\\").join("/");
    const meta = parseMeta(filePath, fallback);
    assets.push({
      kind,
      name: meta.name,
      scope,
      sourcePath: relPath,
      description: meta.description,
      versions: versionsOf(root, relPath, currentRef),
    });
  };

  for (const f of listMarkdown(join(claudeDir, "agents"))) {
    add("agent", f, basenameNoExt(f, ".md"));
  }
  const skillsDir = join(claudeDir, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      const skillFile = join(skillsDir, entry, "SKILL.md");
      if (existsSync(skillFile)) add("skill", skillFile, entry);
    }
  }
  for (const f of listMarkdown(join(claudeDir, "commands"))) {
    add("command", f, basenameNoExt(f, ".md"));
  }

  return assets;
}

/** `.cursor/` derived harness (BRIDGE-04). 없으면 []. */
function scanCursorAssets(root: string, scope: AssetScope, currentRef: string | null): ScannedAsset[] {
  const cursorDir = join(root, ".cursor");
  if (!existsSync(cursorDir)) return [];

  const assets: ScannedAsset[] = [];
  const add = (kind: AssetKind, filePath: string, fallback: string) => {
    const relPath = relative(root, filePath).split("\\").join("/");
    const meta = parseMeta(filePath, fallback);
    assets.push({
      kind,
      name: meta.name,
      scope,
      sourcePath: relPath,
      description: meta.description,
      versions: versionsOf(root, relPath, currentRef),
    });
  };

  const skillsDir = join(cursorDir, "skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      const skillFile = join(skillsDir, entry, "SKILL.md");
      if (existsSync(skillFile)) add("cursor_skill", skillFile, entry);
    }
  }
  for (const f of listMarkdown(join(cursorDir, "commands"))) {
    add("cursor_command", f, basenameNoExt(f, ".md"));
  }
  for (const f of listMdc(join(cursorDir, "rules"))) {
    add("cursor_rule", f, basenameNoExt(f, ".mdc"));
  }

  return assets;
}

/** `.claude/` + `.cursor/` harness 자산 + git 버전 목록. */
export function scanRepo(repoPath: string): ScannedAsset[] {
  const root = resolve(repoPath);
  const claudeDir = join(root, ".claude");
  const scope: AssetScope = claudeDir === join(homedir(), ".claude") ? "user" : "project";
  const currentRef = currentGitRef(root);

  return [...scanClaudeAssets(root, scope, currentRef), ...scanCursorAssets(root, scope, currentRef)];
}
