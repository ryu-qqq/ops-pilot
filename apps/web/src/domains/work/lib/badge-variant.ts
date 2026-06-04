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

/**
 * trigger → 색. auto=차분한 회색 톤(secondary), manual=중립 외곽선(outline).
 * 흰/밝은 default 톤이 거슬린다는 2차 피드백 반영 — TriggerBadge(trigger-badge.tsx)도
 * 같은 secondary 톤으로 통일해 work 카드·상세·proposal 에서 auto 표현이 일관되게 한다.
 */
export function triggerVariant(trigger: string): BadgeVariant {
  return trigger === "auto" ? "secondary" : "outline";
}
