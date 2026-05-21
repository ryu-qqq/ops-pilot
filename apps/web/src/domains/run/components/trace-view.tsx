import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useRun, useRunTrace } from "../use-run";
import type { TraceEventView } from "../api";

// 타입별 색·라벨.
const typeMeta: Record<string, { label: string; tone: string }> = {
  system: { label: "SYSTEM", tone: "text-muted-foreground border-muted" },
  init: { label: "INIT", tone: "text-muted-foreground border-muted" },
  user_message: { label: "USER", tone: "text-primary border-primary/50" },
  assistant_message: { label: "ASSISTANT", tone: "text-foreground border-foreground/40" },
  assistant_text: { label: "ASSISTANT", tone: "text-foreground border-foreground/40" },
  thinking: { label: "THINKING", tone: "text-info border-info/50" },
  tool_call: { label: "TOOL →", tone: "text-warning border-warning/50" },
  tool_use: { label: "TOOL →", tone: "text-warning border-warning/50" },
  tool_result: { label: "← RESULT", tone: "text-success border-success/50" },
  result: { label: "DONE", tone: "text-primary border-primary/50" },
};

// OPSP-38 (4): event type 정적 해설 — "이건 뭐하는 놈인지".
const typeHelp: Record<string, string> = {
  system:
    "Claude Code 세션 시작 시 주입되는 시스템 메시지입니다. 도구 목록·환경·규칙 등 초기 설정이 담깁니다.",
  init: "세션 초기화 단계입니다.",
  user_message: "사용자(또는 시나리오 input)가 에이전트에 전달한 입력입니다.",
  thinking:
    "모델이 응답을 내기 전 내부적으로 추론하는 단계입니다. extended thinking 옵션이 켜져 있을 때만 내용이 보이고, 아니면 비어 있습니다 — 비어 있어도 정상입니다.",
  assistant_message:
    "Claude 가 사용자에게 보여주는 응답 텍스트입니다. 한 turn 에 한 번씩 나올 수 있어, 여러 번 등장할 수 있습니다.",
  assistant_text: "Claude 가 사용자에게 보여주는 응답 텍스트입니다.",
  tool_use:
    "Claude 가 도구를 호출하는 단계입니다. 어떤 도구를 어떤 인자(input)로 부를지는 사용자가 아니라 *모델이 스스로 결정*합니다.",
  tool_call:
    "Claude 가 도구를 호출하는 단계입니다. 도구·인자는 모델이 결정합니다.",
  tool_result:
    "직전 도구 호출의 실행 결과입니다. 이 결과를 바탕으로 다음 turn 이 이어집니다.",
  result: "실행이 종료된 최종 상태입니다 (성공/실패).",
};

function preview(v: unknown): string {
  if (v === null || v === undefined) return "";
  const str = typeof v === "string" ? v : JSON.stringify(v);
  return str.length > 120 ? `${str.slice(0, 120)}…` : str;
}
function pretty(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}
function metaOf(type: string) {
  return typeMeta[type] ?? { label: type.toUpperCase(), tone: "border-border" };
}

// OPSP-38 (4): 앞뒤 event 관계를 정적 휴리스틱으로 설명 — "왜 나왔는지".
function contextNote(trace: TraceEventView[], idx: number): string {
  const ev = trace[idx];
  if (ev === undefined) return "";
  const prev = idx > 0 ? trace[idx - 1] : undefined;
  if ((ev.type === "tool_result" || ev.type === "result") && prev !== undefined) {
    if (prev.type === "tool_use" || prev.type === "tool_call") {
      return `직전 #${String(prev.seq)} 도구 호출${prev.name === null ? "" : `(${prev.name})`} 의 실행 결과입니다.`;
    }
  }
  if ((ev.type === "tool_use" || ev.type === "tool_call") && prev !== undefined) {
    if (prev.type === "thinking") {
      return `직전 #${String(prev.seq)} 사고(thinking) 단계를 거쳐 모델이 이 도구를 선택했습니다.`;
    }
    return `직전 #${String(prev.seq)} ${metaOf(prev.type).label} 에 이어 모델이 도구를 호출합니다.`;
  }
  if (prev === undefined) return "이 run 의 첫 단계입니다.";
  return `직전 단계는 #${String(prev.seq)} ${metaOf(prev.type).label} 입니다.`;
}

function TraceRow({ e, onOpen }: { e: TraceEventView; onOpen: () => void }) {
  const meta = metaOf(e.type);
  const body = e.input ?? e.output;
  return (
    <li className={cn("relative border-l-2 pl-4 pb-3", meta.tone)}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">#{e.seq}</span>
          <span className={cn("font-semibold", meta.tone.split(" ")[0])}>{meta.label}</span>
          {e.name !== null && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{e.name}</code>
          )}
        </div>
        {body !== null && body !== undefined && (
          <p className="mt-1 break-words text-sm text-muted-foreground hover:text-foreground">
            {preview(body)}
          </p>
        )}
      </button>
    </li>
  );
}

