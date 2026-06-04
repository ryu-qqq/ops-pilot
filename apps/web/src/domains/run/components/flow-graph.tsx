import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
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
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { EmptyState, InlineError, Loading } from "../../../lib/ui";
import { useTheme } from "../../../lib/use-theme";
import { Button } from "../../../components/ui/button";
import { useRun, useRunAnalysis, useRuns, useRunTrace, useStartAnalysis } from "../use-run";
import { isFeedbackPipelineRun, feedbackPipelinePhase } from "../lib/feedback-run";
import { nodeTypeToken } from "../lib/trace-node-token";
import type { TraceEventView } from "../api";

// OPSP-35 (b 재작성): 선택된 *1개 run* 의 trace event 흐름을 그래프로 +
// 그 run 의 상세 메트릭(시간·토큰·비용·type별·tool별·thinking·sub-agent) 카드.
// 사용자 의도: 무한 스크롤 트레이스 리스트를 *그래프*로 펼쳐 보고 싶다.

interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  // OPSP-37 (2): "실행" 탭 안에 들어갈 땐 RunList 가 run 선택을 담당 → 드롭다운 숨김.
  showRunSelect?: boolean;
}

// 색·라벨·컬럼은 trace-node-token 으로 추출(통합 그래프 언어 — 피드백 lineage 와 공유).
// 아이콘은 그래프 전용이라 여기 유지.
const TYPE_ICON: Record<string, React.ReactNode> = {
  assistant_text: <MessageSquare className="h-3 w-3" />,
  assistant_message: <MessageSquare className="h-3 w-3" />,
  thinking: <Brain className="h-3 w-3" />,
  tool_use: <Wrench className="h-3 w-3" />,
  tool_call: <Wrench className="h-3 w-3" />,
  tool_result: <Activity className="h-3 w-3" />,
  result: <Activity className="h-3 w-3" />,
  system: <Cog className="h-3 w-3" />,
  init: <Cog className="h-3 w-3" />,
  user_message: <MessageSquare className="h-3 w-3" />,
};

// OPSP-37 (4): 노드 세로 간격 — 압축/넉넉 토글.
const ROW_HEIGHT_LOOSE = 95;
const ROW_HEIGHT_COMPACT = 56;

interface TraceNodeData extends Record<string, unknown> {
  ev: TraceEventView;
}

