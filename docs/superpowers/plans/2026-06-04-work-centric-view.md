# 작업 중심 통합 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드백 탭과 실행/트레이스 탭을 "작업" 한 탭으로 통합해, 한 작업(ingest)의 평가→개선안→결정 서사를 드릴다운 전체폭 한 화면에서 본다.

**Architecture:** 신규 `work` 도메인에 통합 목록(`WorkListView`)과 드릴다운 상세(`WorkDetailView`) 두 뷰를 만든다. 백엔드 API·기존 hook은 그대로 재사용하고, 기존 상세 컴포넌트(`VerdictStrip`·`GradePanel`·`TraceView`·`DiffView`·`ProposalCard` 등)를 서사 안에 재배치한다. ingest와 수동 실행 run을 통합 `WorkItem` 모델로 머지(순수함수)해 목록을 구성한다. 마지막에 app.tsx를 3탭으로 교체하고 옛 두 뷰를 제거한다.

**Tech Stack:** Vite + React + TypeScript, TanStack Query(Query Key Factory), shadcn UI 패턴, `@opspilot/shared-types`(Zod). 검증: `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build` · Playwright MCP 실연동.

**검증 전략(중요):** web에는 단위 테스트 인프라(vitest)가 **없다**(server만 보유). CLAUDE.md "의존성 최소" 원칙에 따라 web에 테스트 러너를 신설하지 않는다. 따라서 각 task는 **typecheck/lint/build**로 타입·빌드 안전을 확인하고, 동작은 **Playwright 실연동**(자동 ingest로 채워진 terraform-modules 실데이터)으로 검증한다. 순수 로직(`mergeWorkItems`)은 부수효과 없는 순수함수로 분리해 타입과 Playwright로 간접 검증한다. (단위 테스트가 없다는 한계는 의도된 정책이며, 이 plan은 그것을 우회하지 않는다.)

**브랜치:** `feat/work-centric-view` (이미 생성, 새 main 기반). 모든 커밋은 한국어 메시지 + 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## 파일 구조

생성:
- `apps/web/src/domains/feedback/components/proposal-card.tsx` — feedback-view 내부의 `ProposalCard`·`ProposalDetailDialog`를 추출·export (Task 1)
- `apps/web/src/domains/work/types.ts` — `WorkItem`·`WorkGroups` 통합 모델 (Task 2)
- `apps/web/src/domains/work/lib/merge-work-items.ts` — ingest[]·run[]·proposals[] → `WorkGroups` 순수함수 (Task 5)
- `apps/web/src/domains/work/components/work-detail-view.tsx` — 드릴다운 상세 서사 (Task 3·4)
- `apps/web/src/domains/work/components/work-list-view.tsx` — 통합 목록 + 드릴다운 토글 (Task 6)

수정:
- `apps/web/src/domains/feedback/components/feedback-view.tsx` — 추출된 `ProposalCard` import로 교체 (Task 1)
- `apps/web/src/app.tsx` — 4탭 → 3탭, 핸들러 라우팅, 영속키 폴백 (Task 7)

제거(Task 8):
- `apps/web/src/domains/run/components/runs-view.tsx`
- `apps/web/src/domains/feedback/components/feedback-view.tsx` (목록·드릴다운 로직은 work로 이전 완료 후)

재사용(수정 없음): `verdict-strip.tsx`·`grade-panel.tsx`·`human-score.tsx`·`run-retro.tsx`·`trace-view.tsx`·`flow-graph.tsx`·`diff-view.tsx`·`scenario-panel.tsx`(run), `ingest-lineage.tsx`·`ingest-pipeline-steps.tsx`·`trigger-badge.tsx`·`post-apply-banner.tsx`(feedback). hook: `useRun`·`useRuns`·`useRunTrace`·`useRunDiff`·`useScores`·`useCancelRun`·`useRerunRun`(run), `useIngests`·`useIngestDetail`·`useProjectProposals`·`useAutoIngestConfig`·`useApproveProposal`·`useRejectProposal`·`useApplyProposal`·`useReprocessIngest`·`useReviewIngest`·`useReprocessReviewIngest`(feedback).

---

## Phase 1 — 선행 추출 + 상세 서사

### Task 1: ProposalCard 추출 (동작 불변 리팩터)

