import type {
  CompoundingApplyEvent,
  CompoundingTrendPoint,
} from "@opspilot/shared-types";
import type { WorkMetricRow } from "./work-metric-repository.js";

/** ISO 시각을 그 주의 월요일(UTC) YYYY-MM-DD 로 내린다. */
export function isoWeekStart(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0=일 .. 6=토
  const shift = day === 0 ? -6 : 1 - day; // 월요일로 이동
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shift),
  );
  return monday.toISOString().slice(0, 10);
}

interface Acc {
  // distinct 세션 — asset_work_metric 은 (session_id, asset_key) UNIQUE 라
  // 한 세션이 자산 N개를 발화하면 N행이다. 표본은 행 수가 아니라 세션 수여야 한다.
  sessions: Set<string>;
  invocations: number;
  corrections: number;
}

/** first_seen 주 버킷별로 세션·발화·정정을 합치고 정정비율을 낸다(과거→현재). */
export function aggregateTrendPoints(
  rows: WorkMetricRow[],
): CompoundingTrendPoint[] {
  const byWeek = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.firstSeen) continue; // 시점 없는 행은 추세에 못 올린다
    const week = isoWeekStart(r.firstSeen);
    const acc =
      byWeek.get(week) ??
      ({ sessions: new Set<string>(), invocations: 0, corrections: 0 } as Acc);
    acc.sessions.add(r.sessionId);
    acc.invocations += r.invocationCount;
    acc.corrections += r.correctionRoundtrips;
    byWeek.set(week, acc);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([periodStart, a]) => ({
      periodStart,
      sessions: a.sessions.size,
      invocations: a.invocations,
      corrections: a.corrections,
      correctionRate: a.invocations > 0 ? a.corrections / a.invocations : null,
    }));
}

/** applied 개선안 행 → apply 마커(at 오름차순). at = 개선안 created_at 근사. */
export function aggregateApplyEvents(
  proposals: { createdAt: string; targetKind: string; targetPath: string }[],
): CompoundingApplyEvent[] {
  return proposals
    .map((p) => ({
      at: p.createdAt,
      targetKind: p.targetKind,
      targetPath: p.targetPath,
    }))
    .sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}
