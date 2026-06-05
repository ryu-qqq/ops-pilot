import { useCallback, useState } from "react";
import type { Tab } from "../../app-tabs";
import { TOUR_STEPS_BY_TAB } from "./tour-steps";

/** 투어가 화면을 직접 만지지 않고 호출부에 위임하는 콜백. */
interface TourCallbacks {
  /** 단계가 요구하는 탭으로 전환. */
  onTab: (tab: Tab) => void;
  /** 단계가 상세(needsSelection)면 그 탭의 첫 항목 자동 선택, 아니면 해제. tab 으로 work/registry 분기. */
  onSelection: (needsSelection: boolean, tab: Tab) => void;
}

// 나침반을 누른 탭의 투어가 돈다. 해당 탭에 투어가 없으면 빈 배열.
export function useTour(tab: Tab, cb: TourCallbacks) {
  const steps = TOUR_STEPS_BY_TAB[tab] ?? [];
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // 해당 단계의 화면 상태(탭·선택)를 콜백으로 맞춘다.
  const applyStep = useCallback(
    (index: number) => {
      const step = steps[index];
      if (step === undefined) return;
      cb.onTab(step.tab);
      cb.onSelection(step.needsSelection === true, step.tab);
    },
    [cb, steps],
  );

  const start = useCallback(() => {
    if (steps.length === 0) return; // 이 탭에 투어 없음
    setStepIndex(0);
    setActive(true);
    applyStep(0);
  }, [applyStep, steps]);

  const close = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const ni = i + 1;
      // 마지막을 넘기면 종료.
      if (ni >= steps.length) {
        setActive(false);
        return i;
      }
      applyStep(ni);
      return ni;
    });
  }, [applyStep, steps]);

  const prev = useCallback(() => {
    setStepIndex((i) => {
      const pi = Math.max(0, i - 1);
      applyStep(pi);
      return pi;
    });
  }, [applyStep]);

  const toggle = useCallback(() => {
    if (active) close();
    else start();
  }, [active, close, start]);

  return {
    active,
    stepIndex,
    step: steps[stepIndex],
    total: steps.length,
    start,
    close,
    next,
    prev,
    toggle,
  };
}
