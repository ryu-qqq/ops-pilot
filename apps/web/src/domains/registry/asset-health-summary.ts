import type {
  Asset,
  AssetGraph,
  ProjectAssetLint,
  ProjectUsageReport,
} from "@opspilot/shared-types";
import { computeAssetStatus, refKey } from "./graph";

// 자산 헬스 요약(자산/미사용/타프로젝트만/문제) — 개요 헬스카드와 툴킷 트리가
// 같은 계산을 쓰도록 단일 원천으로 추출. (수치 어긋남 방지)
// "타 프로젝트만" = supported & !neverUsed & 이 프로젝트 0회 & 전체 >0 (공용 crew 자산).
// "문제" = computeAssetStatus 가 🔴(형식 에러 or 고아+미사용 dead). graph 없으면 형식 에러만.
// 다대다 중복은 자산(id) 기준이라 카운트가 자동으로 1회만 잡힌다.
export interface AssetHealthSummary {
  total: number;
  unused: number;
  otherOnly: number;
  problems: number;
}

export function computeAssetHealthSummary(
  assets: Asset[] | undefined,
  usage: ProjectUsageReport | undefined,
  lint: ProjectAssetLint | undefined,
  graph: AssetGraph | undefined,
): AssetHealthSummary {
  const us = usage?.assets ?? [];
  const usageMap = new Map(us.map((u) => [refKey(u.kind, u.name), u]));
  const lintMap = new Map((lint?.items ?? []).map((l) => [l.assetId, l]));
  const graphMap = new Map(
    (graph?.items ?? []).map((g) => [refKey(g.kind, g.name), g]),
  );

  let problems = 0;
  for (const a of assets ?? []) {
    const status = computeAssetStatus(
      a,
      usageMap.get(refKey(a.kind, a.name)),
      lintMap.get(a.id),
      graphMap.get(refKey(a.kind, a.name)),
    );
    if (status.tone === "red") problems += 1;
  }

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
    problems,
  };
}
