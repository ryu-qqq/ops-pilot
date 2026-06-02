import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AssetKind, Project } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";
import { getProject } from "../project/repository.js";
import { validateFrontmatter } from "../asset-lint/validate.js";
import {
  deleteAssetRow,
  getAsset,
  latestContent,
  saveScan,
} from "../registry/repository.js";
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
  // frontmatter 검증 게이트 — 깨진 frontmatter·트리거 안 될 description 을 저작 시점에 차단.
  const lint = validateFrontmatter(input.kind, input.content);
  const errors = lint.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new AuthoringError(
      `frontmatter 검증 실패: ${errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`,
    );
  }

  const rel = assetRelPath(input.kind, input.name);
  const abs = join(project.clonePath, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    input.content.endsWith("\n") ? input.content : `${input.content}\n`,
    "utf8",
  );

  // 구조화 커밋: 무엇/왜를 메시지에 강제로 박는다. (사람이 까먹어도 자동)
  const message =
    `ops(${input.kind}/${input.name}): ${input.changeSummary}\n\n` +
    `why: ${input.rationale.trim() === "" ? "(미기재)" : input.rationale}\n\n` +
    `[opspilot authored]`;
  git(project.clonePath, ["add", "-f", "--", rel]);
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
    throw new AuthoringError(
      `커밋 실패(변경 없음?): ${(e as Error).message.slice(0, 300)}`,
    );
  }

  // 커밋 = 버전. 재스캔으로 asset_version 자동 적재 (멱등).
  const scanned = scanRepo(project.clonePath);
  const saved = saveScan(project.id, scanned);
  return { committed, scanned: saved };
}

/**
 * 카드 C(prune): 미사용 project-local 자산을 삭제.
 * writeAsset 의 대칭 미러 — 클론 .claude 에서 파일을 제거하고 *항상* 구조화 커밋
 * (git=버전 단일원천), 그리고 DB asset 행을 하드 삭제(재스캔은 upsert 라 안 지움).
 * 가드: source==="project-local" 만 허용(crew/unknown 공용 오삭제 차단),
 *       종류는 agent/skill/command(.claude) 만(파생 cursor 하네스 제외).
 */
export function deleteAsset(
  assetId: string,
  rationale: string,
): { committed: string } {
  const asset = getAsset(assetId);
  if (!asset) throw new AuthoringError("자산을 찾을 수 없습니다");

  // 가드 1: 출처 — crew/unknown 은 공용일 수 있어 prune 차단.
  if (asset.source !== "project-local") {
    throw new AuthoringError(
      "crew/출처미확인(unknown) 자산은 삭제 차단 — 공용 오삭제 방지",
    );
  }
  // 가드 2: 종류 — .claude 자산(agent/skill/command)만. 파생 하네스(cursor 등) 제외.
  if (
    asset.kind !== "agent" &&
    asset.kind !== "skill" &&
    asset.kind !== "command"
  ) {
    throw new AuthoringError("파생 하네스(cursor 등)는 prune 대상 아님");
  }

  const project = getProject(asset.projectId);
  if (!project) throw new AuthoringError("프로젝트를 찾을 수 없습니다");

  const rel = assetRelPath(asset.kind, asset.name);
  // skill 은 디렉터리 단위 자산(.claude/skills/<name>/) — SKILL.md 만 지우면 동반
  // 파일·빈 디렉터리가 클론에 남는다(클론 무오염 위배). skill 은 디렉터리 전체를 지운다.
  const target = asset.kind === "skill" ? dirname(rel) : rel;
  const targetAbs = join(project.clonePath, target);

  // 삭제를 커밋에 반영. .claude 가 gitignore 면 `git rm` 이 실패할 수 있어
  // (writeAsset 이 `git add -f` 를 쓰는 이유) cached 제거 + fs 삭제 + add 로 fallback.
  // -r 로 파일·디렉터리 모두 처리. 정상 경로는 git 이 워킹트리+인덱스를 함께 다뤄
  // 커밋 실패 시에도 `git checkout` 으로 복구 가능. fallback 의 fs 선삭제는 untracked
  // 엣지에서만 도달하며 그 경우 복구가 어려울 수 있다(드묾).
  try {
    git(project.clonePath, ["rm", "-rf", "--", target]);
  } catch {
    try {
      git(project.clonePath, ["rm", "-rf", "--cached", "--", target]);
    } catch {
      // index 에 없을 수도 있음 — 무시하고 fs/스테이지로 진행.
    }
    rmSync(targetAbs, { recursive: true, force: true });
    git(project.clonePath, ["add", "-A", "--", target]);
  }

  const message =
    `ops(${asset.kind}/${asset.name}): prune 미사용 자산\n\n` +
    `why: ${rationale.trim() === "" ? "(미기재)" : rationale}\n\n` +
    `[opspilot pruned]`;
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
      target,
    ]);
    committed = git(project.clonePath, ["rev-parse", "HEAD"]);
  } catch (e) {
    throw new AuthoringError(
      `커밋 실패(변경 없음?): ${(e as Error).message.slice(0, 300)}`,
    );
  }

  // DB 행 하드 삭제 — 재스캔은 upsert 전용이라 사라진 자산을 안 지운다.
  // asset_version → run → score/trace_event/run_diff_file/trace_analysis 와 scenario 가
  // ON DELETE CASCADE 로 함께 영구 삭제된다(실행·평가 이력 포함 — git 으로 복구 불가).
  // 단 asset_work_metric 은 asset FK 가 아니라 asset_key(kind:name) 기반이라 함께 지워지지
  // 않는다(동일 kind:name 재생성 시 옛 지표가 다시 매칭될 수 있음).
  deleteAssetRow(assetId);

  return { committed };
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
    .get(assetVersionId) as
    | { content: string; gitCommit: string; assetId: string }
    | undefined;
  if (!ver) throw new AuthoringError("자산 버전을 찾을 수 없습니다");

  const asset = getAsset(ver.assetId);
  if (!asset) throw new AuthoringError("자산을 찾을 수 없습니다");
  const project = getProject(asset.projectId);
  if (!project) throw new AuthoringError("프로젝트를 찾을 수 없습니다");

  // 채택할 내용이 이미 현재 최신과 같으면 거부 — no-op 커밋 방지(친화 메시지).
  const latest = latestContent(ver.assetId);
  if (latest !== undefined && latest.trimEnd() === ver.content.trimEnd()) {
    throw new AuthoringError(
      "이 버전의 내용이 이미 현재 최신과 같습니다 — 채택 불필요",
    );
  }

  const short = ver.gitCommit.slice(0, 8);
  return writeAsset(project, {
    kind: asset.kind,
    name: asset.name,
    content: ver.content,
    changeSummary: `버전 ${short} 채택 (앞으로 감기)`,
    rationale:
      note.trim() === ""
        ? `버전 ${short} 을(를) 현재 버전으로 채택`
        : note.trim(),
  });
}
