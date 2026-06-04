import type { BadgeProps } from "../../../components/ui/badge";

/** Badge variant union — Badge 컴포넌트 정의(badge.tsx)와 동일하게 유지. */
type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/**
 * work 도메인 공용 배지 색 매핑 — 목록(work-list-view)·상세(work-detail-view)가 함께 import.
 * 색 의미를 한 곳에서만 정의해 중복·불일치를 막는다.
 */

/** ingest status → 의미별 색. reviewed/done=성공, evaluating/reviewing=진행, failed=실패. */
export function ingestStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "reviewed":
    case "done":
      return "success";
    case "evaluating":
    case "reviewing":
      return "warning";
    case "failed":
      return "destructive";
    default:
      return "secondary"; // pending 등
  }
}

/** run status → 의미별 색(run-list.tsx 의 기존 매핑과 동일 톤). */
export function runStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "destructive";
    case "running":
      return "warning";
    default:
      return "secondary"; // pending 등
  }
}

/** trigger → 색. auto=강조(default), manual=중립 외곽선(outline). 회색 단일 탈피. */
export function triggerVariant(trigger: string): BadgeVariant {
  return trigger === "auto" ? "default" : "outline";
}
