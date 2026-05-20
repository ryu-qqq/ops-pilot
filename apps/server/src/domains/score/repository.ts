import { randomUUID } from "node:crypto";
import type { Score, Scorer } from "@opspilot/shared-types";
import { getDb } from "../../db/index.js";

const nowIso = () => new Date().toISOString();

export interface NewScore {
  runId: string;
  scorer: Scorer;
  passed: boolean;
  score: number | null;
  reason: string | null;
}

export function createScore(s: NewScore): Score {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  const detail = s.reason === null ? null : { reason: s.reason };
  db.prepare(
    `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
     VALUES (@id, @runId, @scorer, @passed, @score, @detail, @createdAt)`,
  ).run({
    id,
    runId: s.runId,
    scorer: s.scorer,
    passed: s.passed ? 1 : 0,
    score: s.score,
    detail: detail === null ? null : JSON.stringify(detail),
    createdAt,
  });
  return {
    id,
    runId: s.runId,
    scorer: s.scorer,
    passed: s.passed,
    score: s.score,
    detail,
    createdAt,
  };
}

// OPSP-20: 풍부한 detail({reason, expected, actual}) 을 그대로 저장.
// 기존 createScore 는 reason 만 받는 단순 시그니처 — 호환 위해 별도 함수.
export interface NewScoreWithDetail {
  runId: string;
  scorer: Scorer;
  passed: boolean;
  score: number | null;
  detail: Score["detail"];
}

export function createScoreWithDetail(s: NewScoreWithDetail): Score {
  const db = getDb();
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
     VALUES (@id, @runId, @scorer, @passed, @score, @detail, @createdAt)`,
  ).run({
    id,
    runId: s.runId,
    scorer: s.scorer,
    passed: s.passed ? 1 : 0,
    score: s.score,
    detail: s.detail === null ? null : JSON.stringify(s.detail),
    createdAt,
  });
  return {
    id,
    runId: s.runId,
    scorer: s.scorer,
    passed: s.passed,
    score: s.score,
    detail: s.detail,
    createdAt,
  };
}

// OPSP-20: 여러 run 의 score 를 한꺼번에(N+1 회피). 비교 뷰가 사용.
export function listScoresForRuns(runIds: string[]): Record<string, Score[]> {
  const map: Record<string, Score[]> = {};
  if (runIds.length === 0) return map;
  const placeholders = runIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT id, run_id AS runId, scorer, passed, score, detail, created_at AS createdAt
       FROM score WHERE run_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...runIds) as ScoreRow[];
  for (const r of rows) {
    const list = map[r.runId] ?? [];
    list.push({
      id: r.id,
      runId: r.runId,
      scorer: r.scorer,
      passed: r.passed === 1,
      score: r.score,
      detail: r.detail === null ? null : (JSON.parse(r.detail) as Score["detail"]),
      createdAt: r.createdAt,
    });
    map[r.runId] = list;
  }
  return map;
}

interface ScoreRow {
  id: string;
  runId: string;
  scorer: Scorer;
  passed: number;
  score: number | null;
  detail: string | null;
  createdAt: string;
}

export function listScores(runId: string): Score[] {
  const rows = getDb()
    .prepare(
      `SELECT id, run_id AS runId, scorer, passed, score, detail, created_at AS createdAt
       FROM score WHERE run_id = ? ORDER BY created_at ASC`,
    )
    .all(runId) as ScoreRow[];
  return rows.map((r) => ({
    id: r.id,
    runId: r.runId,
    scorer: r.scorer,
    passed: r.passed === 1,
    score: r.score,
    detail: r.detail === null ? null : (JSON.parse(r.detail) as Score["detail"]),
    createdAt: r.createdAt,
  }));
}
