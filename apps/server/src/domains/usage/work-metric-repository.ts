import { randomUUID } from "node:crypto";
import { getDb } from "../../db/index.js";
import type { SessionAssetMetric } from "./scan-work-metric.js";

// ADR-0001: asset_work_metric 저장·조회. (session_id, asset_key) UNIQUE upsert.
// ⚠️ correction_roundtrips 는 reference signal — 품질 점수가 아니다.

const nowIso = () => new Date().toISOString();

/** 세션×자산 지표를 멱등 upsert. 재스캔 시 중복 없이 최신값으로 갱신. */
export function upsertWorkMetrics(metrics: SessionAssetMetric[]): number {
  if (metrics.length === 0) return 0;
  const db = getDb();
  const scannedAt = nowIso();
  const stmt = db.prepare(
    `INSERT INTO asset_work_metric
       (id, session_id, asset_key, kind, name, cwd,
        invocation_count, correction_roundtrips, first_seen, last_seen, scanned_at)
     VALUES
       (@id, @sessionId, @assetKey, @kind, @name, @cwd,
        @invocationCount, @correctionRoundtrips, @firstSeen, @lastSeen, @scannedAt)
     ON CONFLICT (session_id, asset_key) DO UPDATE SET
        kind                  = excluded.kind,
        name                  = excluded.name,
        cwd                   = excluded.cwd,
        invocation_count      = excluded.invocation_count,
        correction_roundtrips = excluded.correction_roundtrips,
        first_seen            = excluded.first_seen,
        last_seen             = excluded.last_seen,
        scanned_at            = excluded.scanned_at`,
  );
  const tx = db.transaction((rows: SessionAssetMetric[]) => {
    for (const m of rows) {
      stmt.run({
        id: randomUUID(),
        sessionId: m.sessionId,
        assetKey: m.assetKey,
        kind: m.kind,
        name: m.name,
        cwd: m.cwd,
        invocationCount: m.invocationCount,
        correctionRoundtrips: m.correctionRoundtrips,
        firstSeen: m.firstSeen,
        lastSeen: m.lastSeen,
        scannedAt,
      });
    }
  });
  tx(metrics);
  return metrics.length;
}

export interface WorkMetricRow {
  sessionId: string;
  kind: "agent" | "skill";
  name: string;
  cwd: string;
  invocationCount: number;
  correctionRoundtrips: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface RawRow {
  sessionId: string;
  kind: "agent" | "skill";
  name: string;
  cwd: string;
  invocationCount: number;
  correctionRoundtrips: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * 한 clonePath(프로젝트) 안에서 발화된 세션×자산 지표를 모두 가져온다.
 * cwd 가 clone 자체이거나 그 하위인 row 만 — usage 도메인과 동일한 매핑 규칙.
 */
export function listWorkMetricsForClone(clonePath: string): WorkMetricRow[] {
  const clone = clonePath.replace(/\/$/, "");
  const rows = getDb()
    .prepare(
      `SELECT session_id AS sessionId, kind, name, cwd,
              invocation_count AS invocationCount,
              correction_roundtrips AS correctionRoundtrips,
              first_seen AS firstSeen, last_seen AS lastSeen
         FROM asset_work_metric
        WHERE cwd = ? OR cwd LIKE ?
        ORDER BY last_seen DESC`,
    )
    .all(clone, `${clone}/%`) as RawRow[];
  return rows;
}
