import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

// 클론 저장 베이스. 기본 ~/.opspilot/projects, OPS_PROJECTS_DIR 로 변경.
export function projectsBaseDir(): string {
  return process.env.OPS_PROJECTS_DIR ?? join(homedir(), ".opspilot", "projects");
}

export class ProjectCloneError extends Error {}
export class ProjectLinkError extends Error {}

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

/** origin ↔ gitUrl 비교용 (REG-02). */
export function normalizeGitUrl(url: string): string {
  let u = url.trim().replace(/\.git$/i, "").replace(/\/$/, "");
  const ssh = /^git@([^:]+):(.+)$/.exec(u);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  return u.toLowerCase();
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

export interface LinkLocalInput {
  localPath: string;
  gitUrl?: string;
}

export interface LinkLocalResult {
  clonePath: string;
  gitUrl: string;
  defaultBranch: string | null;
  remoteVerified: boolean;
}

// REG-02: 기존 로컬 checkout 연결 — clone 없음.
export function linkLocalProject(input: LinkLocalInput): LinkLocalResult {
  const clonePath = resolve(input.localPath);
  if (!existsSync(clonePath)) {
    throw new ProjectLinkError(`경로 없음: ${clonePath}`);
  }
  try {
    git(["rev-parse", "--git-dir"], clonePath);
  } catch {
    throw new ProjectLinkError(`git 레포 아님: ${clonePath}`);
  }

  let originUrl: string | null = null;
  try {
    originUrl = git(["remote", "get-url", "origin"], clonePath);
  } catch {
    originUrl = null;
  }

  let gitUrl: string;
  let remoteVerified = false;
  if (input.gitUrl !== undefined && input.gitUrl.trim() !== "") {
    gitUrl = input.gitUrl.trim();
    if (originUrl !== null) {
      if (normalizeGitUrl(originUrl) === normalizeGitUrl(gitUrl)) {
        remoteVerified = true;
      } else {
        throw new ProjectLinkError(
          `origin(${originUrl})과 gitUrl(${gitUrl})이 일치하지 않습니다`,
        );
      }
    }
  } else if (originUrl !== null) {
    gitUrl = originUrl;
    remoteVerified = true;
  } else {
    throw new ProjectLinkError("gitUrl을 지정하거나 origin remote가 필요합니다");
  }

  let defaultBranch: string | null = null;
  try {
    defaultBranch = git(["symbolic-ref", "--short", "HEAD"], clonePath) || null;
  } catch {
    defaultBranch = null;
  }

  return { clonePath, gitUrl, defaultBranch, remoteVerified };
}

export function defaultNameFromPath(localPath: string): string {
  return basename(resolve(localPath));
}

// 스캔 전 최신화 (best-effort — 실패해도 기존 클론으로 진행).
export function pullProject(clonePath: string): void {
  try {
    git(["pull", "--ff-only"], clonePath);
  } catch {
    /* offline/divergence 무시 */
  }
}
