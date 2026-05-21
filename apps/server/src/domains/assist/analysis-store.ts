import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import { analyzeTrace, type TraceAnalysis } from "./analyze-trace.js";

// OPSP-39: AI 트레이스 분석을 run 패턴처럼 비동기 작업화.
// startAnalysis 즉시 반환 + 백그라운드 실행 + 결과 DB 저장(run 종속 캐시).
// 화면 이동해도 유실 없음, 다시 들어오면 캐시된 결과.

const nowIso = () => new Date().toISOString();

export type AnalysisStatus = "running" | "done" | "failed";

export interface AnalysisRecord {
  runId: string;
  status: AnalysisStatus;
  result: TraceAnalysis | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AnalysisRow {
  runId: string;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getAnalysis(runId: string): AnalysisRecord | undefined {
  const row = getDb()
    .prepare(
      `SELECT run_id AS runId, status, result, error,
              created_at AS createdAt, updated_at AS updatedAt
         FROM trace_analysis WHERE run_id = ?`,
    )
    .get(runId) as AnalysisRow | undefined;
  if (!row) return undefined;
  return {
    runId: row.runId,
    status: row.status as AnalysisStatus,
    result: row.result === null ? null : (JSON.parse(row.result) as TraceAnalysis),
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 진행 중(running) 분석 목록 — 전역 "진행 중 작업" 표시용.
export function listRunningAnalyses(): { runId: string; createdAt: string }[] {
  return getDb()
    .prepare(
      `SELECT run_id AS runId, created_at AS createdAt
         FROM trace_analysis WHERE status = 'running' ORDER BY created_at DESC`,
    )
    .all() as { runId: string; createdAt: string }[];
}

function upsert(runId: string, status: AnalysisStatus, result: string | null, error: string | null): void {
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO trace_analysis (id, run_id, status, result, error, created_at, updated_at)
       VALUES (@id, @runId, @status, @result, @error, @now, @now)
       ON CONFLICT (run_id) DO UPDATE SET
         status = @status, result = @result, error = @error, updated_at = @now`,
    )
    .run({ id: randomUUID(), runId, status, result, error, now });
}

async function runInBackground(runId: string): Promise<void> {
  try {
    const result = await analyzeTrace(runId);
    upsert(runId, "done", JSON.stringify(result), null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    upsert(runId, "failed", null, msg);
  }
}

export interface StartResult {
  started: boolean;
  reason?: string;
}

// 분석 시작. 이미 running 이면 중복 거부. 즉시 반환 + 백그라운드 실행.
export function startAnalysis(runId: string): StartResult {
  const existing = getAnalysis(runId);
  if (existing?.status === "running") {
    return { started: false, reason: "이미 이 run 의 분석이 진행 중입니다." };
  }
  upsert(runId, "running", null, null);
  // 즉시 반환, 실제 분석은 백그라운드 (run 의 startRun/runLoop 패턴과 동일).
  setImmediate(() => {
    void runInBackground(runId);
  });
  return { started: true };
}
