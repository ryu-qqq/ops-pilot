import { useRunTrace } from "../use-run";
import type { TraceEventView } from "../api";

// 타입별 색/라벨 — "무엇이 일어났는지"가 한눈에 (가독성).
const typeStyle: Record<string, { label: string; color: string }> = {
  system: { label: "SYSTEM", color: "#6e7781" },
  user_message: { label: "USER", color: "#0969da" },
  assistant_message: { label: "ASSISTANT", color: "#1f2328" },
  thinking: { label: "THINKING", color: "#8250df" },
  tool_call: { label: "TOOL →", color: "#bc4c00" },
  tool_result: { label: "← RESULT", color: "#1a7f37" },
  result: { label: "DONE", color: "#0a3069" },
};

function preview(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function pretty(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function TraceRow({ e }: { e: TraceEventView }) {
  const st = typeStyle[e.type] ?? { label: e.type.toUpperCase(), color: "#333" };
  const body = e.input ?? e.output;
  return (
    <li style={{ borderLeft: `3px solid ${st.color}`, padding: "6px 0 10px 12px", marginLeft: 8 }}>
      <div style={{ fontSize: 12 }}>
        <span style={{ color: "#aaa" }}>#{e.seq}</span>{" "}
        <strong style={{ color: st.color }}>{st.label}</strong>
        {e.name && <code style={{ marginLeft: 6 }}>{e.name}</code>}
      </div>
      {body !== null && body !== undefined && (
        <details style={{ marginTop: 2 }}>
          <summary style={{ cursor: "pointer", color: "#444", fontSize: 13 }}>
            {preview(body)}
          </summary>
          <pre
            style={{
              background: "#f6f8fa",
              padding: 8,
              borderRadius: 4,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 280,
            }}
          >
            {e.input != null && `input:\n${pretty(e.input)}\n\n`}
            {e.output != null && `output:\n${pretty(e.output)}`}
          </pre>
        </details>
      )}
    </li>
  );
}

export function TraceView({ runId }: { runId: string | null }) {
  const { data: trace, isPending, isError, error } = useRunTrace(runId);

  if (runId === null) return <p style={{ color: "#888" }}>왼쪽에서 실행(run)을 선택하세요.</p>;
  if (isPending) return <p>불러오는 중…</p>;
  if (isError) return <p style={{ color: "crimson" }}>{error.message}</p>;
  if (trace.length === 0) return <p style={{ color: "#888" }}>트레이스 없음.</p>;

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {trace.map((e) => (
        <TraceRow key={e.seq} e={e} />
      ))}
    </ol>
  );
}
