import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { useRun, useRunTrace } from "../use-run";
import type { TraceEventView } from "../api";
import s from "./trace-view.module.css";

// 타입별 색·라벨 — "무엇이 일어났는지"가 한눈에 (가독성).
// CSS Modules 키 lookup 은 noUncheckedIndexedAccess 로 string|undefined → `?? ""` 로 안전.
function cls(k: string): string {
  return (s as Record<string, string | undefined>)[k] ?? "";
}
const typeMeta: Record<string, { label: string; row: string; label_: string }> = {
  system: { label: "SYSTEM", row: cls("rowSystem"), label_: cls("labelSystem") },
  user_message: { label: "USER", row: cls("rowUser"), label_: cls("labelUser") },
  assistant_message: { label: "ASSISTANT", row: cls("rowAssistant"), label_: cls("labelAssistant") },
  thinking: { label: "THINKING", row: cls("rowThinking"), label_: cls("labelThinking") },
  tool_call: { label: "TOOL →", row: cls("rowToolCall"), label_: cls("labelToolCall") },
  tool_result: { label: "← RESULT", row: cls("rowToolResult"), label_: cls("labelToolResult") },
  result: { label: "DONE", row: cls("rowResult"), label_: cls("labelResult") },
};

function preview(v: unknown): string {
  if (v === null || v === undefined) return "";
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return str.length > 120 ? `${str.slice(0, 120)}…` : str;
}

function pretty(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function TraceRow({ e }: { e: TraceEventView }) {
  const meta = typeMeta[e.type] ?? { label: e.type.toUpperCase(), row: "", label_: "" };
  const body = e.input ?? e.output;
  return (
    <li className={`${s.row} ${meta.row}`}>
      <div className={s.head}>
        <span className={s.seq}>#{e.seq}</span>{" "}
        <strong className={`${s.label} ${meta.label_}`}>{meta.label}</strong>
        {e.name && <code className={s.name}>{e.name}</code>}
      </div>
      {body !== null && body !== undefined && (
        <details style={{ marginTop: 2 }}>
          <summary className={s.summary}>{preview(body)}</summary>
          <pre className={s.pre}>
            {e.input != null && `input:\n${pretty(e.input)}\n\n`}
            {e.output != null && `output:\n${pretty(e.output)}`}
          </pre>
        </details>
      )}
    </li>
  );
}

export function TraceView({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const running = run?.status === "running";
  const { data: trace, isPending, isError, error } = useRunTrace(runId, running);

  if (runId === null)
    return (
      <EmptyState
        title="실행을 선택하세요"
        hint="왼쪽 목록에서 실행(run)을 고르면 단계별 트레이스가 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p className={s.loading}>
        <Loading label="트레이스 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  return (
    <>
      {run && (
        <div className={s.statusLine}>
          {running ? (
            <span className={s.statusRunning}>● 실행 중… (실시간 갱신)</span>
          ) : (
            <span
              className={run.status === "succeeded" ? s.statusSucceeded : s.statusFailed}
            >
              ● {run.status}
            </span>
          )}
        </div>
      )}
      {trace.length === 0 ? (
        running ? (
          <p className={s.loadingRunning}>
            <Loading label="트레이스 생성 중…" />
          </p>
        ) : (
          <EmptyState title="트레이스가 없어요" hint="이 실행에서 기록된 단계가 없습니다." />
        )
      ) : (
        <ol className={s.list}>
          {trace.map((e) => (
            <TraceRow key={e.seq} e={e} />
          ))}
        </ol>
      )}
    </>
  );
}
