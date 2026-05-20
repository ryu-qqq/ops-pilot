import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Activity,
  AlertTriangle,
  Brain,
  ChevronRight,
  Cog,
  FileText,
  MessageSquare,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { EmptyState, InlineError, Loading } from "../../../lib/ui";
import { useRun, useRunTrace } from "../../run/use-run";
import type { TraceEventView } from "../../run/api";

// OPSP-35 (b 재작성): 선택된 *1개 run* 의 trace event 흐름을 그래프로 +
// 그 run 의 상세 메트릭(시간·토큰·비용·type별·tool별·thinking·sub-agent) 카드.
// 사용자 의도: 무한 스크롤 트레이스 리스트를 *그래프*로 펼쳐 보고 싶다.

interface Props {
  selectedRunId: string | null;
}

const TYPE_COLOR: Record<string, string> = {
  assistant_text: "border-info bg-info/10",
  thinking: "border-purple bg-purple/10",
  tool_use: "border-warning bg-warning/10",
  tool_result: "border-success bg-success/10",
  system: "border-muted-foreground bg-muted/10",
  user_message: "border-foreground/40 bg-card",
};
const TYPE_ICON: Record<string, React.ReactNode> = {
  assistant_text: <MessageSquare className="h-3 w-3" />,
  thinking: <Brain className="h-3 w-3" />,
  tool_use: <Wrench className="h-3 w-3" />,
  tool_result: <Activity className="h-3 w-3" />,
  system: <Cog className="h-3 w-3" />,
  user_message: <MessageSquare className="h-3 w-3" />,
};

// x column 분포 — *옵시디언 느낌* 으로 type별 분기. y = seq 시간순.
const TYPE_COLUMN: Record<string, number> = {
  user_message: -240,
  assistant_text: 0,
  thinking: 200,
  tool_use: 400,
  tool_result: 600,
  system: -120,
};
const ROW_HEIGHT = 70;

interface TraceNodeData extends Record<string, unknown> {
  ev: TraceEventView;
}