function EventModal({
  trace,
  idx,
  onClose,
}: {
  trace: TraceEventView[];
  idx: number;
  onClose: () => void;
}) {
  const ev = trace[idx];
  if (ev === undefined) return null;
  const meta = metaOf(ev.type);
  const next = idx < trace.length - 1 ? trace[idx + 1] : undefined;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* OPSP-38 follow-up: 고정 크기 모달 — event 종류 무관 동일 박스 + 내부 스크롤 */}
      <DialogContent className="flex h-[78vh] max-w-3xl flex-col gap-0">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground">#{ev.seq}</span>
            <span className={meta.tone.split(" ")[0]}>{meta.label}</span>
            {ev.name !== null && (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{ev.name}</code>
            )}
          </DialogTitle>
        </DialogHeader>
        {/* 본문만 스크롤 — 헤더는 고정 */}
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {/* 이건 뭐하는 놈인지 */}
          <div className="rounded-md border border-info/30 bg-info/5 p-2.5 text-sm">
            <div className="text-xs font-semibold text-info">이 단계는 무엇인가</div>
            <p className="mt-0.5">{typeHelp[ev.type] ?? "이 타입에 대한 설명이 아직 없습니다."}</p>
          </div>
          {/* 왜 나왔는지 (앞뒤 맥락) */}
          <div className="rounded-md border bg-muted/30 p-2.5 text-sm">
            <div className="text-xs font-semibold text-muted-foreground">앞뒤 맥락</div>
            <p className="mt-0.5">{contextNote(trace, idx)}</p>
            {next !== undefined && (
              <p className="mt-0.5 text-muted-foreground">
                다음은 #{next.seq} {metaOf(next.type).label}
                {next.name === null ? "" : ` (${next.name})`} 으로 이어집니다.
              </p>
            )}
          </div>
          {/* input / output — max-h 없이 자연 길이, 스크롤은 부모(본문)가 담당 */}
          {ev.input !== null && ev.input !== undefined && (
            <div>
              <div className="text-xs text-muted-foreground">input</div>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-2 font-mono text-xs">
                {pretty(ev.input)}
              </pre>
            </div>
          )}
          {ev.output !== null && ev.output !== undefined && (
            <div>
              <div className="text-xs text-muted-foreground">output</div>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-2 font-mono text-xs">
                {pretty(ev.output)}
              </pre>
            </div>
          )}
          {ev.input === null && ev.output === null && (
            <p className="text-xs text-muted-foreground">이 단계에는 input/output 데이터가 없습니다.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TraceView({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const running = run?.status === "running";
  const { data: trace, isPending, isError, error } = useRunTrace(runId, running);
  // OPSP-38 (2): 접기/펼치기. (4): 클릭한 event 모달.
  const [open, setOpen] = useState(true);
  const [modalIdx, setModalIdx] = useState<number | null>(null);

  if (runId === null)
    return (
      <EmptyState
        title="실행을 선택하세요"
        hint="왼쪽 목록에서 실행(run)을 고르면 단계별 트레이스가 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="트레이스 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;

  return (
    <div className="space-y-2">
      {/* OPSP-38 (2): 접기/펼치기 헤더 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="px-1.5 text-sm font-semibold"
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          실행 트레이스 ({trace.length})
        </Button>
        {run && (
          <Badge
            variant={
              running ? "warning" : run.status === "succeeded" ? "success" : "destructive"
            }
          >
            {running ? "실행 중… (실시간 갱신)" : run.status}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">단계 클릭 → 상세</span>
      </div>

      {open &&
        (trace.length === 0 ? (
          running ? (
            <p className="text-sm text-warning">
              <Loading label="트레이스 생성 중…" />
            </p>
          ) : (
            <EmptyState title="트레이스가 없어요" hint="이 실행에서 기록된 단계가 없습니다." />
          )
        ) : (
          /* OPSP-38 (3): 카드를 늘리지 말고 이 박스 안에서만 스크롤 */
          <ol className="ml-2 max-h-[460px] space-y-2 overflow-y-auto pr-2">
            {trace.map((e, i) => (
              <TraceRow key={e.seq} e={e} onOpen={() => setModalIdx(i)} />
            ))}
          </ol>
        ))}

      {modalIdx !== null && (
        <EventModal trace={trace} idx={modalIdx} onClose={() => setModalIdx(null)} />
      )}
    </div>
  );
}
