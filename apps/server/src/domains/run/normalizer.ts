import type { TraceEventType } from "@opspilot/shared-types";

// 정규화 트레이스 1건 (DB trace_event 의 seq 이전 형태).
export interface NormalizedEvent {
  type: TraceEventType;
  name: string | null;
  input: unknown;
  output: unknown;
  raw: unknown;
}

export interface RunUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * claude stream-json 이벤트 1개 → 정규화 이벤트 0~N개.
 * assistant 메시지는 content 블록(text/tool_use/thinking)별로 펼친다.
 */
export function normalizeEvent(raw: unknown): NormalizedEvent[] {
  const ev = asRecord(raw);
  const t = ev["type"];

  if (t === "system") {
    return [{ type: "system", name: String(ev["subtype"] ?? "system"), input: null, output: ev, raw }];
  }

  if (t === "result") {
    return [
      {
        type: "result",
        name: String(ev["subtype"] ?? "result"),
        input: null,
        output: ev["result"] ?? null,
        raw,
      },
    ];
  }

  if (t === "assistant" || t === "user") {
    const msg = asRecord(ev["message"]);
    const content = msg["content"];
    if (!Array.isArray(content)) {
      return [
        {
          type: t === "assistant" ? "assistant_message" : "user_message",
          name: null,
          input: null,
          output: content ?? null,
          raw,
        },
      ];
    }
    const out: NormalizedEvent[] = [];
    for (const block of content as unknown[]) {
      const b = asRecord(block);
      switch (b["type"]) {
        case "text":
          out.push({ type: "assistant_message", name: null, input: null, output: b["text"] ?? null, raw });
          break;
        case "thinking":
          out.push({ type: "thinking", name: null, input: null, output: b["thinking"] ?? null, raw });
          break;
        case "tool_use":
          out.push({
            type: "tool_call",
            name: typeof b["name"] === "string" ? b["name"] : null,
            input: b["input"] ?? null,
            output: null,
            raw,
          });
          break;
        case "tool_result":
          out.push({
            type: "tool_result",
            name: typeof b["tool_use_id"] === "string" ? b["tool_use_id"] : null,
            input: null,
            output: b["content"] ?? null,
            raw,
          });
          break;
        default:
          out.push({
            type: t === "assistant" ? "assistant_message" : "user_message",
            name: null,
            input: null,
            output: b,
            raw,
          });
      }
    }
    return out;
  }

  // 알 수 없는 타입도 손실 없이 system 으로 보관
  return [{ type: "system", name: typeof t === "string" ? t : "unknown", input: null, output: ev, raw }];
}

/** result 이벤트에서 토큰/비용 추출 (run 행 마감용). */
export function extractUsage(raw: unknown): RunUsage | null {
  const ev = asRecord(raw);
  if (ev["type"] !== "result") return null;
  const usage = asRecord(ev["usage"]);
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    promptTokens: num(usage["input_tokens"]),
    completionTokens: num(usage["output_tokens"]),
    costUsd: num(ev["total_cost_usd"]),
  };
}
