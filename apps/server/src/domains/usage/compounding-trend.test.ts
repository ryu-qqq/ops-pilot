import { describe, it, expect } from "vitest";
import type { WorkMetricRow } from "./work-metric-repository.js";
import {
  isoWeekStart,
  aggregateTrendPoints,
  aggregateApplyEvents,
} from "./compounding-trend.js";

// Jan 1 2024 = 월요일 (고정 사실)을 앵커로 주 시작을 검증.
describe("isoWeekStart", () => {
  it("주중 날짜를 그 주 월요일(UTC)로 내린다", () => {
    expect(isoWeekStart("2024-01-03T12:00:00Z")).toBe("2024-01-01"); // 수
    expect(isoWeekStart("2024-01-07T23:59:00Z")).toBe("2024-01-01"); // 일
    expect(isoWeekStart("2024-01-08T00:00:00Z")).toBe("2024-01-08"); // 월
  });
});

function row(over: Partial<WorkMetricRow>): WorkMetricRow {
  return {
    sessionId: "s",
    kind: "agent",
    name: "x",
    cwd: "/p",
    invocationCount: 1,
    correctionRoundtrips: 0,
    firstSeen: "2024-01-03T10:00:00Z",
    lastSeen: "2024-01-03T11:00:00Z",
    ...over,
  };
}

describe("aggregateTrendPoints", () => {
  it("first_seen 주별로 발화·정정·세션을 합치고 정정비율을 낸다", () => {
    const points = aggregateTrendPoints([
      row({ sessionId: "a", invocationCount: 4, correctionRoundtrips: 2, firstSeen: "2024-01-03T10:00:00Z" }),
      row({ sessionId: "b", invocationCount: 6, correctionRoundtrips: 1, firstSeen: "2024-01-05T10:00:00Z" }),
      row({ sessionId: "c", invocationCount: 5, correctionRoundtrips: 0, firstSeen: "2024-01-10T10:00:00Z" }),
    ]);
    expect(points).toEqual([
      { periodStart: "2024-01-01", sessions: 2, invocations: 10, corrections: 3, correctionRate: 0.3 },
      { periodStart: "2024-01-08", sessions: 1, invocations: 5, corrections: 0, correctionRate: 0 },
    ]);
  });

  it("first_seen 이 null 인 행은 제외한다", () => {
    const points = aggregateTrendPoints([
      row({ firstSeen: null, invocationCount: 9, correctionRoundtrips: 9 }),
      row({ firstSeen: "2024-01-03T10:00:00Z", invocationCount: 2, correctionRoundtrips: 1 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ invocations: 2, corrections: 1, correctionRate: 0.5 });
  });

  it("발화 0 버킷의 정정비율은 null 이다", () => {
    const points = aggregateTrendPoints([
      row({ invocationCount: 0, correctionRoundtrips: 0 }),
    ]);
    expect(points[0]?.correctionRate).toBeNull();
  });
});

describe("aggregateApplyEvents", () => {
  it("at 오름차순으로 정렬해 매핑한다", () => {
    const events = aggregateApplyEvents([
      { createdAt: "2024-02-01T00:00:00Z", targetKind: "cursor_rule", targetPath: ".cursor/rules/b.mdc" },
      { createdAt: "2024-01-01T00:00:00Z", targetKind: "agent", targetPath: ".claude/agents/a.md" },
    ]);
    expect(events.map((e) => e.at)).toEqual([
      "2024-01-01T00:00:00Z",
      "2024-02-01T00:00:00Z",
    ]);
    expect(events[0]).toEqual({
      at: "2024-01-01T00:00:00Z",
      targetKind: "agent",
      targetPath: ".claude/agents/a.md",
    });
  });
});