`WorkDetailView`가 개선안 결정 UI를 재사용하려면 `ProposalCard`(+그 의존 `ProposalDetailDialog`)가 export돼야 한다. 현재 둘 다 `feedback-view.tsx` 내부 비-export 함수다.

**Files:**
- Create: `apps/web/src/domains/feedback/components/proposal-card.tsx`
- Modify: `apps/web/src/domains/feedback/components/feedback-view.tsx`

- [ ] **Step 1: proposal-card.tsx 생성**

`feedback-view.tsx`의 `proposalVariant` 상수, `shortRef` 함수, `ProposalDetailDialog` 컴포넌트, `ProposalCard` 컴포넌트(라인 47-61, 80-82, 84-150, 152-309 해당 블록)를 그대로 잘라 새 파일로 옮긴다. import는 옮긴 코드가 쓰는 것만 가져온다:

```tsx
import { type ReactNode } from "react";
import { Check, Expand, FileCode, Share2, X } from "lucide-react";
import type { ImprovementProposal, Project, ProposalReviewMeta, ProposalWithSource } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { ErrorNotice, Loading } from "../../../lib/ui";
import { useApplyProposal, useApproveProposal, useRejectProposal } from "../use-feedback";
import { PostApplyBanner } from "./post-apply-banner";
import { TriggerBadge } from "./trigger-badge";

export const proposalVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  draft: "secondary", approved: "warning", applied: "success", rejected: "destructive",
};
function shortRef(ref: string): string { return ref.slice(0, 8); }
// ... ProposalDetailDialog (export), ProposalCard (export) — feedback-view 원본 그대로
export { ProposalDetailDialog };
```

`ProposalCard`와 `ProposalDetailDialog`에 `export` 키워드를 붙인다. 시그니처(props)는 원본과 동일하게 유지: `ProposalCard({ proposal, projectId, project, onOpenEvalRun, onOpenIngest })`.

- [ ] **Step 2: feedback-view.tsx에서 옮긴 블록 제거 + import 교체**

`feedback-view.tsx`에서 `proposalVariant`(라인 56-61)·`shortRef`·`ProposalDetailDialog`·`ProposalCard` 정의 블록을 삭제하고, 상단에 추가:

```tsx
import { ProposalCard } from "./proposal-card";
```

`feedback-view.tsx`에서 더 이상 안 쓰는 import(Check·Expand·FileCode·X·Layers 등 ProposalCard로 빠진 것들)는 제거한다. `statusVariant`·`decisionFilters`·`flowStages`·`AutoIngestStatusChip`·`PipelineFlowBand`·`IngestDrilldownContent`·`FeedbackView`는 남긴다.

- [ ] **Step 3: 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 전부 통과(에러 0). 피드백 탭 동작은 불변(같은 컴포넌트, 위치만 이동).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/domains/feedback/components/proposal-card.tsx apps/web/src/domains/feedback/components/feedback-view.tsx
git commit -m "refactor(web): ProposalCard 를 별도 파일로 추출·export (통합뷰 재사용 준비)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2: work 도메인 + WorkItem 타입

**Files:**
- Create: `apps/web/src/domains/work/types.ts`

- [ ] **Step 1: 통합 모델 정의**

