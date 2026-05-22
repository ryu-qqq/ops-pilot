// OPSP-35: 관측 대시보드용 집계. 카운트·평균·최근/진행 중 run 한 endpoint 에서.
// 기존 run/scenario/asset 테이블에 SELECT COUNT/AVG 만 — N+1 회피.

import { getDb } from "../../db/index.js";

export interface AssetCounts {
  agent: number;
  skill: number;
  command: number;
  total: number;
}
export interface RunCounts {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  pending: number;
}
export interface RecentRun {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  assetName: string;
  assetKind: string;
  scenarioName: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}
export interface StatsOverview {
  assets: AssetCounts;
  scenarios: number;
  runs: RunCounts;
  passRate: number; // succeeded / (succeeded + failed)
  averages: {
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
    durationMs: number | null;
  };
  recentRuns: RecentRun[]; // 최근 20개 — 시간 축 점·드릴다운
  runningRuns: RecentRun[]; // 진행 중 (status=running)
  runningAnalyses: number; // OPSP-39: 진행 중인 AI 트레이스 분석 수
}

// OPSP-47: run 집계 기간 — '7d'/'30d' 는 run.created_at 으로 필터, 'all' 은 전체.
export type StatsPeriod = "7d" | "30d" | "all";

export function computeOverview(period: StatsPeriod = "all"): StatsOverview {
  const db = getDb();
  // OPSP-47: run 집계(카운트·통과율·평균)만 기간으로 필터한다. 자산·시나리오 카운트와
  // 최근/진행 중 run 은 기간과 무관(레지스트리 크기·"지금")이라 그대로 둔다.
  const sinceMod = period === "7d" ? "-7 days" : period === "30d" ? "-30 days" : null;
  const runWhere =
    sinceMod === null ? "" : "WHERE strftime('%s', created_at) >= strftime('%s', 'now', ?)";
  const runAnd =
    sinceMod === null ? "" : "AND strftime('%s', created_at) >= strftime('%s', 'now', ?)";
  const periodParams: string[] = sinceMod === null ? [] : [sinceMod];

  const assetByKind = db
    .prepare("SELECT kind, COUNT(*) AS c FROM asset GROUP BY kind")
    .all() as { kind: string; c: number }[];
  const assets: AssetCounts = { agent: 0, skill: 0, command: 0, total: 0 };
  for (const r of assetByKind) {
    if (r.kind === "agent") assets.agent = r.c;
    else if (r.kind === "skill") assets.skill = r.c;
    else if (r.kind === "command") assets.command = r.c;
    assets.total += r.c;
  }

  const scenariosRow = db.prepare("SELECT COUNT(*) AS c FROM scenario").get() as { c: number };
  const scenarios = scenariosRow.c;

  const runByStatus = db
    .prepare(`SELECT status, COUNT(*) AS c FROM run ${runWhere} GROUP BY status`)
    .all(...periodParams) as { status: string; c: number }[];
  const runs: RunCounts = { total: 0, succeeded: 0, failed: 0, running: 0, pending: 0 };
  for (const r of runByStatus) {
    if (r.status === "succeeded") runs.succeeded = r.c;
    else if (r.status === "failed") runs.failed = r.c;
    else if (r.status === "running") runs.running = r.c;
    else runs.pending += r.c;
    runs.total += r.c;
  }
  const terminated = runs.succeeded + runs.failed;
  const passRate = terminated === 0 ? 0 : runs.succeeded / terminated;

  const avgRow = db
    .prepare(
      `SELECT AVG(prompt_tokens) AS p, AVG(completion_tokens) AS c, AVG(cost_usd) AS u,
              AVG(CASE WHEN started_at IS NOT NULL AND finished_at IS NOT NULL
                       THEN (CAST(strftime('%s', finished_at) AS INTEGER) -
                             CAST(strftime('%s', started_at) AS INTEGER)) * 1000
                       ELSE NULL END) AS d
         FROM run WHERE status = 'succeeded' ${runAnd}`,
    )
    .get(...periodParams) as { p: number | null; c: number | null; u: number | null; d: number | null };

  const recentQuery = `
    SELECT r.id, r.status, r.created_at AS createdAt, r.started_at AS startedAt, r.finished_at AS finishedAt,
           CASE WHEN r.started_at IS NOT NULL AND r.finished_at IS NOT NULL
                THEN (CAST(strftime('%s', r.finished_at) AS INTEGER) -
                      CAST(strftime('%s', r.started_at) AS INTEGER)) * 1000
                ELSE NULL END AS durationMs,
           r.prompt_tokens AS promptTokens, r.completion_tokens AS completionTokens, r.cost_usd AS costUsd,
           a.name AS assetName, a.kind AS assetKind, s.name AS scenarioName
      FROM run r
      JOIN scenario s ON s.id = r.scenario_id
      JOIN asset_version av ON av.id = r.asset_version_id
      JOIN asset a ON a.id = av.asset_id
  `;
  const recentRuns = db
    .prepare(`${recentQuery} ORDER BY r.created_at DESC LIMIT 20`)
    .all() as RecentRun[];
  const runningRuns = db
    .prepare(`${recentQuery} WHERE r.status = 'running' ORDER BY r.started_at DESC`)
    .all() as RecentRun[];

  const analysisRow = db
    .prepare("SELECT COUNT(*) AS c FROM trace_analysis WHERE status = 'running'")
    .get() as { c: number };

  return {
    assets,
    scenarios,
    runs,
    passRate,
    averages: {
      promptTokens: avgRow.p,
      completionTokens: avgRow.c,
      costUsd: avgRow.u,
      durationMs: avgRow.d,
    },
    recentRuns,
    runningRuns,
    runningAnalyses: analysisRow.c,
  };
}
