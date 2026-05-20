// OPSP-31: 같은 (asset_version × scenario) 를 N회 실행한 결과의 집계.
// 비결정 자산(local-claude) 의 일관성·분산을 한눈에 보기 위한 통계.

import type { BenchmarkAggregate, Run } from "@opspilot/shared-types";
import { getRun } from "./repository.js";
import { listScoresForRuns } from "../score/repository.js";

function stats(values: number[]) {
  if (values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    mean,
    stdDev: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function durationOf(r: Run): number | null {
  if (r.startedAt === null || r.finishedAt === null) return null;
  const start = Date.parse(r.startedAt);
  const end = Date.parse(r.finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

export function aggregateBenchmark(runIds: string[]): BenchmarkAggregate {
  const runs = runIds
    .map((id) => getRun(id))
    .filter((r): r is Run => r !== undefined);

  const counts = { succeeded: 0, failed: 0, running: 0, pending: 0 };
  for (const r of runs) {
    if (r.status === "succeeded") counts.succeeded += 1;
    else if (r.status === "failed") counts.failed += 1;
    else if (r.status === "running") counts.running += 1;
    else counts.pending += 1;
  }
  const terminated = counts.succeeded + counts.failed;
  const passRate = terminated === 0 ? 0 : counts.succeeded / terminated;

  const durations = runs.map(durationOf).filter((v): v is number => v !== null);
  const promptTokens = runs
    .map((r) => r.promptTokens)
    .filter((v): v is number => v !== null);
  const completionTokens = runs
    .map((r) => r.completionTokens)
    .filter((v): v is number => v !== null);
  const costs = runs.map((r) => r.costUsd).filter((v): v is number => v !== null);

  // assertion / judge score 분포 — 한 run 에 같은 scorer 가 여러 행이면 가장 최근.
  const scoresByRun = listScoresForRuns(runs.map((r) => r.id));
  const pickLatest = (runId: string, scorer: "assertion" | "llm_judge") => {
    const list = (scoresByRun[runId] ?? []).filter((s) => s.scorer === scorer);
    return list.length === 0 ? null : list[list.length - 1] ?? null;
  };
  const assertionValues: number[] = [];
  let assertionPassN = 0;
  const judgeValues: number[] = [];
  for (const r of runs) {
    const a = pickLatest(r.id, "assertion");
    if (a && a.score !== null) {
      assertionValues.push(a.score);
      if (a.passed) assertionPassN += 1;
    }
    const j = pickLatest(r.id, "llm_judge");
    if (j && j.score !== null) judgeValues.push(j.score);
  }

  const assertionStats = stats(assertionValues);
  const judgeStats = stats(judgeValues);

  return {
    count: runs.length,
    statusCounts: counts,
    passRate,
    durationMs: stats(durations),
    promptTokens: stats(promptTokens),
    completionTokens: stats(completionTokens),
    costUsd: stats(costs),
    assertion:
      assertionStats === null
        ? null
        : { ...assertionStats, passN: assertionPassN },
    judge: judgeStats,
  };
}