```ts
import type { IngestBundle, Run } from "@opspilot/shared-types";

/** 작업 통합 모델 — Cursor 작업(ingest) 또는 수동 실행(run) 한 건. */
export type WorkItem =
  | { kind: "ingest"; id: string; ingest: IngestBundle; proposalCount: number }
  | { kind: "run"; id: string; run: Run };

/** 작업 목록 그룹 — Cursor 작업 섹션 / 수동 실행 섹션. */
export interface WorkGroups {
  cursor: WorkItem[]; // ingest (trigger auto|manual)
  manual: WorkItem[]; // registry 직접 실행·벤치마크 run
}

/** 드릴다운 선택 키 — kind + id. null 이면 목록 화면. */
export type WorkSelection = { kind: "ingest" | "run"; id: string } | null;
```

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck`
Expected: 통과(타입만 추가).

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/work/types.ts
git commit -m "feat(web): work 도메인 WorkItem 통합 모델 타입

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: WorkDetailView — ingest 작업 서사

한 ingest의 세로 서사: 커밋 헤더 → ①평가 → ②검토 → ③개선안 → ④diff. 기존 컴포넌트를 재배치한다.

**Files:**
- Create: `apps/web/src/domains/work/components/work-detail-view.tsx`

- [ ] **Step 1: 컴포넌트 작성 (ingest 모드)**

```tsx
import { useState } from "react";
import { ArrowLeft, FileDiff, ListTree, Share2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { ErrorNotice, Loading } from "../../../lib/ui";
import { useIngestDetail } from "../../feedback/use-feedback";
import { ProposalCard } from "../../feedback/components/proposal-card";
import { IngestPipelineSteps } from "../../feedback/components/ingest-pipeline-steps";
import { VerdictStrip } from "../../run/components/verdict-strip";
import { GradePanel } from "../../run/components/grade-panel";
import { HumanScore } from "../../run/components/human-score";
import { RunRetro } from "../../run/components/run-retro";
import { TraceView } from "../../run/components/trace-view";
import { FlowGraph } from "../../run/components/flow-graph";
import { DiffView } from "../../run/components/diff-view";
import type { Project } from "@opspilot/shared-types";

interface Props {
  ingestId: string;
  projectId: string;
  project: Project;
  onBack: () => void;
  onOpenRun: (runId: string) => void; // 수동 run 작업으로 점프(드릴다운 내 전환)
}

export function WorkDetailIngest({ ingestId, projectId, project, onBack, onOpenRun }: Props) {
  const { data, isPending, isError, error } = useIngestDetail(ingestId);
  const [traceMode, setTraceMode] = useState<"list" | "graph">("list");
  const [traceOpen, setTraceOpen] = useState(false);

  if (isPending) return <Loading label="작업 불러오는 중…" />;
  if (isError) return <ErrorNotice error={error} />;
  if (!data) return null;

  const evalRunId = data.contextJson.evalRunId ?? null;
  const reviewRunId = data.contextJson.reviewRunId ?? null;
  const title =
    data.contextJson.commitSubject != null && data.contextJson.commitSubject.trim() !== ""
      ? data.contextJson.commitSubject
      : `commit ${data.gitRef.slice(0, 8)}`;

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
          <Card><CardContent className="space-y-3 pt-4">
            <GradePanel runId={evalRunId} />
            <HumanScore runId={evalRunId} />
            <RunRetro runId={evalRunId} />
          </CardContent></Card>
          {/* 트레이스 인라인 펼침 */}
          <div className="flex w-fit rounded-md border p-0.5">
            <Button variant={traceMode === "list" ? "default" : "ghost"} size="sm" onClick={() => { setTraceMode("list"); setTraceOpen(true); }}>
              <ListTree className="h-3.5 w-3.5" /> 트레이스 리스트
            </Button>
            <Button variant={traceMode === "graph" ? "default" : "ghost"} size="sm" onClick={() => { setTraceMode("graph"); setTraceOpen(true); }}>
              <Share2 className="h-3.5 w-3.5" /> 흐름 그래프
            </Button>
          </div>
          {traceOpen && (traceMode === "graph"
            ? <FlowGraph selectedRunId={evalRunId} onSelectRun={onOpenRun} showRunSelect={false} />
            : <Card><CardContent className="pt-4"><TraceView runId={evalRunId} /></CardContent></Card>)}
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
            proposal={{ ...p, commitSubject: data.contextJson.commitSubject ?? null, gitRef: data.gitRef, evalRunId, reviewRunId, trigger: data.trigger }}
            projectId={projectId}
            project={project}
            onOpenEvalRun={onOpenRun}
            onOpenIngest={() => { /* 이미 이 작업 상세 안 — no-op */ }}
          />
        ))}
      </section>

      {/* ④ 변경 diff */}
      {evalRunId !== null && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">④ 변경 diff</h3>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><FileDiff className="h-3.5 w-3.5" /> 변경 보기</Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl">
              <DialogHeader><DialogTitle>변경 (파일 diff)</DialogTitle></DialogHeader>
              <DiffView runId={evalRunId} />
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}
```

> 참고: `ProposalCard`의 proposal prop은 `ProposalWithSource`(= proposal + commitSubject·gitRef·evalRunId·reviewRunId·trigger)다. `useIngestDetail`의 `data.proposals`는 `ImprovementProposal[]`이므로 위처럼 ingest context로 출처 필드를 채워 넘긴다.

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck && cd apps/web && corepack pnpm build`
Expected: 통과. (아직 라우팅 안 됨 — 다음 task에서 연결)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/work/components/work-detail-view.tsx
git commit -m "feat(web): WorkDetailIngest — ingest 작업 세로 서사(평가·검토·개선안·diff)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4: WorkDetailView — 수동 실행 run 모드

