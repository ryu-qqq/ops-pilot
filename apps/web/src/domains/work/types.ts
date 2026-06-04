import type { IngestBundle } from "@opspilot/shared-types";
import type { RunListItem } from "../run/api";

/**
 * 작업 통합 모델 — Cursor 작업(ingest) 또는 수동 실행(run) 한 건.
 * run kind 는 목록 카드에 assetName/scenarioName/projectName 이 필요해 base Run 이 아니라
 * 목록 응답 타입(RunListItem)을 쓴다 — 이 필드들은 단건 Run 스키마엔 없다.
 */
export type WorkItem =
  | { kind: "ingest"; id: string; ingest: IngestBundle; proposalCount: number }
  | { kind: "run"; id: string; run: RunListItem };

/** 작업 목록 그룹 — Cursor 작업 섹션 / 수동 실행 섹션. */
export interface WorkGroups {
  cursor: WorkItem[];
  manual: WorkItem[];
}

/** 드릴다운 선택 키. null 이면 목록 화면. */
export type WorkSelection = { kind: "ingest" | "run"; id: string } | null;
