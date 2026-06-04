import { Ban, FileDiff, GitCompare, ListTree, Repeat, RotateCw, Share2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { FlowGraph } from "./flow-graph";
import { BenchmarkSummary } from "./benchmark-summary";
import { ComparisonView } from "./comparison-view";
import { DiffView } from "./diff-view";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";
import { ScenarioPanel } from "./scenario-panel";
import { GradePanel } from "./grade-panel";
import { HumanScore } from "./human-score";
import { RunRetro } from "./run-retro";
import { VerdictStrip } from "./verdict-strip";
import { InfoMark } from "../../../lib/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useProjects } from "../../project/use-project";
import { useCancelRun, useRerunRun, useRun } from "../use-run";
import { useState } from "react";

export type RunViewMode = "list" | "graph";

interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  compareRunIds: string[];
  onClearCompare: () => void;
  benchmarkRunIds: string[];
  onClearBenchmark: () => void;
  viewMode: RunViewMode;
  onViewModeChange: (m: RunViewMode) => void;
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
}

export function RunsView({
  selectedRunId,
  onSelectRun,
  compareRunIds,
  onClearCompare,
  benchmarkRunIds,
  onClearBenchmark,
  viewMode,
  onViewModeChange,
  projectId,
  onProjectIdChange,
}: Props) {
  const [detailTab, setDetailTab] = useState<"trace" | "eval" | "scenario">("trace");
  const compareActive = compareRunIds.length >= 2;
  const benchmarkActive = benchmarkRunIds.length >= 1;
  const rerun = useRerunRun();
  const cancel = useCancelRun();
  const { data: selectedRun } = useRun(selectedRunId);
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="p-4 space-y-3">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">실행 (run)</h2>
          <RunProjectFilter value={projectId} onChange={onProjectIdChange} />
        </div>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} projectId={projectId} />
      </Card>
      <div className="space-y-4">
        {/* 관측소 (1)+(2): 판정 한 줄 + 출처 브레드크럼 — 모든 카드보다 위 */}
        {selectedRunId !== null && <VerdictStrip runId={selectedRunId} />}

        {benchmarkActive && (
          <Card className="border-purple/40">
            <CardHeader className="flex flex-row items-baseline justify-between border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Repeat className="h-4 w-4 text-purple" />
                {benchmarkRunIds.length === 1
                  ? "단일 실행 (벤치마크 N=1)"
                  : `벤치마크 (${String(benchmarkRunIds.length)}회 run)`}
                <InfoMark
                  label="벤치마크 N회"
                  help="같은 (자산버전 × 시나리오) 를 N회 돌린 결과. N=1은 단일 실행과 동일 (분산 측정 안 됨, σ=0). 개별 run 클릭하면 그 트레이스로 이동."
                />
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onClearBenchmark}>
                <X className="h-3.5 w-3.5" />
                닫기
              </Button>
            </CardHeader>
            <CardContent className="pt-3">
              <BenchmarkSummary runIds={benchmarkRunIds} onSelectRun={onSelectRun} />
            </CardContent>
          </Card>
        )}

        {compareActive && (
          <Card className="border-primary/40">
            <CardHeader className="flex flex-row items-baseline justify-between border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GitCompare className="h-4 w-4" />
                버전 비교 ({compareRunIds.length}개 run)
                <InfoMark
                  label="버전 비교"
                  help="같은 시나리오로 N개 버전을 한 번에 돌린 결과. 컬럼 헤더 클릭하면 그 run 의 트레이스로 이동."
                />
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onClearCompare}>
                <X className="h-3.5 w-3.5" />
                닫기
              </Button>
            </CardHeader>
            <CardContent className="pt-3">
              <ComparisonView runIds={compareRunIds} onSelectRun={onSelectRun} />
            </CardContent>
          </Card>
        )}

        {/* 액션: 변경 보기 · 강제 종료 · 다시 실행 (탭 위에 고정) */}
        {selectedRunId !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileDiff className="h-3.5 w-3.5" />
                  변경 보기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl">
                <DialogHeader>
                  <DialogTitle>변경 (파일 diff)</DialogTitle>
                </DialogHeader>
                <DiffView runId={selectedRunId} />
              </DialogContent>
            </Dialog>
            {selectedRun?.status === "running" && (
              <Button
                variant="destructive"
                size="sm"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(selectedRunId)}
                title="running/pending run을 failed로 마킹 (좀비·멈춘 eval 정리)"
              >
                <Ban className={`h-3.5 w-3.5 ${cancel.isPending ? "animate-pulse" : ""}`} />
                강제 종료
              </Button>
            )}
            {/* OPSP-38 follow-up: 다시 실행 — run 액션이라 뷰 무관 위치로 */}
            <Button
              variant="outline"
              size="sm"
              disabled={rerun.isPending || selectedRun?.status === "running"}
              onClick={() =>
                rerun.mutate(selectedRunId, {
                  onSuccess: (newRun) => onSelectRun(newRun.id),
                })
              }
              title="같은 자산버전·시나리오·소스로 새 run 시작 (feedback ingest 연결 retro 유지)"
            >
              <RotateCw className={`h-3.5 w-3.5 ${rerun.isPending ? "animate-spin" : ""}`} />
              다시 실행
            </Button>
          </div>
        )}

        {selectedRunId !== null && (
          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as typeof detailTab)}
            className="space-y-3"
          >
            <TabsList className="flex w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="trace">트레이스</TabsTrigger>
              <TabsTrigger value="eval">평가</TabsTrigger>
              <TabsTrigger value="scenario">시나리오</TabsTrigger>
            </TabsList>

            <TabsContent value="trace" className="mt-0 space-y-3">
              {/* OPSP-37 (2): 트레이스 리스트 ⇄ 흐름 그래프 토글 — 트레이스 탭 안 */}
              <div className="flex w-fit rounded-md border p-0.5">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onViewModeChange("list")}
                >
                  <ListTree className="h-3.5 w-3.5" />
                  트레이스 리스트
                </Button>
                <Button
                  variant={viewMode === "graph" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onViewModeChange("graph")}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  흐름 그래프
                </Button>
              </div>
              {viewMode === "graph" ? (
                <FlowGraph
                  selectedRunId={selectedRunId}
                  onSelectRun={onSelectRun}
                  showRunSelect={false}
                />
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    <TraceView runId={selectedRunId} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="eval" className="mt-0 space-y-3">
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <GradePanel runId={selectedRunId} />
                  <HumanScore runId={selectedRunId} />
                  <RunRetro runId={selectedRunId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scenario" className="mt-0 space-y-3">
              <Card>
                <CardContent className="pt-4">
                  <ScenarioPanel runId={selectedRunId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function RunProjectFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: projects } = useProjects();
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="프로젝트 전체" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">프로젝트 전체</SelectItem>
        {(projects ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
