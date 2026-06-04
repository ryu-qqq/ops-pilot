import type { IngestBundleListItem, ProposalWithSource } from "@opspilot/shared-types";
import type { RunListItem } from "../../run/api";
import type { WorkGroups, WorkItem } from "../types";

/**
 * ingest·run·proposals 를 작업 목록 그룹으로 머지(순수함수, 부수효과 없음).
 * - cursor: ingest 한 건 = WorkItem, proposalCount = 그 ingestId 의 proposal 수.
 * - manual: ingest 가 소비한 evalRunId/reviewRunId 가 아닌 run = 수동 실행.
 * - 정렬: 각 그룹 createdAt 내림차순(최신 먼저).
 *
 * NOTE: ingest 는 목록 항목 타입(IngestBundleListItem) — evalRunId/reviewRunId 가
 * contextJson 중첩이 아닌 평탄 필드이며 nullable·optional 이다.
 */
export function mergeWorkItems(
  ingests: IngestBundleListItem[],
  runs: RunListItem[],
  proposals: ProposalWithSource[],
): WorkGroups {
  const countByIngest = new Map<string, number>();
  for (const p of proposals)
    countByIngest.set(p.ingestId, (countByIngest.get(p.ingestId) ?? 0) + 1);

  const consumedRunIds = new Set<string>();
  for (const ig of ingests) {
    if (ig.evalRunId != null) consumedRunIds.add(ig.evalRunId);
    if (ig.reviewRunId != null) consumedRunIds.add(ig.reviewRunId);
  }

  const cursor: WorkItem[] = ingests
    .map((ingest) => ({
      kind: "ingest" as const,
      id: ingest.id,
      ingest,
      proposalCount: countByIngest.get(ingest.id) ?? 0,
    }))
    .sort((a, b) => b.ingest.createdAt.localeCompare(a.ingest.createdAt));

  const manual: WorkItem[] = runs
    .filter((r) => !consumedRunIds.has(r.id))
    .map((run) => ({ kind: "run" as const, id: run.id, run }))
    .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));

  return { cursor, manual };
}
