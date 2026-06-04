import { useCallback, useState } from "react";
import type { Tab } from "../../app-tabs";
import { TOUR_STEPS } from "./tour-steps";

/** 투어가 화면을 직접 만지지 않고 호출부에 위임하는 콜백. */
interface TourCallbacks {
  /** 단계가 요구하는 탭으로 전환. */
  onTab: (tab: Tab) => void;
  /** 단계가 상세(needsSelection)면 첫 작업 자동 선택, 아니면 선택 해제. */
  onSelection: (needsSelection: boolean) => void;
}

export function useTour(cb: TourCallbacks) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // 해당 단계의 화면 상태(탭·선택)를 콜백으로 맞춘다.
  const applyStep = useCallback(
    (index: number) => {
      const step = TOUR_STEPS[index];
      if (step === undefined) return;
      cb.onTab(step.tab);
      cb.onSelection(step.needsSelection === true);
    },
    [cb],
  );

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    applyStep(0);
  }, [applyStep]);

  const close = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const ni = i + 1;
      // 마지막을 넘기면 종료.
      if (ni >= TOUR_STEPS.length) {
        setActive(false);
        return i;
      }
      applyStep(ni);
      return ni;
    });
  }, [applyStep]);

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
    step: TOUR_STEPS[stepIndex],
    total: TOUR_STEPS.length,
    start,
    close,
    next,
    prev,
    toggle,
  };
}
