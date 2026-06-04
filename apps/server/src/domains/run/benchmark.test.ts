import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignSource } from "@opspilot/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { aggregateBenchmark } from "./benchmark.js";

// aggregateBenchmark 슬라이스 테스트(ADR 0003 A/B 측정 무결성).
// FK 체인(project→asset→asset_version→scenario→run→score)을 raw SQL 로 최소 시드해
// bySource 그룹핑·human 외부신호·assertion passN/passRate 를 결정적으로 검증한다.

let dbPath: string;

beforeEach(() => {
  closeDb();
  dbPath = join(tmpdir(), `opspilot-bench-${randomUUID()}.sqlite`);
  // migrate(path) 가 첫 getDb 호출이 되어 임시 경로로 열린다(OPS_DB_PATH 미사용).
  migrate(dbPath);
});

afterEach(() => {
  closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

const now = "2026-06-04T00:00:00.000Z";

// 한 (project→asset→asset_version→scenario) 체인을 만들고 run 을 꽂을 컨텍스트를 돌려준다.
function seedChain(): { assetVersionId: string; scenarioId: string } {
  const db = getDb();
  const projectId = randomUUID();
  const assetId = randomUUID();
  const versionId = randomUUID();
  const scenarioId = randomUUID();

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

  return { assetVersionId: versionId, scenarioId: scenarioId };
}

interface SeedRunInput {
  assetVersionId: string;
  scenarioId: string;
  status: "succeeded" | "failed" | "running" | "pending";
  source: DesignSource | null;
  assertion?: { score: number; passed: boolean };
  human?: { score: number; passed: boolean };
}

function seedRun(input: SeedRunInput): string {
  const db = getDb();
  const runId = randomUUID();
  db.prepare(
    `INSERT INTO run (id, asset_version_id, scenario_id, status, runner, started_at, finished_at, source, created_at)
     VALUES (?, ?, ?, ?, 'fixture', ?, ?, ?, ?)`,
  ).run(
    runId,
    input.assetVersionId,
    input.scenarioId,
    input.status,
    now,
    now,
    input.source,
    now,
  );

  if (input.assertion) {
    db.prepare(
      `INSERT INTO score (id, run_id, scorer, passed, score, created_at)
       VALUES (?, ?, 'assertion', ?, ?, ?)`,
    ).run(randomUUID(), runId, input.assertion.passed ? 1 : 0, input.assertion.score, now);
  }
  if (input.human) {
    db.prepare(
      `INSERT INTO score (id, run_id, scorer, passed, score, created_at)
       VALUES (?, ?, 'human', ?, ?, ?)`,
    ).run(randomUUID(), runId, input.human.passed ? 1 : 0, input.human.score, now);
  }
  return runId;
}

describe("aggregateBenchmark", () => {
  it("bySource: source 별로 run 을 그룹핑하고 null source 는 제외한다", () => {
    const { assetVersionId, scenarioId } = seedChain();
    const ids = [
      seedRun({ assetVersionId, scenarioId, status: "succeeded", source: "asset" }),
      seedRun({ assetVersionId, scenarioId, status: "failed", source: "asset" }),
      seedRun({ assetVersionId, scenarioId, status: "succeeded", source: "baked" }),
      // source=null 은 bySource 에서 제외(전체 집계에는 포함).
      seedRun({ assetVersionId, scenarioId, status: "succeeded", source: null }),
    ];

    const agg = aggregateBenchmark(ids);

    expect(agg.count).toBe(4);
    expect(agg.bySource).not.toBeNull();
    expect(agg.bySource?.asset?.count).toBe(2);
    expect(agg.bySource?.baked?.count).toBe(1);
  });

  it("bySource: source 가 전부 null 이면 bySource 는 null", () => {
    const { assetVersionId, scenarioId } = seedChain();
    const ids = [
      seedRun({ assetVersionId, scenarioId, status: "succeeded", source: null }),
      seedRun({ assetVersionId, scenarioId, status: "failed", source: null }),
    ];

    const agg = aggregateBenchmark(ids);

    expect(agg.bySource).toBeNull();
  });

  it("human: 외부 사람 신호의 mean·humanSampleCount 를 정확히 집계한다", () => {
    const { assetVersionId, scenarioId } = seedChain();
    const ids = [
      seedRun({
        assetVersionId,
        scenarioId,
        status: "succeeded",
        source: "asset",
        human: { score: 0.8, passed: true },
      }),
      seedRun({
        assetVersionId,
        scenarioId,
        status: "succeeded",
        source: "asset",
        human: { score: 0.6, passed: true },
      }),
      // human score 없는 asset run — humanSampleCount 에 포함되지 않음.
      seedRun({ assetVersionId, scenarioId, status: "succeeded", source: "asset" }),
    ];

    const agg = aggregateBenchmark(ids);
    const asset = agg.bySource?.asset;

    expect(asset?.count).toBe(3);
    expect(asset?.humanSampleCount).toBe(2);
    expect(asset?.human?.mean).toBeCloseTo(0.7, 10);
  });

  it("human: human score 가 하나도 없으면 human===null·humanSampleCount=0", () => {
    const { assetVersionId, scenarioId } = seedChain();
    const ids = [seedRun({ assetVersionId, scenarioId, status: "succeeded", source: "baked" })];

    const agg = aggregateBenchmark(ids);
    const baked = agg.bySource?.baked;

    expect(baked?.human).toBeNull();
    expect(baked?.humanSampleCount).toBe(0);
  });

  it("assertion: passRate·passN·assertion.mean 을 succeeded/failed 혼합으로 검증한다", () => {
    const { assetVersionId, scenarioId } = seedChain();
    const ids = [
      seedRun({
        assetVersionId,
        scenarioId,
        status: "succeeded",
        source: "asset",
        assertion: { score: 1.0, passed: true },
      }),
      seedRun({
        assetVersionId,
        scenarioId,
        status: "succeeded",
        source: "asset",
        assertion: { score: 0.5, passed: false },
      }),
      seedRun({
        assetVersionId,
        scenarioId,
        status: "failed",
        source: "asset",
        assertion: { score: 0.0, passed: false },
      }),
    ];

    const agg = aggregateBenchmark(ids);

    // 종료된 run 3건 중 2건 성공 → passRate = 2/3.
    expect(agg.passRate).toBeCloseTo(2 / 3, 10);
    expect(agg.statusCounts.succeeded).toBe(2);
    expect(agg.statusCounts.failed).toBe(1);
    // assertion score [1.0, 0.5, 0.0] → mean ≈ 0.5, passN = 1(passed=true 1건).
    expect(agg.assertion?.mean).toBeCloseTo(0.5, 10);
    expect(agg.assertion?.passN).toBe(1);
  });
});
