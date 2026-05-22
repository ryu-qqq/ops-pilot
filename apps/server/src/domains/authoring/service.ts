import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AssetKind, Project } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import { getProject } from "../project/repository.js";
import { getAsset, latestContent, saveScan } from "../registry/repository.js";
import { scanRepo } from "../registry/scanner.js";

export class AuthoringError extends Error {}

export interface AuthorInput {
  kind: AssetKind;
  name: string;
  content: string;
  changeSummary: string;
  rationale: string;
}

// 자산 종류 → 클론 내 .claude 경로 (DATA_MODEL / 스캐너와 일치).
function assetRelPath(kind: AssetKind, name: string): string {
  if (kind === "agent") return join(".claude", "agents", `${name}.md`);
  if (kind === "command") return join(".claude", "commands", `${name}.md`);
  return join(".claude", "skills", name, "SKILL.md"); // skill
}

function git(clonePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: clonePath,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

/**
 * OpsPilot 통한 자산 저작/수정 → 클론 .claude 에 쓰고 *항상* 구조화 커밋.
 * 커밋이 곧 새 버전 (재스캔이 asset_version 으로 적재). 비버전 변경 불가 = 강제.
 */
export function writeAsset(
  project: Project,
  input: AuthorInput,
): { committed: string; scanned: { assets: number; versions: number } } {
  if (!/^[A-Za-z0-9._-]+$/.test(input.name)) {
    throw new AuthoringError("자산 이름은 영숫자/._- 만 허용");
  }
  if (input.changeSummary.trim() === "") {
    throw new AuthoringError("변경 요약(무엇)은 필수 — 버저닝 강제");
  }

  const rel = assetRelPath(input.kind, input.name);
  const abs = join(project.clonePath, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, input.content.endsWith("\n") ? input.content : `${input.content}\n`, "utf8");

  // 구조화 커밋: 무엇/왜를 메시지에 강제로 박는다. (사람이 까먹어도 자동)
  const message =
    `ops(${input.kind}/${input.name}): ${input.changeSummary}\n\n` +
    `why: ${input.rationale.trim() === "" ? "(미기재)" : input.rationale}\n\n` +
    `[opspilot authored]`;
  git(project.clonePath, ["add", "--", rel]);
  let committed: string;
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
      rel,
    ]);
    committed = git(project.clonePath, ["rev-parse", "HEAD"]);
  } catch (e) {
    throw new AuthoringError(`커밋 실패(변경 없음?): ${(e as Error).message.slice(0, 300)}`);
  }

  // 커밋 = 버전. 재스캔으로 asset_version 자동 적재 (멱등).
  const scanned = scanRepo(project.clonePath);
  const saved = saveScan(project.id, scanned);
  return { committed, scanned: saved };
}

/**
 * OPSP-45: 비교/벤치마크로 고른 과거 버전을 자산의 "현재"로 채택.
 * git 선형 모델("앞으로 감기") — 그 버전의 본문을 클론 .claude 에 다시 쓰고
 * 구조화 커밋해 새 latest 버전을 만든다. git revert/checkout 을 사용자가 직접
 * 만지지 않게 — "저작은 늘 강제 커밋" 철학 유지.
 */
export function adoptVersion(
  assetVersionId: string,
  note: string,
): { committed: string; scanned: { assets: number; versions: number } } {
  const ver = getDb()
    .prepare(
      "SELECT content, git_commit AS gitCommit, asset_id AS assetId FROM asset_version WHERE id = ?",
    )
    .get(assetVersionId) as { content: string; gitCommit: string; assetId: string } | undefined;
  if (!ver) throw new AuthoringError("자산 버전을 찾을 수 없습니다");

  const asset = getAsset(ver.assetId);
  if (!asset) throw new AuthoringError("자산을 찾을 수 없습니다");
  const project = getProject(asset.projectId);
  if (!project) throw new AuthoringError("프로젝트를 찾을 수 없습니다");

  // 채택할 내용이 이미 현재 최신과 같으면 거부 — no-op 커밋 방지(친화 메시지).
  const latest = latestContent(ver.assetId);
  if (latest !== undefined && latest.trimEnd() === ver.content.trimEnd()) {
    throw new AuthoringError("이 버전의 내용이 이미 현재 최신과 같습니다 — 채택 불필요");
  }

  const short = ver.gitCommit.slice(0, 8);
  return writeAsset(project, {
    kind: asset.kind,
    name: asset.name,
    content: ver.content,
    changeSummary: `버전 ${short} 채택 (앞으로 감기)`,
    rationale: note.trim() === "" ? `버전 ${short} 을(를) 현재 버전으로 채택` : note.trim(),
  });
}