ingest 없는 run(직접 실행·벤치마크)의 상세. 서사가 짧다: 판정 + ①평가 + ④diff.

**Files:**
- Modify: `apps/web/src/domains/work/components/work-detail-view.tsx`

- [ ] **Step 1: WorkDetailRun 추가**

같은 파일에 추가. 트레이스/평가/diff는 Task 3과 동일 컴포넌트를 runId로 재사용:

```tsx
import { useRun } from "../../run/use-run";

export function WorkDetailRun({ runId, onBack, onOpenRun }: { runId: string; onBack: () => void; onOpenRun: (id: string) => void }) {
  const { data: run } = useRun(runId);
  const [traceMode, setTraceMode] = useState<"list" | "graph">("list");
  const [traceOpen, setTraceOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> 목록
      </Button>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{run?.assetName ?? "실행"}</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {run?.assetKind} · {run?.scenarioName} · {run?.runner}
        </p>
      </div>
      <VerdictStrip runId={runId} />
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">① 평가</h3>
        <Card><CardContent className="space-y-3 pt-4">
          <GradePanel runId={runId} />
          <HumanScore runId={runId} />
          <RunRetro runId={runId} />
        </CardContent></Card>
        <div className="flex w-fit rounded-md border p-0.5">
          <Button variant={traceMode === "list" ? "default" : "ghost"} size="sm" onClick={() => { setTraceMode("list"); setTraceOpen(true); }}>
            <ListTree className="h-3.5 w-3.5" /> 트레이스 리스트
          </Button>
          <Button variant={traceMode === "graph" ? "default" : "ghost"} size="sm" onClick={() => { setTraceMode("graph"); setTraceOpen(true); }}>
            <Share2 className="h-3.5 w-3.5" /> 흐름 그래프
          </Button>
        </div>
        {traceOpen && (traceMode === "graph"
          ? <FlowGraph selectedRunId={runId} onSelectRun={onOpenRun} showRunSelect={false} />
          : <Card><CardContent className="pt-4"><TraceView runId={runId} /></CardContent></Card>)}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">④ 변경 diff</h3>
        <Dialog>
          <DialogTrigger asChild><Button variant="outline" size="sm"><FileDiff className="h-3.5 w-3.5" /> 변경 보기</Button></DialogTrigger>
          <DialogContent className="max-w-5xl">
            <DialogHeader><DialogTitle>변경 (파일 diff)</DialogTitle></DialogHeader>
            <DiffView runId={runId} />
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck && cd apps/web && corepack pnpm build`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/work/components/work-detail-view.tsx
git commit -m "feat(web): WorkDetailRun — 수동 실행 run 상세(평가·트레이스·diff)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — 통합 목록

### Task 5: mergeWorkItems 순수함수

**Files:**
- Create: `apps/web/src/domains/work/lib/merge-work-items.ts`

- [ ] **Step 1: 순수함수 작성**

```ts
import type { IngestBundle, ProposalWithSource, Run } from "@opspilot/shared-types";
import type { WorkGroups, WorkItem } from "../types";

/**
 * ingest·run·proposals 를 작업 목록 그룹으로 머지한다(순수함수, 부수효과 없음).
 * - cursor 그룹: ingest 한 건 = WorkItem, proposalCount = 그 ingestId 의 proposal 수.
 * - manual 그룹: ingest 의 evalRunId/reviewRunId 로 소비되지 않은 run = 수동 실행.
 * 정렬: 각 그룹 createdAt 내림차순(최신 먼저).
 */
export function mergeWorkItems(
  ingests: IngestBundle[],
  runs: Run[],
  proposals: ProposalWithSource[],
): WorkGroups {
  const countByIngest = new Map<string, number>();
  for (const p of proposals) {
    countByIngest.set(p.ingestId, (countByIngest.get(p.ingestId) ?? 0) + 1);
  }

  // ingest 가 소비한 run id(eval·review) 집합 — manual 에서 제외.
  const consumedRunIds = new Set<string>();
  for (const ig of ingests) {
    if (ig.contextJson.evalRunId !== undefined) consumedRunIds.add(ig.contextJson.evalRunId);
    if (ig.contextJson.reviewRunId !== undefined) consumedRunIds.add(ig.contextJson.reviewRunId);
  }

  const cursor: WorkItem[] = ingests
    .map((ingest) => ({ kind: "ingest" as const, id: ingest.id, ingest, proposalCount: countByIngest.get(ingest.id) ?? 0 }))
    .sort((a, b) => b.ingest.createdAt.localeCompare(a.ingest.createdAt));

  const manual: WorkItem[] = runs
    .filter((r) => !consumedRunIds.has(r.id))
    .map((run) => ({ kind: "run" as const, id: run.id, run }))
    .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));

  return { cursor, manual };
}
```