function TraceEventNode({ data }: NodeProps<Node<TraceNodeData>>) {
  const ev = data.ev;
  const isTaskTool = ev.type === "tool_use" && ev.name === "Task";
  const cls = TYPE_COLOR[ev.type] ?? "border-border";
  const icon = TYPE_ICON[ev.type] ?? <FileText className="h-3 w-3" />;
  return (
    <div className={`rounded-md border-2 px-2 py-1.5 text-xs shadow-sm ${cls} ${isTaskTool ? "ring-2 ring-purple/50" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-mono text-[10px] opacity-70">#{ev.seq}</span>
        <span className="font-mono text-[10px]">{ev.type}</span>
      </div>
      {ev.name !== null && (
        <div className={`max-w-[160px] truncate text-[11px] font-medium ${isTaskTool ? "text-purple-foreground" : ""}`}>
          {isTaskTool && <ChevronRight className="mr-0.5 inline h-3 w-3" />}
          {ev.name}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { trace: TraceEventNode };

interface Metrics {
  totalEvents: number;
  byType: Record<string, number>;
  byTool: Record<string, number>;
  subAgents: string[]; // Task tool_use 의 name 들
}
function computeMetrics(trace: TraceEventView[]): Metrics {
  const byType: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const subAgents: string[] = [];
  for (const ev of trace) {
    byType[ev.type] = (byType[ev.type] ?? 0) + 1;
    if (ev.type === "tool_use" && ev.name !== null) {
      byTool[ev.name] = (byTool[ev.name] ?? 0) + 1;
      if (ev.name === "Task") {
        // Task input 에 subagent_type 가 있을 수 있음 — best-effort 추출
        const input = ev.input as { subagent_type?: string; description?: string } | null;
        const sub = input?.subagent_type ?? input?.description ?? "Task";
        subAgents.push(sub);
      }
    }
  }
  return { totalEvents: trace.length, byType, byTool, subAgents };
}

function fmtMs(v: number) {
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b py-1.5 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="font-mono">{value}</span>
        {sub !== undefined && <span className="ml-1 text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

function DistRow({ label, items }: { label: string; items: [string, number][] }) {
  if (items.length === 0) {
    return (
      <div className="py-1.5 text-xs">
        <div className="text-muted-foreground">{label}</div>
        <div className="text-muted-foreground">—</div>
      </div>
    );
  }
  const max = Math.max(...items.map(([, c]) => c));
  return (
    <div className="space-y-1 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-20 truncate font-mono">{k}</span>
          <div className="relative h-3 flex-1 rounded bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded bg-primary/60"
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function FlowGraph({ selectedRunId }: Props) {
  const run = useRun(selectedRunId);
  const isRunning = run.data?.status === "running";
  const trace = useRunTrace(selectedRunId, isRunning);

  const flowNodes = useMemo<Node<TraceNodeData>[]>(() => {
    const events = trace.data ?? [];
    return events.map<Node<TraceNodeData>>((ev) => ({
      id: `ev:${String(ev.seq)}`,
      type: "trace",
      position: {
        x: TYPE_COLUMN[ev.type] ?? 0,
        y: ev.seq * ROW_HEIGHT,
      },
      data: { ev },
    }));
  }, [trace.data]);

  const flowEdges = useMemo<Edge[]>(() => {
    const events = trace.data ?? [];
    const out: Edge[] = [];
    for (let i = 0; i < events.length - 1; i += 1) {
      const a = events[i];
      const b = events[i + 1];
      if (a === undefined || b === undefined) continue;
      out.push({
        id: `e:${String(a.seq)}->${String(b.seq)}`,
        source: `ev:${String(a.seq)}`,
        target: `ev:${String(b.seq)}`,
        animated: isRunning && i === events.length - 2,
      });
    }
    return out;
  }, [trace.data, isRunning]);

  if (selectedRunId === null) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            title="run 을 선택하세요"
            hint="대시보드 탭의 ‘진행 중’ 또는 ‘최근 run’ 점을 클릭하거나, 실행/트레이스 탭의 run 리스트에서 고르면 그 run 의 trace 흐름이 여기 그래프로 펼쳐집니다."
          />
        </CardContent>
      </Card>
    );
  }
  if (run.isPending || trace.isPending) return <Loading label="run trace 로딩 중…" />;
  if (run.isError) return <InlineError error={run.error} />;
  if (trace.isError) return <InlineError error={trace.error} />;

  const traceData = trace.data ?? [];
  const metrics = computeMetrics(traceData);
  const r = run.data;
  const duration =
    r?.startedAt && r.finishedAt
      ? Date.parse(r.finishedAt) - Date.parse(r.startedAt)
      : r?.startedAt
        ? Date.now() - Date.parse(r.startedAt)
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-muted-foreground" />
            run trace 흐름
            <Badge variant="outline" className="ml-2 font-mono text-xs">
              {selectedRunId.slice(0, 8)}
            </Badge>
            <Badge
              className={
                r?.status === "succeeded"
                  ? "bg-success/20 text-success-foreground"
                  : r?.status === "failed"
                    ? "bg-destructive/20 text-destructive-foreground"
                    : r?.status === "running"
                      ? "bg-warning/20 text-warning-foreground"
                      : ""
              }
            >
              {r?.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {traceData.length === 0 ? (
            <div className="p-4">
              <EmptyState title="trace event 없음" hint="실행이 아직 시작 전이거나 데이터가 비어 있어요." />
            </div>
          ) : (
            <div style={{ height: 600 }}>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              상세 메트릭
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 pt-2">
            <MetricRow
              label="진행 시간"
              value={duration === null ? "—" : fmtMs(duration)}
              sub={isRunning ? "(진행 중)" : undefined}
            />
            <MetricRow
              label="프롬프트 토큰"
              value={r?.promptTokens === null || r === undefined ? "—" : r.promptTokens.toLocaleString()}
            />
            <MetricRow
              label="응답 토큰"
              value={
                r?.completionTokens === null || r === undefined
                  ? "—"
                  : r.completionTokens.toLocaleString()
              }
            />
            <MetricRow
              label="비용"
              value={r?.costUsd === null || r === undefined ? "—" : `$${r.costUsd.toFixed(4)}`}
            />
            <MetricRow label="trace event 총" value={String(metrics.totalEvents)} />
            <MetricRow label="thinking" value={String(metrics.byType.thinking ?? 0)} />
            <MetricRow
              label="sub-agent (Task)"
              value={String(metrics.subAgents.length)}
              sub={metrics.subAgents.length > 0 ? `→ ${metrics.subAgents.slice(0, 3).join(", ")}` : undefined}
            />
            {r?.error !== null && r?.error !== undefined && (
              <div className="mt-2 flex items-start gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                <span>{r.error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm">type 별 분포</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <DistRow label="" items={Object.entries(metrics.byType).sort((a, b) => b[1] - a[1])} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-sm">tool 호출 분포</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <DistRow label="" items={Object.entries(metrics.byTool).sort((a, b) => b[1] - a[1])} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
