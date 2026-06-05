import type { Tab } from "../../app-tabs";

/** 한 투어 단계. target=null 이면 화면 중앙 말풍선(하이라이트 없음). */
export interface TourStep {
  key: string;
  /** data-tour 속성 값. null 이면 중앙 말풍선. */
  target: string | null;
  title: string;
  body: string;
  /** 이 단계 진입 시 맞출 탭. */
  tab: Tab;
  /** true 면 진입 시 첫 작업을 자동 선택(상세 단계). false/생략이면 목록(선택 해제). */
  needsSelection?: boolean;
  /** 말풍선 위치 힌트(타겟 기준). */
  placement?: "bottom" | "top" | "right" | "left";
}

// 탭별 투어 — 나침반을 누른 탭의 투어가 돈다. needsSelection 단계는 그 탭의 "첫 항목"을
// 자동 선택해 상세까지 짚는다(work=첫 작업, registry=첫 자산). app.tsx 가 선택을 위임받는다.
export const TOUR_STEPS_BY_TAB: Partial<Record<Tab, TourStep[]>> = {
  work: [
    { key: "project", target: "project-select", tab: "work", placement: "bottom",
      title: "프로젝트 고르기", body: "먼저 평가할 프로젝트를 골라요." },
    { key: "scan", target: "scan", tab: "work", placement: "bottom",
      title: "자산 읽기", body: "스캔하면 그 프로젝트의 에이전트·스킬·커맨드(자산)를 읽어들여요." },
    { key: "list", target: "work-list", tab: "work", placement: "top",
      title: "작업이 쌓이는 곳", body: "Cursor·AI 작업이 자동 평가돼 여기 작업으로 쌓여요. 위 단계 배지로 진행 상태도 봐요." },
    { key: "open", target: "work-card", tab: "work", placement: "right",
      title: "작업 열기", body: "작업 하나를 열면 그 작업의 평가·개선안이 한 화면에 보여요." },
    { key: "verdict", target: "verdict", tab: "work", needsSelection: true, placement: "bottom",
      title: "잘했나 판단", body: "이 작업을 잘했는지 — 점수·판정을 한눈에 봐요." },
    { key: "proposals", target: "proposals", tab: "work", needsSelection: true, placement: "top",
      title: "뭘 고치나 결정", body: "개선안을 승인/거절해요. 승인하면 자산에 반영돼 다음 작업이 더 나아져요." },
  ],
  registry: [
    { key: "r-status", target: "asset-status", tab: "registry", placement: "bottom",
      title: "자산 상태 한눈에",
      body: "점 색으로 상태를 봐요. 빨강=형식 오류로 트리거가 안 됨, 노랑=형식 경고거나 한 번도 안 쓰임, 초록=형식 OK에 쓰임. 점에 마우스를 올리면 왜 그 색인지 한 줄로 떠요." },
    { key: "r-open", target: "asset-list", tab: "registry", placement: "right",
      title: "자산 열기",
      body: "자산 하나를 누르면 오른쪽에 상세가 열려요. 버전·트리거·시나리오를 깊게 봐요." },
    { key: "r-desc", target: "asset-description", tab: "registry", needsSelection: true, placement: "bottom",
      title: "이게 뭘 하는 자산인지",
      body: "상세 맨 위에 그 자산의 description 이 보여요. 목록엔 안 나오니 여기서 확인해요. 형식이 깨졌으면 못 읽는다고 알려줘요." },
    { key: "r-trigger", target: "asset-trigger-tab", tab: "registry", needsSelection: true, placement: "bottom",
      title: "트리거 평가",
      body: "트리거 탭에서 이 자산이 그 상황에 제대로 발화하는지 재요. 쿼리 자동생성 → 평가 실행 → (필요하면) description 자동개선 순서. 개선안은 직접 복사해 넣어요." },
    { key: "r-prune", target: "asset-prune", tab: "registry", needsSelection: true, placement: "top",
      title: "안 쓰는 건 정리",
      body: "버전 탭 아래 삭제(prune)로 미사용 전용 자산을 지워요. 평가 이력까지 영구 삭제되고, 여러 곳이 쓰는 공용 crew 자산은 막혀 있어요." },
  ],
};
