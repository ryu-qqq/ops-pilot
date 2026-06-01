import type {
  Project,
  ProjectWorkMetricReport,
  ProjectWorkMetricRow,
  WorkMetricScanResult,
} from "@opspilot/shared-types";
import { scanWorkMetrics } from "./scan-work-metric.js";
import {
  listWorkMetricsForClone,
  upsertWorkMetrics,
} from "./work-metric-repository.js";

// ADR-0001: 작업 기반 자동 평가 서비스 — 수집(전수 스캔→upsert) + 조회(프로젝트 집계).
// ⚠️ 이 지표는 "참고 신호(reference signal)"다. proposal 자동생성은 하지 않는다(분리).

/** UI·응답에 싣는 라벨 — "품질 점수" 오독 방지(ADR-0001 §라벨링 원칙). */
export const REFERENCE_SIGNAL_NOTE =
  "참고 신호(reference signal) — 품질 점수가 아님. 정정 왕복 = 자산 발화 직후 사용자가 처음 끼어든 타이핑(발화별 0/1, ≤ 발화횟수). 작업 난도·탐색·변심 등 혼란변수를 포함한다.";

/** 전수 재스캔 후 멱등 upsert. 부팅 시 1회 + 수동 트리거 + (완만한) 주기에서 호출. */
export function runWorkMetricScan(): WorkMetricScanResult {
  const scan = scanWorkMetrics();
  const upserted = upsertWorkMetrics(scan.metrics);
  return {
    scannedSessions: scan.scannedSessions,
    upsertedMetrics: upserted,
    scannedAt: new Date().toISOString(),
  };
}

/** 한 프로젝트의 자산별 작업 지표 집계(세션 합산). cwd→clonePath 매핑(usage 동일). */
export function workMetricsForProject(
  project: Project,
): ProjectWorkMetricReport {
  const rows = listWorkMetricsForClone(project.clonePath);

  interface Acc {
    kind: "agent" | "skill";
    name: string;
    sessionCount: number;
    totalInvocations: number;
    totalCorrectionRoundtrips: number;
    firstSeen: string | null;
    lastSeen: string | null;
  }
  const byAsset = new Map<string, Acc>();

  for (const r of rows) {
    const key = `${r.kind}:${r.name}`;
    const acc =
      byAsset.get(key) ??
      (() => {
        const fresh: Acc = {
          kind: r.kind,
          name: r.name,
          sessionCount: 0,
          totalInvocations: 0,
          totalCorrectionRoundtrips: 0,
          firstSeen: null,
          lastSeen: null,
        };
        byAsset.set(key, fresh);
        return fresh;
      })();
    acc.sessionCount += 1;
    acc.totalInvocations += r.invocationCount;
    acc.totalCorrectionRoundtrips += r.correctionRoundtrips;
    if (r.firstSeen && (!acc.firstSeen || r.firstSeen < acc.firstSeen))
      acc.firstSeen = r.firstSeen;
    if (r.lastSeen && (!acc.lastSeen || r.lastSeen > acc.lastSeen))
      acc.lastSeen = r.lastSeen;
  }

  const assets: ProjectWorkMetricRow[] = [...byAsset.values()]
    .map((a) => ({
      kind: a.kind,
      name: a.name,
      sessionCount: a.sessionCount,
      totalInvocations: a.totalInvocations,
      totalCorrectionRoundtrips: a.totalCorrectionRoundtrips,
      avgCorrectionRoundtrips:
        a.totalInvocations > 0
          ? a.totalCorrectionRoundtrips / a.totalInvocations
          : null,
      firstSeen: a.firstSeen,
      lastSeen: a.lastSeen,
    }))
    .sort((x, y) => y.totalInvocations - x.totalInvocations);

  return {
    signalType: "reference",
    signalNote: REFERENCE_SIGNAL_NOTE,
    projectId: project.id,
    projectName: project.name,
    clonePath: project.clonePath,
    metricCount: rows.length,
    assets,
  };
}
