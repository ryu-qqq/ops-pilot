import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { listIngestBundlesByProject } from "./repository.js";
import { pickRecentCandidates, runAutoIngestScan } from "./auto-ingest.js";

// runAutoIngestScan 슬라이스 테스트(ADR 0004 자동 트리거 안전장치).
// 임시 git clone 픽스처 + DB 시드로 ops()자가커밋·merge 제외 / 차집합 멱등 / BATCH cap 을 검증.
// fixture evalSource(토큰0) — work-evaluator 자산이 없어 eval 은 실패하지만 ingest_bundle
// 은 생성되므로(trigger='auto'), triggered/bundle 생성 여부로 검증한다(eval 성공까지 요구 X).

let dbPath: string;
let repoPath: string;
let projectId: string;

const ENV_KEY = "OPS_AUTO_INGEST_EVAL_SOURCE";
let prevEvalSource: string | undefined;

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function commit(cwd: string, subject: string, fileBody: string): void {
  writeFileSync(join(cwd, "f.txt"), fileBody);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", subject]);
}

// feat → ops(자가) → fix → merge 가 섞인 히스토리를 만든다.
function buildFixtureRepo(cwd: string): void {
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@opspilot.local"]);
  git(cwd, ["config", "user.name", "OpsPilot Test"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);

  commit(cwd, "feat: TASK-1 첫 기능", "a");
  commit(cwd, "ops(feedback): apply 자가 커밋", "b"); // isOpsPilotHarnessSubject → 제외
  commit(cwd, "fix: TASK-2 버그 수정", "c");

  // merge 커밋 1건 — listRecentCommits 의 --no-merges 로 제외돼야 한다.
  git(cwd, ["checkout", "-b", "side"]);
  commit(cwd, "feat: TASK-3 사이드 작업", "d");
  git(cwd, ["checkout", "main"]);
  git(cwd, ["merge", "--no-ff", "side", "-m", "merge: side 병합"]);
}

function seedProject(): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO project (id, name, git_url, clone_path, default_branch, created_at)
       VALUES (?, 'fixture', ?, ?, 'main', ?)`,
    )
    .run(id, `git://${id}`, repoPath, new Date().toISOString());
  return id;
}

beforeEach(() => {
  prevEvalSource = process.env[ENV_KEY];
  process.env[ENV_KEY] = "fixture"; // 토큰0 — 실 LLM·네트워크 금지.

  closeDb();
  dbPath = join(tmpdir(), `opspilot-ingest-${randomUUID()}.sqlite`);
  migrate(dbPath);

  repoPath = mkdtempSync(join(tmpdir(), "opspilot-fixture-"));
  buildFixtureRepo(repoPath);
  projectId = seedProject();
});

afterEach(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  rmSync(repoPath, { recursive: true, force: true });
  // 빈 문자열 복원이면 evalSource() 는 'fixture' 가 아니라 기본(local-claude)으로 떨어진다.
  // 테스트 외부에 env 잔존을 남기지 않도록 이전 값(없으면 "")으로 되돌린다.
  process.env[ENV_KEY] = prevEvalSource ?? "";
});

describe("runAutoIngestScan", () => {
  it("ops() 자가 커밋과 merge 커밋을 후보에서 제외한다(feat·fix만)", () => {
    const result = runAutoIngestScan({ batch: 10 });

    // candidates = feat(TASK-1) + fix(TASK-2) + feat(TASK-3, side). merge·ops 제외 → 3.
    expect(result.candidates).toBe(3);

    const bundles = listIngestBundlesByProject(projectId);
    const subjects = bundles.map((b) => b.commitSubject ?? "");
    expect(subjects.some((s) => s.startsWith("ops("))).toBe(false);
    expect(subjects.some((s) => s.startsWith("merge:"))).toBe(false);
    // 모든 자동 진입 번들의 trigger 는 'auto'.
    expect(bundles.every((b) => b.trigger === "auto")).toBe(true);
  });

  it("차집합 멱등: 1회 스캔 후 재스캔하면 triggered=0", () => {
    const first = runAutoIngestScan({ batch: 10 });
    expect(first.triggered).toBeGreaterThan(0);

    const second = runAutoIngestScan({ batch: 10 });
    expect(second.triggered).toBe(0);
  });

  it("BATCH cap: batch=N 이면 triggered<=N", () => {
    const result = runAutoIngestScan({ batch: 1 });
    expect(result.triggered).toBeLessThanOrEqual(1);
  });
});

// 전체 프로젝트 커밋을 committedAt 내림차순으로 합쳐 상위 batch 개만 뽑는 순수 함수.
// 앞 프로젝트가 옛 커밋만 가지면 뒤 프로젝트(최신 커밋)가 밀리지 않고 들어와야 한다(독점 해소).
describe("pickRecentCandidates", () => {
  // projA = 오래된 커밋만, projB = 최신 커밋만. 시각이 섞이게 둔다.
  const candidates = [
    { projectId: "projA", sha: "a1", committedAt: "2026-06-01T10:00:00Z" },
    { projectId: "projA", sha: "a2", committedAt: "2026-06-02T10:00:00Z" },
    { projectId: "projA", sha: "a3", committedAt: "2026-06-03T10:00:00Z" },
    { projectId: "projB", sha: "b1", committedAt: "2026-06-07T10:00:00Z" },
    { projectId: "projB", sha: "b2", committedAt: "2026-06-08T10:00:00Z" },
  ];

  it("batch < 전체일 때 커밋 시각 최신순 상위 batch 개를 뽑는다", () => {
    const picked = pickRecentCandidates(candidates, 3);
    expect(picked.map((c) => c.sha)).toEqual(["b2", "b1", "a3"]);
  });

  it("앞 프로젝트가 독점하지 않는다 — 뒤 프로젝트의 최신 커밋이 먼저 들어온다", () => {
    const picked = pickRecentCandidates(candidates, 3);
    const projects = new Set(picked.map((c) => c.projectId));
    // projB(최신)가 반드시 포함되고, projA 가 batch 를 독점하지 않는다.
    expect(projects.has("projB")).toBe(true);
    expect(picked.filter((c) => c.projectId === "projB").length).toBe(2);
  });

  it("batch >= 전체면 전부 반환(최신순)", () => {
    const picked = pickRecentCandidates(candidates, 10);
    expect(picked.map((c) => c.sha)).toEqual(["b2", "b1", "a3", "a2", "a1"]);
    expect(picked.length).toBe(candidates.length);
  });

  it("입력 배열을 변형하지 않는다(순수)", () => {
    const input = [...candidates];
    const before = input.map((c) => c.sha);
    pickRecentCandidates(input, 2);
    expect(input.map((c) => c.sha)).toEqual(before);
  });

  it("committedAt 빈 문자열은 정상 ISO 보다 뒤로 밀린다", () => {
    const withEmpty = [
      { projectId: "p", sha: "empty", committedAt: "" },
      { projectId: "p", sha: "dated", committedAt: "2026-06-01T00:00:00Z" },
    ];
    const picked = pickRecentCandidates(withEmpty, 1);
    expect(picked[0]?.sha).toBe("dated");
  });
});
