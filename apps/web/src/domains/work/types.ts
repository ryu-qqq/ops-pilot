import type { IngestBundleListItem } from "@opspilot/shared-types";
import type { RunListItem } from "../run/api";

/**
 * 작업 통합 모델 — Cursor 작업(ingest) 또는 수동 실행(run) 한 건.
 * - ingest kind: useIngests 가 반환하는 목록 항목 타입(IngestBundleListItem) 을 쓴다.
 *   이 타입은 evalRunId/reviewRunId/commitSubject 를 (contextJson 중첩이 아니라) 평탄 필드로
 *   가지며 diffSummary/contextJson 전체는 없다 — 상세는 드릴다운에서 useIngestDetail 로 따로 로드.
 * - run kind: 목록 카드에 assetName/scenarioName/projectName 이 필요해 base Run 이 아니라
 *   목록 응답 타입(RunListItem)을 쓴다 — 이 필드들은 단건 Run 스키마엔 없다.
 */
export type WorkItem =
  | { kind: "ingest"; id: string; ingest: IngestBundleListItem; proposalCount: number }
  | { kind: "run"; id: string; run: RunListItem };

/** 작업 목록 그룹 — Cursor 작업 섹션 / 수동 실행 섹션. */
export interface WorkGroups {
  cursor: WorkItem[];
  manual: WorkItem[];
}

/** 드릴다운 선택 키. null 이면 목록 화면. */
export type WorkSelection = { kind: "ingest" | "run"; id: string } | null;
