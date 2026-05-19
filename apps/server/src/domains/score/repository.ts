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
