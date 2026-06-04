import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import {
  evaluateCriteriaGate,
  isAutoMachineScoreEnabled,
} from "./machine-score.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ops-machine-"));
  dbPath = join(dir, "test.sqlite");
  closeDb();
  migrate(dbPath);
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const now = "2026-06-04T00:00:00.000Z";

// score.run_id FK 충족용 최소 체인(project→asset→asset_version→scenario→run).
// schema.sql 이 PRAGMA foreign_keys=ON 이라 run row 가 실재해야 score INSERT 가 통과한다.
function seedRun(): string {
  const db = getDb(dbPath);
  const projectId = randomUUID();
  const assetId = randomUUID();
  const versionId = randomUUID();
  const scenarioId = randomUUID();
  const runId = randomUUID();

  db.prepare(
    `INSERT INTO project (id, name, git_url, clone_path, created_at)
     VALUES (?, 'p', ?, '/tmp/p', ?)`,
  ).run(projectId, `git://${projectId}`, now);
  db.prepare(
    `INSERT INTO asset (id, project_id, kind, name, scope, source_path, created_at)
     VALUES (?, ?, 'agent', 'a', 'project', 'a.md', ?)`,
  ).run(assetId, projectId, now);
  db.prepare(
    `INSERT INTO asset_version (id, asset_id, git_commit, content_hash, content, committed_at, created_at)
     VALUES (?, ?, 'c0', 'h0', 'x', ?, ?)`,
  ).run(versionId, assetId, now, now);
  db.prepare(
    `INSERT INTO scenario (id, asset_id, name, input, expectation, definition_hash, created_at, updated_at)
     VALUES (?, ?, 's', '{}', '{}', 'd0', ?, ?)`,
  ).run(scenarioId, assetId, now, now);
  db.prepare(
    `INSERT INTO run (id, asset_version_id, scenario_id, status, runner, created_at)
     VALUES (?, ?, ?, 'succeeded', 'fixture', ?)`,
  ).run(runId, versionId, scenarioId, now);

  return runId;
}

describe("score 마이그레이션 — machine scorer", () => {
  it("migrate 후 scorer='machine' INSERT 가 CHECK 를 통과한다", () => {
    const db = getDb(dbPath);
    const runId = seedRun();
    expect(() =>
      db
        .prepare(
          `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
           VALUES (?, ?, 'machine', 0, NULL, NULL, ?)`,
        )
        .run(randomUUID(), runId, now),
    ).not.toThrow();
  });

  it("score CHECK 에 'machine' 이 포함되어 있다(스키마 신규 생성 경로)", () => {
    const db = getDb(dbPath);
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='score'",
      )
      .get() as { sql: string };
    expect(row.sql).toContain("'machine'");
  });

  it("legacy DB(machine 없는 CHECK)를 행 보존하며 재구성한다", () => {
    // 구 score 테이블('human' 까지만)을 만들어 reconcile 이 행을 살리며 올리는지 검증.
    const db = getDb(dbPath);
    const runId = seedRun();

    db.exec("PRAGMA foreign_keys=OFF;");
    db.exec(`
      DROP TABLE score;
      CREATE TABLE score (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
        scorer     TEXT NOT NULL CHECK (scorer IN ('schema','assertion','llm_judge','human')),
        passed     INTEGER NOT NULL CHECK (passed IN (0,1)),
        score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
        detail     TEXT,
        created_at TEXT NOT NULL
      );
    `);
    db.exec("PRAGMA foreign_keys=ON;");
    const legacyScoreId = randomUUID();
    db.prepare(
      `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
       VALUES (?, ?, 'human', 1, 0.5, NULL, ?)`,
    ).run(legacyScoreId, runId, now);

    // 같은 DB 에 재마이그레이션 → reconcileMachineScorer 가 재구성.
    closeDb();
    migrate(dbPath);
    const db2 = getDb(dbPath);

    const sql = (
      db2
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='score'",
        )
        .get() as { sql: string }
    ).sql;
    expect(sql).toContain("'machine'");

    // 기존 'human' 행 보존.
    const survived = db2
      .prepare("SELECT scorer, score FROM score WHERE id = ?")
      .get(legacyScoreId) as { scorer: string; score: number } | undefined;
    expect(survived).toEqual({ scorer: "human", score: 0.5 });

    // 이제 'machine' INSERT 가능.
    expect(() =>
      db2
        .prepare(
          `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
           VALUES (?, ?, 'machine', 0, NULL, NULL, ?)`,
        )
        .run(randomUUID(), runId, now),
    ).not.toThrow();
  });
});

describe("evaluateCriteriaGate — 결정적 사전 판정", () => {
  it("assertions 가 비면 no_criteria", () => {
    expect(evaluateCriteriaGate([])).toBe("no_criteria");
  });
  it("공백만 있는 줄만 있으면 no_criteria", () => {
    expect(evaluateCriteriaGate(["  ", ""])).toBe("no_criteria");
  });
  it("의미 있는 기준이 있으면 null(=LLM 판정으로 위임)", () => {
    expect(evaluateCriteriaGate(['응답에 "AWS_SECRET_KEY" 포함'])).toBeNull();
  });
});

describe("isAutoMachineScoreEnabled — env 토글", () => {
  // 다른 테스트로 새지 않게 각 테스트가 끝나면 env 를 원복(off).
  afterEach(() => {
    delete process.env.OPS_AUTO_MACHINE_SCORE;
  });
  it("OPS_AUTO_MACHINE_SCORE 미설정이면 false", () => {
    delete process.env.OPS_AUTO_MACHINE_SCORE;
    expect(isAutoMachineScoreEnabled()).toBe(false);
  });
  it("'1' 이면 true", () => {
    process.env.OPS_AUTO_MACHINE_SCORE = "1";
    expect(isAutoMachineScoreEnabled()).toBe(true);
  });
});
