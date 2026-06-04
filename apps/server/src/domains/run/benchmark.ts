// OPSP-31: 같은 (asset_version × scenario) 를 N회 실행한 결과의 집계.
// 비결정 자산(local-claude) 의 일관성·분산을 한눈에 보기 위한 통계.

import type {
  BenchmarkAggregate,
  BenchmarkBySourceEntry,
  DesignSource,
  Run,
  Score,
} from "@opspilot/shared-types";
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

// 한 run 에 같은 scorer 가 여러 행이면 가장 최근 행을 채택.
function pickLatestScore(
  scores: Score[] | undefined,
  scorer: "assertion" | "llm_judge" | "human" | "machine",
): Score | null {
  const list = (scores ?? []).filter((s) => s.scorer === scorer);
  return list.length === 0 ? null : list[list.length - 1] ?? null;
}

// ADR 0003 (C3): source 한 묶음(전체 또는 asset/baked subset)의 passRate·assertion·judge.
function summarizeSubset(
  runs: Run[],
  scoresByRun: Record<string, Score[]>,
): BenchmarkBySourceEntry {
  let succeeded = 0;
  let terminated = 0;
  const assertionValues: number[] = [];
  let assertionPassN = 0;
  const judgeValues: number[] = [];
  // ADR 0003 §6.4 (B3): human(외부 사람 신호) — 각 run 의 최신 human score(0~1) 만 채택.
  const humanValues: number[] = [];
  // 머신 스코어러 분포 + 기준 보류 카운트(§6.4 신뢰 게이트용).
  const machineValues: number[] = [];
  let machineCriteriaWeak = 0;
  let machineNoCriteria = 0;
  for (const r of runs) {
    if (r.status === "succeeded") {
      succeeded += 1;
      terminated += 1;
    } else if (r.status === "failed") {
      terminated += 1;
    }
    const a = pickLatestScore(scoresByRun[r.id], "assertion");
    if (a && a.score !== null) {
      assertionValues.push(a.score);
      if (a.passed) assertionPassN += 1;
    }
    const j = pickLatestScore(scoresByRun[r.id], "llm_judge");
    if (j && j.score !== null) judgeValues.push(j.score);
    const h = pickLatestScore(scoresByRun[r.id], "human");
    if (h && h.score !== null) humanValues.push(h.score);
    const m = pickLatestScore(scoresByRun[r.id], "machine");
    if (m) {
      const gs = m.detail?.gateStatus;
      if (gs === "criteria_weak") machineCriteriaWeak += 1;
      else if (gs === "no_criteria") machineNoCriteria += 1;
      if (m.score !== null) machineValues.push(m.score);
    }
  }
  const assertionStats = stats(assertionValues);
  return {
    count: runs.length,
    passRate: terminated === 0 ? 0 : succeeded / terminated,
    assertion:
      assertionStats === null ? null : { ...assertionStats, passN: assertionPassN },
    judge: stats(judgeValues),
    // humanSampleCount = human score 가 있는 run 수(=외부 표본 N). count(전체 run 수)와 다름.
    human: stats(humanValues),
    humanSampleCount: humanValues.length,
    machine: stats(machineValues),
    machineCriteriaWeak,
    machineNoCriteria,
  };
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
  const assertionValues: number[] = [];
  let assertionPassN = 0;
  const judgeValues: number[] = [];
  // 머신 스코어러 분포 + 기준 보류 카운트(§6.4 신뢰 게이트용).
  const machineValues: number[] = [];
  let machineCriteriaWeak = 0;
  let machineNoCriteria = 0;
  for (const r of runs) {
    const a = pickLatestScore(scoresByRun[r.id], "assertion");
    if (a && a.score !== null) {
      assertionValues.push(a.score);
      if (a.passed) assertionPassN += 1;
    }
    const j = pickLatestScore(scoresByRun[r.id], "llm_judge");
    if (j && j.score !== null) judgeValues.push(j.score);
    const m = pickLatestScore(scoresByRun[r.id], "machine");
    if (m) {
      const gs = m.detail?.gateStatus;
      if (gs === "criteria_weak") machineCriteriaWeak += 1;
      else if (gs === "no_criteria") machineNoCriteria += 1;
      if (m.score !== null) machineValues.push(m.score);
    }
  }

  const assertionStats = stats(assertionValues);
  const judgeStats = stats(judgeValues);

  // ADR 0003 (C3·D1): source(asset|baked) 별 분리 집계. source 가 기록된 run 이 하나도
  // 없으면 null(legacy run 만 있는 경우). §6.4 — source 점수를 단순 가산하지 않고 분리.
  const bySource = buildBySource(runs, scoresByRun);

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
    machine: stats(machineValues),
    machineCriteriaWeak,
    machineNoCriteria,
    bySource,
  };
}

function buildBySource(
  runs: Run[],
  scoresByRun: Record<string, Score[]>,
): BenchmarkAggregate["bySource"] {
  const sources: DesignSource[] = ["asset", "baked"];
  const result: { asset?: BenchmarkBySourceEntry; baked?: BenchmarkBySourceEntry } = {};
  let any = false;
  for (const src of sources) {
    const subset = runs.filter((r) => r.source === src);
    if (subset.length === 0) continue;
    any = true;
    result[src] = summarizeSubset(subset, scoresByRun);
  }
  return any ? result : null;
}
