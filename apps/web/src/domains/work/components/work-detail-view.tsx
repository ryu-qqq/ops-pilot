import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, FileDiff, ListTree, RefreshCw, Share2 } from "lucide-react";
import type { Project } from "@opspilot/shared-types";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import { ErrorNotice, Loading } from "../../../lib/ui";
import { ProposalCard } from "../../feedback/components/proposal-card";
import { IngestPipelineSteps } from "../../feedback/components/ingest-pipeline-steps";
import { feedbackKeys } from "../../feedback/api";
import {
  useIngestDetail,
  useReprocessIngest,
  useReprocessReviewIngest,
  useReviewIngest,
} from "../../feedback/use-feedback";
import { useCancelRun, useRun } from "../../run/use-run";
import { DiffView } from "../../run/components/diff-view";
import { FlowGraph } from "../../run/components/flow-graph";
import { GradePanel } from "../../run/components/grade-panel";
import { HumanScore } from "../../run/components/human-score";
import { RunRetro } from "../../run/components/run-retro";
import { TraceView } from "../../run/components/trace-view";
import { VerdictStrip } from "../../run/components/verdict-strip";

interface IngestProps {
  ingestId: string;
  projectId: string;
  project: Project;
  onBack: () => void;
  /** 수동 run 작업으로 점프(드릴다운 내 전환) — eval/review 트레이스 진입. */
  onOpenRun: (runId: string) => void;
}

