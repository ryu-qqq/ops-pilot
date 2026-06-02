import type {
  Asset,
  ProjectAssetLint,
  ProjectUsageReport,
} from "@opspilot/shared-types";

// 자산 헬스 요약(자산/미사용/다른곳만/형식오류) — 개요 헬스카드와 헬스 대시보드가
// 같은 계산을 쓰도록 단일 원천으로 추출. (수치 어긋남 방지)
// "다른 곳만" = supported & !neverUsed & 이 프로젝트 0회 & 전체 >0 (공용 crew 자산).
export interface AssetHealthSummary {
  total: number;
  unused: number;
  otherOnly: number;
  formatErrors: number;
}

export function computeAssetHealthSummary(
  assets: Asset[] | undefined,
  usage: ProjectUsageReport | undefined,
  lint: ProjectAssetLint | undefined,
): AssetHealthSummary {
  const us = usage?.assets ?? [];
  return {
    total: assets?.length ?? 0,
    unused: us.filter((u) => u.neverUsed).length,
    otherOnly: us.filter(
      (u) =>
        u.supported &&
        !u.neverUsed &&
        u.inProjectCount === 0 &&
        u.totalCount > 0,
    ).length,
    formatErrors: (lint?.items ?? []).filter((l) => l.errorCount > 0).length,
  };
}
