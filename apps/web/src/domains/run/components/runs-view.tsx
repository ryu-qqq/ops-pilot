import { FileDiff, GitCompare, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { ComparisonView } from "./comparison-view";
import { DiffView } from "./diff-view";
import { RunList } from "./run-list";
import { TraceView } from "./trace-view";
import { ScenarioPanel } from "./scenario-panel";
import { HumanScore } from "./human-score";
import { InfoMark } from "../../../lib/ui";

interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  compareRunIds: string[];
  onClearCompare: () => void;
}

export function RunsView({ selectedRunId, onSelectRun, compareRunIds, onClearCompare }: Props) {
  const compareActive = compareRunIds.length >= 2;
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">실행 (run)</h2>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} />
      </Card>
      <div className="space-y-4">
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

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between border-b pb-3">
            <CardTitle className="text-base">트레이스 — 왜 그렇게 행동했나</CardTitle>
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
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <ScenarioPanel runId={selectedRunId} />
            <HumanScore runId={selectedRunId} />
            <TraceView runId={selectedRunId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
