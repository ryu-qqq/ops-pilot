import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronRight,
  ListTree,
  RefreshCw,
  Share2,
} from "lucide-react";
import type { Project } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
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
import { ingestStatusVariant, runStatusVariant, triggerVariant } from "../lib/badge-variant";
import { formatCommitMeta } from "../lib/commit-meta";
import { CommitDiffView } from "./commit-diff-view";

/**
 * 점진적 노출용 disclosure 섹션 — 기본 닫힘, 제목 클릭으로 토글. 의존성 추가 없이
 * useState + ▸/▾ 아이콘으로 구현(접근성 위해 button + aria-expanded). shadcn Card 톤 유지.
 */
function Disclosure({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-3 text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {title}
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </Card>
  );
}

/**
 * 트레이스 리스트 ⇄ 흐름 그래프 모드 전환만 담당. 펼침/접힘은 바깥 "실행 과정" Disclosure 가
 * 제어하므로 자체 open 토글은 두지 않는다(접힘 중첩 제거) — 펼치면 트레이스가 바로 보인다.
 */
function TraceSection({ runId, onOpenRun }: { runId: string; onOpenRun: (id: string) => void }) {
  const [mode, setMode] = useState<"list" | "graph">("list");

  return (
    <>
      <div className="flex w-fit rounded-md border p-0.5">
        <Button
          variant={mode === "list" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("list")}
        >
          <ListTree className="h-3.5 w-3.5" /> 트레이스 리스트
        </Button>
        <Button
          variant={mode === "graph" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("graph")}
        >
          <Share2 className="h-3.5 w-3.5" /> 흐름 그래프
        </Button>
      </div>
      {mode === "graph" ? (
        <FlowGraph selectedRunId={runId} onSelectRun={onOpenRun} showRunSelect={false} />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <TraceView runId={runId} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

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
  // 커밋 메타(날짜·저자) — 옛 ingest 는 context 에 없어 null → 줄 생략(graceful).
  const commitMeta = formatCommitMeta(
    data.contextJson.commitDate,
    data.contextJson.commitAuthor,
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> 목록
      </Button>

      {/* 커밋 헤더 + 상태·trigger 배지(의미별 컬러) */}
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ingestStatusVariant(data.status)}>{data.status}</Badge>
          <Badge variant={triggerVariant(data.trigger)}>{data.trigger}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {data.gitRef.slice(0, 12)}
          </span>
          {commitMeta !== null && (
            <span className="text-xs text-muted-foreground">{commitMeta}</span>
          )}
        </div>
      </div>

      {/* 핵심(항상 펼침): 판정 한 줄 — VerdictStrip 은 외부 컴포넌트라 wrapper div 가 투어 타겟. */}
      {evalRunId !== null && (
        <div data-tour="verdict">
          <VerdictStrip runId={evalRunId} />
        </div>
      )}

      {/* 핵심(항상 펼침): 처리 단계 — 진행(대기→평가중→리뷰중→검토됨)은 한눈에 봐야 의미. */}
      <IngestPipelineSteps data={data} />

      {/* 핵심(항상 펼침): 개선안 결정 큐 — "뭘 고치나"의 답 */}
      <section className="space-y-3" data-tour="proposals">
        <h3 className="text-sm font-semibold text-muted-foreground">
          개선안 ({data.proposals.length})
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
              commitDate: data.contextJson.commitDate ?? null,
              commitAuthor: data.contextJson.commitAuthor ?? null,
              gitRef: data.gitRef,
              evalRunId,
              reviewRunId,
              trigger: data.trigger,
            }}
            projectId={projectId}
            project={project}
            onOpenIngest={() => {
              /* 이미 이 작업 상세 안 — no-op */
            }}
          />
        ))}
      </section>

      {/* 심화(접힘): 평가 — GradePanel·HumanScore·RunRetro */}
      {evalRunId !== null && (
        <Disclosure title="평가">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <GradePanel runId={evalRunId} />
              <HumanScore runId={evalRunId} />
              <RunRetro runId={evalRunId} />
            </CardContent>
          </Card>
        </Disclosure>
      )}

      {/* 심화(접힘): 실행 과정 — 트레이스 리스트⇄그래프 (평가에서 분리) */}
      {evalRunId !== null && (
        <Disclosure title="실행 과정">
          <TraceSection runId={evalRunId} onOpenRun={onOpenRun} />
        </Disclosure>
      )}

      {/* 심화(접힘): 검토 — reviewSummary + review 트레이스 인라인(별도 화면 점프 제거) */}
      {reviewRunId !== null && (
        <Disclosure title="검토">
          {data.contextJson.reviewSummary !== undefined && (
            <p className="text-xs text-muted-foreground">{data.contextJson.reviewSummary}</p>
          )}
          <TraceSection runId={reviewRunId} onOpenRun={onOpenRun} />
        </Disclosure>
      )}

      {/* 심화(접힘): 파이프라인 액션 — eval/review 재처리·강제종료 (있을 때만 노출) */}
      {(showPipelineActions ||
        data.contextJson.evalError !== undefined ||
        data.contextJson.reviewError !== undefined ||
        showSkipReviewReason) && (
        <Disclosure title="파이프라인 액션">
          <section className="space-y-3">
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
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${reprocess.isPending ? "animate-spin" : ""}`}
                    />
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
        </Disclosure>
      )}

      {/* 심화(접힘): 변경 diff — 이 커밋(gitRef)이 실제로 바꾼 내용(diffSummary).
          평가 run의 worktree diff(DiffView)가 아니다 — work-evaluator는 채점만 해 항상 0건이었다. */}
      <Disclosure title="변경 diff">
        <CommitDiffView
          diffSummary={data.diffSummary}
          truncated={data.contextJson.diffTruncated ?? false}
        />
      </Disclosure>
    </div>
  );
}

interface RunProps {
  runId: string;
  onBack: () => void;
  /** eval/review run 으로 점프(트레이스 그래프 노드 선택 등). */
  onOpenRun: (id: string) => void;
}

/** 수동 실행 run 의 상세: 판정 → 평가 → 실행 과정 → 변경 diff. (ingest 서사 아님 → 검토·처리단계·개선안 없음) */
export function WorkDetailRun({ runId, onBack, onOpenRun }: RunProps) {
  // NOTE: useRun 은 base Run 스키마를 반환한다 — assetName/assetKind/scenarioName 은
  // 목록(RunListItem)에만 있고 단건엔 없다. 단건 진입(props 에 projectId 없음)에서
  // 목록을 불러와 find 하는 건 과하므로 헤더는 Run 에 실존하는 필드(runner·model)로만 채운다.
  const { data: run } = useRun(runId);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> 목록
      </Button>

      {/* 실행 헤더 + 상태 배지(컬러) */}
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">수동 실행</h2>
        <div className="flex flex-wrap items-center gap-2">
          {run != null && <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>}
          <span className="font-mono text-xs text-muted-foreground">
            {run != null ? (
              <>
                {run.runner}
                {run.model != null && ` · ${run.model}`}
              </>
            ) : (
              runId.slice(0, 8)
            )}
          </span>
        </div>
      </div>

      {/* 핵심(항상 펼침): 판정 */}
      <VerdictStrip runId={runId} />

      {/* 심화(접힘): 평가 */}
      <Disclosure title="평가">
        <Card>
          <CardContent className="space-y-3 pt-4">
            <GradePanel runId={runId} />
            <HumanScore runId={runId} />
            <RunRetro runId={runId} />
          </CardContent>
        </Card>
      </Disclosure>

      {/* 심화(접힘): 실행 과정 — 트레이스 리스트⇄그래프 */}
      <Disclosure title="실행 과정">
        <TraceSection runId={runId} onOpenRun={onOpenRun} />
      </Disclosure>

      {/* 심화(접힘): 변경 diff */}
      <Disclosure title="변경 diff">
        <DiffView runId={runId} />
      </Disclosure>
    </div>
  );
}
