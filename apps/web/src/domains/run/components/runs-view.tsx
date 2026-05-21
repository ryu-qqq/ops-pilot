import { FileDiff, GitCompare, ListTree, Repeat, Share2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { FlowGraph } from "../../dashboard/components/flow-graph";
import { BenchmarkSummary } from "./benchmark-summary";
import { ComparisonView } from "./comparison-view";
import { DiffView } from "./diff-view";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";
import { ScenarioPanel } from "./scenario-panel";
import { HumanScore } from "./human-score";
import { InfoMark } from "../../../lib/ui";

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
}: Props) {
  const compareActive = compareRunIds.length >= 2;
  const benchmarkActive = benchmarkRunIds.length >= 1;
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">실행 (run)</h2>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} />
      </Card>
      <div className="space-y-4">
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

        {/* OPSP-37 (2): 트레이스 리스트 ⇄ 흐름 그래프 뷰 토글 + 변경 보기 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5">
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
          {selectedRunId !== null && (
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
          )}
        </div>

        {viewMode === "graph" ? (
          <FlowGraph
            selectedRunId={selectedRunId}
            onSelectRun={onSelectRun}
            showRunSelect={false}
          />
        ) : (
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">트레이스 — 왜 그렇게 행동했나</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <ScenarioPanel runId={selectedRunId} />
              <HumanScore runId={selectedRunId} />
              <TraceView runId={selectedRunId} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
