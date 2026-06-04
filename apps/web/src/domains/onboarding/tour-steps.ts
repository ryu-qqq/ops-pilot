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

export const TOUR_STEPS: TourStep[] = [
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
];
