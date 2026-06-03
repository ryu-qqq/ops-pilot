// ADR 0003 follow-up (관측소 4): trace event type → 노드 색/라벨/컬럼 토큰.
// FlowGraph 가 쓰던 인라인 상수를 한 곳으로 추출 — "통합 그래프 언어".
// 다음 Phase 의 피드백 IngestLineage 가 같은 토큰을 import 해 노드 색·라벨을 공유한다.
// (이번엔 FlowGraph 에만 적용. 과한 추상화 없이 색·라벨·컬럼 상수만 모은다.)

export interface TraceNodeToken {
  /** 짧은 라벨 — 노드 본문에 표시(짤림 방지). */
  label: string;
  /** Tailwind border+bg class — 디자인 토큰(success/warning/info/purple) 기반. */
  colorClass: string;
  /** 흐름 그래프 x 좌표 — 시간(y) 흐름 + type 좌우 분기. */
  column: number;
}

// fixture(normalize)와 실 local-claude 둘 다 커버. 별칭(tool_call↔tool_use 등)도 동일 토큰.
const TRACE_NODE_TOKENS: Record<string, TraceNodeToken> = {
  // 실 local-claude
  assistant_text: { label: "assistant", colorClass: "border-info bg-info/10", column: 0 },
  tool_use: { label: "tool", colorClass: "border-warning bg-warning/15", column: 260 },
  tool_result: { label: "result", colorClass: "border-success bg-success/15", column: 390 },
  user_message: { label: "user", colorClass: "border-foreground/40 bg-card", column: -130 },
  // 공통
  thinking: { label: "thinking", colorClass: "border-purple bg-purple/15", column: 130 },
  system: { label: "system", colorClass: "border-muted-foreground bg-muted/30", column: -260 },
  // fixture(normalize) 별칭
  tool_call: { label: "tool", colorClass: "border-warning bg-warning/15", column: 260 },
  assistant_message: { label: "assistant", colorClass: "border-info bg-info/10", column: 0 },
  result: { label: "result", colorClass: "border-success bg-success/15", column: 0 },
  init: { label: "system", colorClass: "border-muted-foreground bg-muted/30", column: -260 },
};

const FALLBACK_TOKEN: TraceNodeToken = {
  label: "event",
  colorClass: "border-border bg-card",
  column: 0,
};

/** trace event type → 노드 토큰(라벨·색·컬럼). 미지 type 은 fallback. */
export function nodeTypeToken(type: string): TraceNodeToken {
  const token = TRACE_NODE_TOKENS[type];
  if (token === undefined) {
    return { ...FALLBACK_TOKEN, label: type };
  }
  return token;
}