/** ingest 작업의 세로 서사: 커밋 헤더 → 판정 → ① 평가 → ② 검토 → ③ 개선안 → ④ diff. */
export function WorkDetailIngest({
  ingestId,
  projectId,
  project,
  onBack,
  onOpenRun,
}: IngestProps) {
  const { data, isPending, isError, error } = useIngestDetail(ingestId);
  const reprocess = useReprocessIngest(ingestId, projectId);
  const review = useReviewIngest(ingestId, projectId);
  const reprocessReview = useReprocessReviewIngest(ingestId, projectId);
  const cancelEval = useCancelRun();
  const qc = useQueryClient();
  const [traceMode, setTraceMode] = useState<"list" | "graph">("list");
  const [traceOpen, setTraceOpen] = useState(false);

  if (isPending) return <Loading label="작업 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (!data) return null;

  // ingest context 의 run id 는 optional → null 로 정규화 후 가드.
  const evalRunId = data.contextJson.evalRunId ?? null;
  const reviewRunId = data.contextJson.reviewRunId ?? null;

  // 파이프라인 액션 표시 조건(기존 IngestDrilldownContent 그대로 보존).
  const showReprocess =
    data.status === "evaluating" ||
    (data.status === "failed" &&
      data.contextJson.evalError !== undefined &&
      evalRunId !== null);
  const showReviewRetry = data.contextJson.reviewError !== undefined && reviewRunId !== null;
  const showManualReview =
    data.status === "done" && data.proposals.some((p) => p.status === "draft");
  const showCancelEval = data.status === "evaluating" && evalRunId !== null;
  const showSkipReviewReason =
    data.contextJson.skipReviewReason !== undefined &&
    data.contextJson.reviewError === undefined &&
    data.status !== "reviewing" &&
    data.status !== "reviewed";
  const showPipelineActions =
    showReprocess || showReviewRetry || showManualReview || showCancelEval;
  const commitSubject =
    data.contextJson.commitSubject != null && data.contextJson.commitSubject.trim() !== ""
      ? data.contextJson.commitSubject
      : null;
  const title = commitSubject ?? `commit ${data.gitRef.slice(0, 8)}`;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> 목록
      </Button>

      {/* 커밋 헤더 */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {data.gitRef.slice(0, 12)} · {data.trigger}
        </p>
      </div>

      {/* 판정 한 줄 + 파이프라인 단계 */}
      {evalRunId !== null && <VerdictStrip runId={evalRunId} />}
      <IngestPipelineSteps data={data} />

      {/* ① 평가 */}
      {evalRunId !== null && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">① 평가</h3>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <GradePanel runId={evalRunId} />
              <HumanScore runId={evalRunId} />
              <RunRetro runId={evalRunId} />
            </CardContent>
          </Card>
          {/* 트레이스 리스트 ⇄ 흐름 그래프 인라인 펼침 */}
          <div className="flex w-fit rounded-md border p-0.5">
            <Button
              variant={traceMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setTraceMode("list");
                setTraceOpen(true);
              }}
            >
              <ListTree className="h-3.5 w-3.5" /> 트레이스 리스트
            </Button>
            <Button
              variant={traceMode === "graph" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setTraceMode("graph");
                setTraceOpen(true);
              }}
            >
              <Share2 className="h-3.5 w-3.5" /> 흐름 그래프
            </Button>
          </div>
          {traceOpen &&
            (traceMode === "graph" ? (
              <FlowGraph selectedRunId={evalRunId} onSelectRun={onOpenRun} showRunSelect={false} />
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <TraceView runId={evalRunId} />
                </CardContent>
              </Card>
            ))}
        </section>
      )}

      {/* ② 검토 */}
      {reviewRunId !== null && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">② 검토</h3>
          {data.contextJson.reviewSummary !== undefined && (
            <p className="text-xs text-muted-foreground">{data.contextJson.reviewSummary}</p>
          )}
          <Button size="sm" variant="outline" onClick={() => onOpenRun(reviewRunId)}>
            <Share2 className="h-3.5 w-3.5" /> review 트레이스
          </Button>
        </section>
      )}

      {/* 파이프라인 액션 — eval/review 재처리·강제종료 (기존 IngestDrilldownContent 보존) */}
      {(showPipelineActions ||
        data.contextJson.evalError !== undefined ||
        data.contextJson.reviewError !== undefined ||
        showSkipReviewReason) && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">파이프라인 액션</h3>
          {data.contextJson.evalError !== undefined && (
            <p className="text-destructive text-xs">{data.contextJson.evalError}</p>
          )}
          {data.contextJson.reviewError !== undefined && (
            <p className="text-destructive text-xs">{data.contextJson.reviewError}</p>
          )}
          {showSkipReviewReason && (
            <p className="text-xs text-warning">{data.contextJson.skipReviewReason}</p>
          )}
          {showPipelineActions && (
            <div className="flex flex-wrap gap-2">
              {showCancelEval && evalRunId !== null && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={cancelEval.isPending}
                  onClick={() =>
                    cancelEval.mutate(evalRunId, {
                      onSuccess: () => {
                        void qc.invalidateQueries({ queryKey: feedbackKeys.detail(ingestId) });
                        void qc.invalidateQueries({ queryKey: feedbackKeys.list(projectId) });
                      },
                    })
                  }
                  title="멈춘 eval run을 failed로 마킹 — 이후 eval 재처리 또는 ingest 재생성"
                >
                  <Ban className={`h-3.5 w-3.5 ${cancelEval.isPending ? "animate-pulse" : ""}`} />
                  eval 강제 종료
                </Button>
              )}
              {showReprocess && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprocess.isPending}
                  onClick={() => reprocess.mutate()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reprocess.isPending ? "animate-spin" : ""}`} />
                  eval 재처리
                </Button>
              )}
              {showManualReview && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${review.isPending ? "animate-spin" : ""}`} />
                  review 시작
                </Button>
              )}
              {showReviewRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprocessReview.isPending}
                  onClick={() => reprocessReview.mutate()}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${reprocessReview.isPending ? "animate-spin" : ""}`}
                  />
                  review 재처리
                </Button>
              )}
            </div>
          )}
          {(reprocess.isError || review.isError || reprocessReview.isError) && (
            <ErrorNotice error={reprocess.error ?? review.error ?? reprocessReview.error} />
          )}
        </section>
      )}

      {/* ③ 개선안 결정 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          ③ 개선안 ({data.proposals.length})
        </h3>
        {data.proposals.length === 0 && (
          <p className="text-sm text-muted-foreground">개선안이 없습니다.</p>
        )}
        {data.proposals.map((p) => (
          <ProposalCard
            key={p.id}
            // useIngestDetail 의 proposal 은 ImprovementProposal → ingest context 로 출처 필드를 채워
            // ProposalWithSource 로 만든다.
            proposal={{
              ...p,
              commitSubject,
              gitRef: data.gitRef,
              evalRunId,
              reviewRunId,
              trigger: data.trigger,
            }}
            projectId={projectId}
            project={project}
            onOpenEvalRun={onOpenRun}
            onOpenIngest={() => {
              /* 이미 이 작업 상세 안 — no-op */
            }}
          />
        ))}
      </section>

      {/* ④ 변경 diff */}
      {evalRunId !== null && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">④ 변경 diff</h3>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FileDiff className="h-3.5 w-3.5" /> 변경 보기
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl">
              <DialogHeader>
                <DialogTitle>변경 (파일 diff)</DialogTitle>
              </DialogHeader>
              <DiffView runId={evalRunId} />
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}

interface RunProps {
  runId: string;
  onBack: () => void;
  /** eval/review run 으로 점프(트레이스 그래프 노드 선택 등). */
  onOpenRun: (id: string) => void;
}

/** 수동 실행 run 의 상세: 판정 → ① 평가 → ④ diff. (ingest 서사 아님 → ② 검토·③ 개선안 없음) */
export function WorkDetailRun({ runId, onBack, onOpenRun }: RunProps) {
  // NOTE: useRun 은 base Run 스키마를 반환한다 — assetName/assetKind/scenarioName 은
  // 목록(RunListItem)에만 있고 단건엔 없다. 단건 진입(props 에 projectId 없음)에서
  // 목록을 불러와 find 하는 건 과하므로 헤더는 Run 에 실존하는 필드(runner·model)로만 채운다.
  const { data: run } = useRun(runId);
  const [traceMode, setTraceMode] = useState<"list" | "graph">("list");
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> 목록
      </Button>

      {/* 실행 헤더 */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">수동 실행</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {run != null ? (
            <>
              {run.runner}
              {run.model != null && ` · ${run.model}`}
              {` · ${run.status}`}
            </>
          ) : (
            runId.slice(0, 8)
          )}
        </p>
      </div>

      <VerdictStrip runId={runId} />

      {/* ① 평가 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">① 평가</h3>
        <Card>
          <CardContent className="space-y-3 pt-4">
            <GradePanel runId={runId} />
            <HumanScore runId={runId} />
            <RunRetro runId={runId} />
          </CardContent>
        </Card>
        {/* 트레이스 리스트 ⇄ 흐름 그래프 인라인 펼침 */}
        <div className="flex w-fit rounded-md border p-0.5">
          <Button
            variant={traceMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setTraceMode("list");
              setTraceOpen(true);
            }}
          >
            <ListTree className="h-3.5 w-3.5" /> 트레이스 리스트
          </Button>
          <Button
            variant={traceMode === "graph" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setTraceMode("graph");
              setTraceOpen(true);
            }}
          >
            <Share2 className="h-3.5 w-3.5" /> 흐름 그래프
          </Button>
        </div>
        {traceOpen &&
          (traceMode === "graph" ? (
            <FlowGraph selectedRunId={runId} onSelectRun={onOpenRun} showRunSelect={false} />
          ) : (
            <Card>
              <CardContent className="pt-4">
                <TraceView runId={runId} />
              </CardContent>
            </Card>
          ))}
      </section>

      {/* ④ 변경 diff */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">④ 변경 diff</h3>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <FileDiff className="h-3.5 w-3.5" /> 변경 보기
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>변경 (파일 diff)</DialogTitle>
            </DialogHeader>
            <DiffView runId={runId} />
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
