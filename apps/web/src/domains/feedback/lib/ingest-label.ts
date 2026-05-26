import type { IngestBundleListItem } from "@opspilot/shared-types";

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** ingest 목록·카드 제목 — commit subject > retro > short hash. */
export function ingestListTitle(item: Pick<IngestBundleListItem, "commitSubject" | "retroPreview" | "gitRef">): string {
  if (item.commitSubject != null && item.commitSubject.trim() !== "") {
    return truncate(item.commitSubject, 80);
  }
  if (item.retroPreview != null && item.retroPreview.trim() !== "") {
    return truncate(item.retroPreview, 80);
  }
  return `commit ${item.gitRef.slice(0, 8)}`;
}

export function ingestListSubtitle(item: Pick<IngestBundleListItem, "gitRef" | "draftProposalCount" | "createdAt">): string {
  const parts = [
    item.gitRef.slice(0, 8),
    `draft ${String(item.draftProposalCount)}`,
    new Date(item.createdAt).toLocaleString(),
  ];
  return parts.join(" · ");
}
