import type { DesignSource } from "@opspilot/shared-types";

// ADR 0003 (D1): 평가 설계 산출의 source — asset(agent-crew 자산 본문 주입) vs baked(fallback).
// 관측소에서 run/벤치마크가 어느 경로로 만들어졌나를 색으로 구분(A/B 신호).
// asset = info(권장 경로), baked = warning(fallback) 으로 시각 대비.
export interface SourceToken {
  label: string;
  /** Badge variant — 기존 디자인 토큰 재사용. */
  variant: "info" | "warning" | "secondary";
  help: string;
}

export function sourceToken(source: DesignSource | null | undefined): SourceToken {
  if (source === "asset") {
    return {
      label: "asset",
      variant: "info",
      help: "평가 설계가 agent-crew 자산 본문을 주입해 만들어진 산출(ADR 0002 1B). 권장 경로.",
    };
  }
  if (source === "baked") {
    return {
      label: "baked",
      variant: "warning",
      help: "평가 설계가 자산 주입 없이 내장 fallback 프롬프트로 만들어진 산출(ADR 0002 4B).",
    };
  }
  return {
    label: "source ?",
    variant: "secondary",
    help: "이 run 의 설계 산출 source 가 기록되지 않음(legacy 또는 수동 작성 시나리오).",
  };
}
