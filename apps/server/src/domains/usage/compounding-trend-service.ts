import type { CompoundingTrend, Project } from "@opspilot/shared-types";
import { listProposalsByProject } from "../feedback/repository.js";
import {
  aggregateApplyEvents,
  aggregateTrendPoints,
} from "./compounding-trend.js";
import { listWorkMetricsForClone } from "./work-metric-repository.js";

/** UI 라벨 — 추세를 인과로 오독하지 않게(설계 문서 §정직성). */
export const COMPOUNDING_SIGNAL_NOTE =
  "추세는 인과가 아니라 신호다. 정정비율(정정왕복÷발화)은 작업 난도와 사용자 숙련도 변화에 함께 영향받는다 — 비율이 떨어져도 하네스 개선 덕인지 단정할 수 없다. 표본(세션·발화)이 적은 구간은 흔들린다.";

/** 한 프로젝트의 정정비율 주별 추세 + 개선안 적용 마커(읽기 전용 집계). */
export function compoundingTrendForProject(project: Project): CompoundingTrend {
  const rows = listWorkMetricsForClone(project.clonePath);
  const applied = listProposalsByProject(project.id, "applied");
  const points = aggregateTrendPoints(rows);
  const applyEvents = aggregateApplyEvents(applied);
  return {
    signalType: "reference",
    signalNote: COMPOUNDING_SIGNAL_NOTE,
    projectId: project.id,
    projectName: project.name,
    clonePath: project.clonePath,
    bucket: "week",
    points,
    applyEvents,
    totalSessions: points.reduce((a, p) => a + p.sessions, 0),
    totalInvocations: points.reduce((a, p) => a + p.invocations, 0),
  };
}