function TraceEventNode({ data }: NodeProps<Node<TraceNodeData>>) {
  const ev = data.ev;
  const isTaskTool = (ev.type === "tool_use" || ev.type === "tool_call") && ev.name === "Task";
  const token = nodeTypeToken(ev.type);
  const cls = token.colorClass;
  const icon = TYPE_ICON[ev.type] ?? <FileText className="h-3 w-3" />;
  return (
    <div
      className={`min-w-[168px] rounded-md border-2 px-2 py-1.5 text-xs text-foreground shadow-sm ${cls} ${isTaskTool ? "ring-2 ring-purple/60" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-foreground/40" />
      <Handle type="source" position={Position.Bottom} className="!bg-foreground/40" />
      <div className="flex items-center gap-1 whitespace-nowrap">
        {icon}
        <span className="font-mono text-[10px] opacity-70">#{ev.seq}</span>
        <span className="font-mono text-[10px] opacity-80">{token.label}</span>
      </div>
      {ev.name !== null && (
        <div className={`max-w-[180px] truncate text-[11px] font-medium ${isTaskTool ? "text-purple-foreground" : ""}`}>
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
    // fixture(normalize)는 'tool_call', 실 local-claude는 'tool_use' — 둘 다 흡수.
    if ((ev.type === "tool_use" || ev.type === "tool_call") && ev.name !== null) {
      byTool[ev.name] = (byTool[ev.name] ?? 0) + 1;
      if (ev.name === "Task") {
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

export function FlowGraph({ selectedRunId, onSelectRun, showRunSelect = true }: Props) {
  const { theme } = useTheme();
  const runs = useRuns();
  const run = useRun(selectedRunId);
  const isRunning = run.data?.status === "running";
  const feedbackRun = isFeedbackPipelineRun(run.data?.retro);
  const feedbackPhase = feedbackPipelinePhase(run.data?.retro);
  const trace = useRunTrace(selectedRunId, isRunning);
  // OPSP-39: AI 분석 — 비동기 작업 + DB 캐시. 화면 이동해도 유실 X.
  const analysis = useRunAnalysis(selectedRunId);
  const startAnalysisMut = useStartAnalysis(selectedRunId ?? "");
  // OPSP-36 (2): 그래프 노드 클릭 → 우측 raw event 패널.
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  // OPSP-37 (4): 그래프가 길어 압축 토글 — 기본 압축.
  const [compact, setCompact] = useState(true);
  // OPSP-39: AI 분석 결과 모달.
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const flowNodes = useMemo<Node<TraceNodeData>[]>(() => {
    const events = trace.data ?? [];
    const rowHeight = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_LOOSE;
    return events.map<Node<TraceNodeData>>((ev, idx) => ({
      id: `ev:${String(ev.seq)}`,
      type: "trace",
      position: {
        x: nodeTypeToken(ev.type).column,
        y: idx * rowHeight,
      },
      data: { ev },
    }));
  }, [trace.data, compact]);

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

  // run select 바. "실행" 탭 안에선 RunList 가 담당 → showRunSelect=false 면 숨김.
  const runOptions = runs.data ?? [];
  const runSelectBar = !showRunSelect ? null : (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm text-muted-foreground">run 선택</span>
        <select
          value={selectedRunId ?? ""}
          onChange={(e) => {
            if (e.target.value !== "") {
              onSelectRun(e.target.value);
              setSelectedSeq(null);
            }
          }}
          className="min-w-[320px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— 선택 —</option>
          {runOptions.map((ro) => (
            <option key={ro.id} value={ro.id}>
              [{ro.status}] {ro.assetKind}/{ro.assetName} · {ro.scenarioName} ·{" "}
              {new Date(ro.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  );

  if (selectedRunId === null) {
    return (
      <div className="space-y-4">
        {runSelectBar}
        <Card>
          <CardContent className="p-4">
            <EmptyState
              title="run 을 선택하세요"
              hint="왼쪽 run 목록에서 고르거나, 작업 탭에서 evaluating 작업을 클릭하면 eval trace 흐름이 그래프로 열립니다."
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (run.isPending || trace.isPending) {
    return (
      <div className="space-y-4">
        {runSelectBar}
        <Loading label="run trace 로딩 중…" />
      </div>
    );
  }
  if (run.isError) return <InlineError error={run.error} />;
  if (trace.isError) return <InlineError error={trace.error} />;

  const traceData = trace.data ?? [];
  const metrics = computeMetrics(traceData);
  const analysisStatus = analysis.data?.status ?? "none";
  const r = run.data;
  const selectedEvent = traceData.find((e) => e.seq === selectedSeq) ?? null;
  const duration =
    r?.startedAt && r.finishedAt
      ? Date.parse(r.finishedAt) - Date.parse(r.startedAt)
      : r?.startedAt
        ? Date.now() - Date.parse(r.startedAt)
        : null;

  return (
    <div className="space-y-4">
      {runSelectBar}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setCompact((c) => !c)}
              title="노드 세로 간격 압축/넉넉 전환"
            >
              {compact ? "넉넉히 보기" : "압축 보기"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {traceData.length === 0 ? (
            <div className="p-4">
              <EmptyState title="trace event 없음" hint="실행이 아직 시작 전이거나 데이터가 비어 있어요." />
            </div>
          ) : (
            <div className="h-[640px] bg-background">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                colorMode={theme}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.2}
                maxZoom={2}
                zoomOnScroll
                zoomOnPinch
                panOnDrag
                panOnScroll={false}
                nodesDraggable
                nodesConnectable={false}
                onNodeClick={(_, node) => {
                  setSelectedSeq((node.data as TraceNodeData).ev.seq);
                }}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color={theme === "dark" ? "hsl(var(--muted-foreground) / 0.25)" : "hsl(var(--muted-foreground) / 0.35)"}
                />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* OPSP-39: AI 트레이스 분석 — harness 수동 eval 전용. feedback 파이프라인 run 은 JSON 파서가 결과를 뽑음. */}
        {feedbackRun ? (
          <Card className="border-muted">
            <CardHeader className="border-b">
              <CardTitle className="text-sm text-muted-foreground">
                AI 트레이스 분석 — feedback run 에서는 사용하지 않음
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 text-xs text-muted-foreground">
              이 run 은 ingest →{" "}
              {feedbackPhase === "review" ? "proposal-reviewer" : "work-evaluator"} 파이프라인입니다.
              proposal/review 결과는 마지막 JSON block 으로 자동 파싱되며, 「분석 실행」은 별도 Claude
              호출만 추가합니다 (proposal-reviewer 를 다시 돌리지 않음). 작업 탭에서 작업·개선안 을
              확인하세요.
            </CardContent>
          </Card>
        ) : (
        <Card className="border-purple/40">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-purple" />
              AI 트레이스 분석
              {analysisStatus === "done" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setAnalysisOpen(true)}
                >
                  결과 보기
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={analysisStatus === "done" ? "" : "ml-auto"}
                disabled={analysisStatus === "running" || traceData.length === 0 || startAnalysisMut.isPending}
                onClick={() => startAnalysisMut.mutate()}
              >
                {analysisStatus === "running" ? (
                  <Loading label="분석 중…" />
                ) : analysisStatus === "done" || analysisStatus === "failed" ? (
                  "다시 분석"
                ) : (
                  "분석 실행"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 text-xs">
            {startAnalysisMut.data?.started === false && (
              <p className="mb-1 text-warning">{startAnalysisMut.data.reason}</p>
            )}
            {analysisStatus === "none" && (
              <p className="text-muted-foreground">
                긴 trace 를 다 안 읽어도 됩니다 — AI 가 요약·주목 지점·분포 해석을 짚어줍니다. 실 토큰 호출,
                ~30초. 시작하면 화면을 옮겨도 백그라운드로 계속됩니다.
              </p>
            )}
            {analysisStatus === "running" && (
              <p className="text-muted-foreground">
                <Loading label="분석 중… 다른 화면으로 가도 백그라운드로 계속되고, 돌아오면 결과가 보입니다." />
              </p>
            )}
            {analysisStatus === "failed" && (
              <p className="text-destructive">
                분석 실패: {analysis.data?.error ?? "알 수 없는 오류"}
              </p>
            )}
            {analysisStatus === "done" && analysis.data?.result != null && (
              <div>
                <div className="text-muted-foreground">요약</div>
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words">
                  {analysis.data.result.summary}
                </p>
                <p className="mt-1 text-muted-foreground">
                  주목 지점 {analysis.data.result.highlights.length}건 · 평가 포인트{" "}
                  {analysis.data.result.evalPoints.length}건 — ‘결과 보기’로 전체 확인
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* OPSP-36: 노드 클릭 시 그 trace event 의 raw input/output */}
        {selectedEvent !== null && (
          <Card className="border-info/40">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-info" />
                event #{selectedEvent.seq} · {selectedEvent.type}
                {selectedEvent.name !== null && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {selectedEvent.name}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              <div>
                <div className="text-xs text-muted-foreground">input</div>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-2 font-mono text-[11px]">
                  {selectedEvent.input === null || selectedEvent.input === undefined
                    ? "(없음)"
                    : JSON.stringify(selectedEvent.input, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">output</div>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-2 font-mono text-[11px]">
                  {selectedEvent.output === null || selectedEvent.output === undefined
                    ? "(없음)"
                    : typeof selectedEvent.output === "string"
                      ? selectedEvent.output
                      : JSON.stringify(selectedEvent.output, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
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
              value={duration === null ? (isRunning ? "(시작 전)" : "—") : fmtMs(duration)}
              sub={isRunning && duration !== null ? "(진행 중)" : undefined}
            />
            <MetricRow
              label="프롬프트 토큰"
              value={
                r?.promptTokens === null || r === undefined
                  ? isRunning
                    ? "(집계 대기)"
                    : "—"
                  : r.promptTokens.toLocaleString()
              }
            />
            <MetricRow
              label="응답 토큰"
              value={
                r?.completionTokens === null || r === undefined
                  ? isRunning
                    ? "(집계 대기)"
                    : "—"
                  : r.completionTokens.toLocaleString()
              }
            />
            <MetricRow
              label="비용"
              value={
                r?.costUsd === null || r === undefined
                  ? isRunning
                    ? "(집계 대기)"
                    : "—"
                  : `$${r.costUsd.toFixed(4)}`
              }
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

      {/* OPSP-39: AI 분석 결과 모달 — 고정 크기 + 내부 스크롤 */}
      {analysisOpen && analysis.data?.result != null && (
        <Dialog open onOpenChange={(o) => !o && setAnalysisOpen(false)}>
          <DialogContent className="flex h-[78vh] max-w-3xl flex-col gap-0">
            <DialogHeader className="shrink-0 pb-3">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple" />
                AI 트레이스 분석 — {selectedRunId.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">요약</div>
                <p className="mt-0.5 whitespace-pre-wrap break-words">
                  {analysis.data.result.summary}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">주목 지점</div>
                <div className="mt-1 space-y-1">
                  {analysis.data.result.highlights.map((h, i) => (
                    <div
                      key={i}
                      className={`rounded-md border p-2 text-xs ${
                        h.severity === "critical"
                          ? "border-destructive/40 bg-destructive/5"
                          : h.severity === "warn"
                            ? "border-warning/40 bg-warning/5"
                            : "border-border bg-muted/30"
                      }`}
                    >
                      <span className="font-mono opacity-70">
                        {h.seq === null ? "—" : `#${String(h.seq)}`} · {h.severity}
                      </span>
                      <p className="mt-0.5 break-words">{h.note}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">분포 해석</div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs">
                  {analysis.data.result.distributionInsight}
                </p>
              </div>
              {analysis.data.result.evalPoints.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">평가 포인트</div>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
                    {analysis.data.result.evalPoints.map((p, i) => (
                      <li key={i} className="break-words">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
