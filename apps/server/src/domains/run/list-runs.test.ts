import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { listRuns } from "./repository.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ops-listruns-"));
  dbPath = join(dir, "test.sqlite");
  closeDb();
  migrate(dbPath);
});
afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

// project→asset→asset_version→scenario→run 체인을 raw SQL 로 최소 시드.
// NOT NULL 컬럼은 schema.sql 기준(asset_version: content_hash·content·committed_at,
// scenario: definition_hash·updated_at)에 맞춰 채운다.
function seedRun(
  db: ReturnType<typeof getDb>,
  projectName: string,
): { projectId: string; runId: string } {
  const now = new Date().toISOString();
  const projectId = randomUUID();
  db.prepare(
    `INSERT INTO project (id, name, git_url, clone_path, workspace_mode, remote_verified, default_branch, created_at)
     VALUES (?, ?, ?, '/tmp/x', 'managed', 0, 'main', ?)`,
  ).run(projectId, projectName, `git://${projectId}`, now);
  const assetId = randomUUID();
  db.prepare(
    `INSERT INTO asset (id, project_id, kind, name, scope, source, source_path, created_at)
     VALUES (?, ?, 'agent', 'a', 'project', 'unknown', '.claude/agents/a.md', ?)`,
  ).run(assetId, projectId, now);
  const versionId = randomUUID();
  db.prepare(
    `INSERT INTO asset_version (id, asset_id, git_commit, content_hash, content, committed_at, created_at)
     VALUES (?, ?, 'c0ffee', 'h0', 'x', ?, ?)`,
  ).run(versionId, assetId, now, now);
  const scenarioId = randomUUID();
  db.prepare(
    `INSERT INTO scenario (id, asset_id, name, input, expectation, definition_hash, created_at, updated_at)
     VALUES (?, ?, 's', 'in', '{}', 'd0', ?, ?)`,
  ).run(scenarioId, assetId, now, now);
  const runId = randomUUID();
  db.prepare(
    `INSERT INTO run (id, asset_version_id, scenario_id, status, runner, created_at)
     VALUES (?, ?, ?, 'succeeded', 'fixture', ?)`,
  ).run(runId, versionId, scenarioId, now);
  return { projectId, runId };
}

describe("listRuns — 프로젝트 필터 + projectName", () => {
  it("projectId 없으면 전체, projectName 이 채워진다", () => {
    const db = getDb(dbPath);
    seedRun(db, "alpha");
    seedRun(db, "beta");
    const all = listRuns();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.projectName).sort()).toEqual(["alpha", "beta"]);
  });
  it("projectId 로 그 프로젝트 run 만 반환한다", () => {
    const db = getDb(dbPath);
    const a = seedRun(db, "alpha");
    seedRun(db, "beta");
    const only = listRuns(a.projectId);
    expect(only.length).toBe(1);
    expect(only[0]?.projectName).toBe("alpha");
  });
});
