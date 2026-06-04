import type { IngestBundle, Run } from "@opspilot/shared-types";

/** 작업 통합 모델 — Cursor 작업(ingest) 또는 수동 실행(run) 한 건. */
export type WorkItem =
  | { kind: "ingest"; id: string; ingest: IngestBundle; proposalCount: number }
  | { kind: "run"; id: string; run: Run };

/** 작업 목록 그룹 — Cursor 작업 섹션 / 수동 실행 섹션. */
export interface WorkGroups {
  cursor: WorkItem[];
  manual: WorkItem[];
}

/** 드릴다운 선택 키. null 이면 목록 화면. */
export type WorkSelection = { kind: "ingest" | "run"; id: string } | null;
