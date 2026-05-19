import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 클론 저장 베이스. 기본 ~/.opspilot/projects, OPS_PROJECTS_DIR 로 변경.
export function projectsBaseDir(): string {
  return process.env.OPS_PROJECTS_DIR ?? join(homedir(), ".opspilot", "projects");
}

export class ProjectCloneError extends Error {}

// git URL → 디렉터리 슬러그 (owner__repo).
export function slugFromUrl(gitUrl: string): string {
  const cleaned = gitUrl
    .replace(/\.git$/, "")
    .replace(/^git@[^:]+:/, "")
    .replace(/^https?:\/\/[^/]+\//, "");
  const slug = cleaned.replace(/[^A-Za-z0-9._-]+/g, "__").replace(/^_+|_+$/g, "");
  if (slug === "") throw new ProjectCloneError(`git URL 에서 이름을 못 만듦: ${gitUrl}`);
  return slug;
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

export interface CloneResult {
  clonePath: string;
  defaultBranch: string | null;
}

// blob 없는 부분 클론으로 빠르게. 이미 있으면 에러(중복 등록 방지).
export function cloneProject(gitUrl: string): CloneResult {
  const base = projectsBaseDir();
  mkdirSync(base, { recursive: true });
  const clonePath = join(base, slugFromUrl(gitUrl));
  if (existsSync(clonePath)) {
    throw new ProjectCloneError(`이미 클론 위치가 존재: ${clonePath}`);
  }
  try {
    git(["clone", "--filter=blob:none", gitUrl, clonePath]);
  } catch (e) {
    throw new ProjectCloneError(`git clone 실패: ${(e as Error).message.slice(0, 400)}`);
  }
  let defaultBranch: string | null = null;
  try {
    defaultBranch = git(["symbolic-ref", "--short", "HEAD"], clonePath) || null;
  } catch {
    defaultBranch = null;
  }
  return { clonePath, defaultBranch };
}

// 스캔 전 최신화 (best-effort — 실패해도 기존 클론으로 진행).
export function pullProject(clonePath: string): void {
  try {
    git(["pull", "--ff-only"], clonePath);
  } catch {
    /* offline/divergence 무시 */
  }
}