> `Run`에 `createdAt`이 있는지 확인: `packages/shared-types/src/domain.ts`의 `runSchema`(라인 ~150-181). 없으면 정렬 키를 run의 존재 필드(예: `id`)로 바꾸고 주석으로 한계를 남긴다. **추측 금지 — 구현 시 실제 필드 확인.**

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/work/lib/merge-work-items.ts
git commit -m "feat(web): mergeWorkItems — ingest·run·proposals 를 작업 그룹으로 머지(순수함수)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6: WorkListView (목록 + 드릴다운 토글)

**Files:**
- Create: `apps/web/src/domains/work/components/work-list-view.tsx`

- [ ] **Step 1: 컴포넌트 작성**

목록·그룹·필터·흐름 띠·드릴다운 토글을 한 컴포넌트에. 선택(`WorkSelection`)이 null이면 목록, 있으면 상세를 렌더. ProjectBar·PipelineFlowBand는 기존 것을 재사용(PipelineFlowBand는 현재 feedback-view 내부 함수이므로 Task 1처럼 별도 export가 필요하면 추출한다 — 구현 시 확인: export 안 돼 있으면 `feedback/components/pipeline-flow-band.tsx`로 추출 후 feedback-view·work-list-view 양쪽에서 import).

```tsx
import { Repeat, GitCompare } from "lucide-react";
import { usePersistedState } from "../../../lib/use-persisted-state";
import { Badge } from "../../../components/ui/badge";
import { Card } from "../../../components/ui/card";
import { EmptyState, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { ProjectBar } from "../../project/components/project-bar";
import { useProjects } from "../../project/use-project";
import { useIngests, useProjectProposals, useAutoIngestConfig } from "../../feedback/use-feedback";
import { useRuns } from "../../run/use-run";
import { mergeWorkItems } from "../lib/merge-work-items";
import type { WorkItem, WorkSelection } from "../types";
import { WorkDetailIngest, WorkDetailRun } from "./work-detail-view";

interface Props {
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
  selection: WorkSelection;
  onSelect: (sel: WorkSelection) => void;
}

export function WorkListView({ projectId, onProjectIdChange, selection, onSelect }: Props) {
  const { data: projects } = useProjects();
  const { data: ingests, isPending: ingestsPending } = useIngests(projectId);
  const { data: runs } = useRuns(projectId);
  const { data: proposals } = useProjectProposals(projectId, undefined, false);
  const { data: autoIngestConfig } = useAutoIngestConfig();
  const project = (projects ?? []).find((p) => p.id === projectId);

  // 드릴다운 상세
  if (selection !== null && projectId !== null && project) {
    if (selection.kind === "ingest")
      return <WorkDetailIngest ingestId={selection.id} projectId={projectId} project={project} onBack={() => onSelect(null)} onOpenRun={(id) => onSelect({ kind: "run", id })} />;
    return <WorkDetailRun runId={selection.id} onBack={() => onSelect(null)} onOpenRun={(id) => onSelect({ kind: "run", id })} />;
  }

  if (projectId === null)
    return (
      <div className="space-y-4">
        <ProjectBar selectedProjectId={projectId} onSelect={(id) => onProjectIdChange(id)} />
        <EmptyState title="프로젝트를 선택하세요" hint="위에서 프로젝트를 고르면 작업(평가·개선안)이 표시됩니다." />
      </div>
    );

  const groups = mergeWorkItems(ingests ?? [], runs ?? [], proposals ?? []);
  const empty = groups.cursor.length === 0 && groups.manual.length === 0;

  return (
    <div className="space-y-4">
      <ProjectBar selectedProjectId={projectId} onSelect={(id) => onProjectIdChange(id)} />
      {/* TODO(구현): PipelineFlowBand 재사용(필요시 추출) + 비교/벤치마크 보조 진입점 버튼 */}
      {ingestsPending && <Card className="p-6"><Loading label="작업 불러오는 중…" /></Card>}
      {!ingestsPending && empty && (
        <EmptyState
          title="아직 작업이 없어요"
          hint={autoIngestConfig?.enabled === true
            ? "Cursor 작업을 커밋하면 주기 스캔이 자동 ingest 합니다."
            : "자동 ingest 가 꺼져 있습니다 — 서버 env OPS_AUTO_INGEST=1 로 켜면 커밋이 자동 평가됩니다."}
        />
      )}
      {!empty && (
        <div className="space-y-4">
          {groups.cursor.length > 0 && (
            <WorkSection title="Cursor 작업" items={groups.cursor} onSelect={onSelect} />
          )}
          {groups.manual.length > 0 && (
            <WorkSection title="수동 실행" items={groups.manual} onSelect={onSelect} />
          )}
        </div>
      )}
    </div>
  );
}

function WorkSection({ title, items, onSelect }: { title: string; items: WorkItem[]; onSelect: (s: WorkSelection) => void }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect({ kind: item.kind, id: item.id })}
              className={cn("w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/50")}
            >
              {item.kind === "ingest" ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{item.ingest.status}</Badge>
                    <span className="min-w-0 truncate">
                      {item.ingest.contextJson.commitSubject ?? `commit ${item.ingest.gitRef.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{item.ingest.trigger}</Badge>
                    {item.proposalCount > 0 && <span>개선안 {item.proposalCount}</span>}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{item.run.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{item.run.assetKind}</span>
                    <span className="min-w-0 truncate">{item.run.assetName}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{item.run.scenarioName} · {item.run.runner}</div>
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> 비교/벤치마크 보조 진입점(★결정1)은 기존 `ComparisonView`·`BenchmarkSummary`를 다이얼로그로 여는 버튼으로 상단에 배치한다. 구현 시 기존 `RunsView`의 사용 패턴(`compareRunIds`/`benchmarkRunIds` 상태)을 참고해 최소 버튼만 둔다(없으면 이 task에선 자리만 두고 Task 7에서 app 상태와 연결).

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck && cd apps/web && corepack pnpm build`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/work/components/work-list-view.tsx apps/web/src/domains/feedback/components/pipeline-flow-band.tsx 2>/dev/null
git commit -m "feat(web): WorkListView — ingest·수동실행 통합 목록 + 드릴다운 토글

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — 탭 교체 · 정리

### Task 7: app.tsx 3탭 교체

**Files:**
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: 탭·상태·핸들러 교체**

- `type Tab = "overview" | "registry" | "work";` (feedback·runs 제거, work 추가)
- 영속 탭 키를 새로 바꿔 옛 값 폴백: `usePersistedState<Tab>("opspilot.tab.v3", "overview")` (v2 → v3). 저장된 값이 `"feedback"`/`"runs"`면 useState 초기화 시 유효 Tab 목록에 없으므로 기본 `"overview"`로 떨어지도록 가드:

```tsx
const VALID_TABS: Tab[] = ["overview", "registry", "work"];
const [tabRaw, setTab] = usePersistedState<Tab>("opspilot.tab.v3", "overview");
const tab = VALID_TABS.includes(tabRaw) ? tabRaw : "overview";
```

- work 선택 상태: `const [workSelection, setWorkSelection] = usePersistedState<WorkSelection>("opspilot.work.selection", null);`
- 핸들러 갱신 — registry/벤치마크/eval 진입은 work 탭 + 해당 selection으로:

```tsx
const handleRunCreated = (runIds: string[]) => { setWorkSelection(runIds[0] != null ? { kind: "run", id: runIds[0] } : null); setTab("work"); };
const handleBenchmarkStarted = (runIds: string[]) => { setWorkSelection(runIds[0] != null ? { kind: "run", id: runIds[0] } : null); setTab("work"); };
const handleOpenEvalRun = (runId: string) => { setWorkSelection({ kind: "run", id: runId }); setTab("work"); };
```

> 비교·벤치마크 다중 run 상태(`compareRunIds`/`benchmarkRunIds`)는 ★결정1에 따라 보조 진입점으로 축소. 이 task에서 `RunsView` 제거와 함께 해당 상태를 WorkListView 보조 진입점에 연결하거나, 범위를 줄여 단일 run 진입만 유지하고 비교/벤치마크 진입은 후속 작업으로 남긴다(남길 경우 그 사실을 커밋 메시지·보고에 명시).

- TabsList·TabsContent를 3개로:

```tsx
<TabsList>
  <TabsTrigger value="overview">개요</TabsTrigger>
  <TabsTrigger value="registry">프로젝트</TabsTrigger>
  <TabsTrigger value="work">작업</TabsTrigger>
</TabsList>
{/* overview·registry 기존 그대로 */}
<TabsContent value="work" forceMount className="mt-0 data-[state=inactive]:hidden">
  <WorkListView projectId={projectId} onProjectIdChange={setProjectId} selection={workSelection} onSelect={setWorkSelection} />
</TabsContent>
```

- import 교체: `FeedbackView`·`RunsView` import 제거, `WorkListView`·`WorkSelection` 추가.
- `InfoDialog`의 `GUIDES`/`DIALOG_META` 키도 work로 갱신해야 typecheck 통과(`overview-info-dialog.tsx`·`workflow-guide.tsx`). feedback·runs 키를 work 하나로 합친 안내문으로 교체.

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 통과. (옛 RunsView/FeedbackView는 아직 파일로 존재하나 미참조)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app.tsx apps/web/src/components/overview-info-dialog.tsx apps/web/src/components/workflow-guide.tsx
git commit -m "feat(web): app 3탭 교체(개요·프로젝트·작업) + work 진입 라우팅·영속키 폴백

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: 옛 뷰 제거 + Playwright 최종 검증

**Files:**
- Delete: `apps/web/src/domains/run/components/runs-view.tsx`
- Modify/Delete: `apps/web/src/domains/feedback/components/feedback-view.tsx` (목록/드릴다운이 work로 이전됐으면 제거; 남은 참조 없으면 삭제)

- [ ] **Step 1: 미참조 확인 후 제거**

```bash
cd apps/web && grep -rn "RunsView\|runs-view\|FeedbackView\|feedback-view" src --include=*.tsx --include=*.ts | grep -v "work-list-view\|work-detail"
```
참조가 없으면(app.tsx에서 이미 교체) 두 파일 삭제. 참조가 남으면 그 지점을 work 뷰로 교체 후 삭제.

- [ ] **Step 2: 정적 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 전부 통과.

- [ ] **Step 3: Playwright 실연동 (스택 가동 중 — :3001/:5173, 재시작 금지)**

terraform-modules는 자동 ingest로 채워져 있다. mcp__playwright로:
1. 작업 탭 → 목록에 "Cursor 작업"(terraform ingest) + 필요시 "수동 실행" 그룹 표시. 프로젝트 필터 동작(terraform-modules ↔ 전체).
2. ingest 작업 클릭 → 전체폭 서사(커밋헤더·①평가 점수·③개선안·④diff), "목록" 버튼으로 복귀.
3. 개선안 [승인]/[거절] 버튼이 상세 안에서 동작(상태 변화 확인).
4. 트레이스 리스트⇄그래프 인라인 펼침.
5. 빈 프로젝트(run/ingest 0건) → "아직 작업이 없어요" placeholder.
- 폴링으로 snapshot ref가 갱신되니 클릭 직전 새 snapshot으로 최신 ref 사용.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(web): 옛 RunsView·FeedbackView 제거 — 작업 통합 뷰로 일원화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review 결과 (spec 대비)

- 탭 4→3, 작업 목록(그룹·필터·빈상태), 드릴다운 서사(①~④), 비교/벤치마크 보조 진입점(★1), 과감 교체(★2), API 무변경, 영속키 폴백 — 모두 task에 매핑됨.
- 미확정으로 남긴 지점(구현 시 실제 확인 필요, 추측 금지로 명시): (a) `Run.createdAt` 존재 여부(Task 5), (b) `PipelineFlowBand` export 추출 필요 여부(Task 6), (c) 비교/벤치마크 다중 run 상태를 이번에 연결할지/후속으로 남길지(Task 7) — 남기면 보고에 명시.
- 한계: web 단위 테스트 없음(정책) → 동작 검증은 Playwright 의존. mergeWorkItems는 순수함수로 분리해 타입·e2e로 간접 검증.
