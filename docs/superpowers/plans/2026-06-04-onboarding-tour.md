# 온보딩 가이드 투어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 헤더 "가이드" 토글을 켜면 첫 사용 핵심 경로(프로젝트 선택→스캔→작업목록→작업열기→판정→개선안)를 펄스 하이라이트 + 말풍선으로 단계별 안내하는 자체구현 온보딩 투어.

**Architecture:** 신규 `domains/onboarding/`에 단계 정의(`tour-steps.ts`, 순수 데이터)·상태 hook(`use-tour.ts`, active/stepIndex/next/prev/close + 화면 전환 콜백 위임)·오버레이(`tour-overlay.tsx`, data-tour 타겟의 getBoundingClientRect로 딤+펄스+말풍선 배치)를 둔다. app.tsx가 토글 버튼·오버레이를 마운트하고 setTab·setWorkSelection·첫작업id 조회를 콜백으로 연결한다. 대상 요소엔 `data-tour` 속성을 부여한다. 의존성 추가 없음.

**Tech Stack:** Vite+React+TS, Tailwind(animate-ping 펄스), shadcn Button/Card 패턴. 검증: `corepack pnpm -r typecheck`·`corepack pnpm lint`·`cd apps/web && corepack pnpm build`·Playwright MCP.

**검증 전략:** web 단위 테스트 인프라(vitest) 없음(정책) → typecheck/lint/build + Playwright 실연동. 순수 데이터(tour-steps)는 타입으로, 동작은 Playwright로.

**브랜치:** `feat/onboarding-tour`(생성됨, main 기반). 커밋 한국어 + 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## 파일 구조

생성:
- `apps/web/src/domains/onboarding/tour-steps.ts` — `TourStep` 타입 + `TOUR_STEPS` 배열(6단계, 순수 데이터)
- `apps/web/src/domains/onboarding/use-tour.ts` — 투어 상태 hook
- `apps/web/src/domains/onboarding/tour-overlay.tsx` — 딤+펄스+말풍선 렌더·위치 계산

수정:
- `apps/web/src/app.tsx` — 가이드 토글 버튼 + `<TourOverlay/>` + 콜백 연결
- `apps/web/src/domains/project/components/project-bar.tsx` — `data-tour="project-select"`·`data-tour="scan"`
- `apps/web/src/domains/work/components/work-list-view.tsx` — `data-tour="work-list"`·`data-tour="work-card"`(첫 항목)
- `apps/web/src/domains/work/components/work-detail-view.tsx` — `data-tour="verdict"`·`data-tour="proposals"`

---

## Task 1: 투어 단계 정의 (순수 데이터)

**Files:**
- Create: `apps/web/src/domains/onboarding/tour-steps.ts`

- [ ] **Step 1: 타입 + 단계 배열 작성**

```ts
import type { Tab } from "../../app-tabs";

/** 한 투어 단계. target=null 이면 화면 중앙 말풍선(하이라이트 없음). */
export interface TourStep {
  key: string;
  /** data-tour 속성 값. null 이면 중앙 말풍선. */
  target: string | null;
  title: string;
  body: string;
  /** 이 단계 진입 시 맞출 탭. */
  tab: Tab;
  /** true 면 진입 시 첫 작업을 자동 선택(상세 단계). false/생략이면 목록(선택 해제). */
  needsSelection?: boolean;
  /** 말풍선 위치 힌트(타겟 기준). */
  placement?: "bottom" | "top" | "right" | "left";
}

export const TOUR_STEPS: TourStep[] = [
  { key: "project", target: "project-select", tab: "work", placement: "bottom",
    title: "프로젝트 고르기", body: "먼저 평가할 프로젝트를 골라요." },
  { key: "scan", target: "scan", tab: "work", placement: "bottom",
    title: "자산 읽기", body: "스캔하면 그 프로젝트의 에이전트·스킬·커맨드(자산)를 읽어들여요." },
  { key: "list", target: "work-list", tab: "work", placement: "top",
    title: "작업이 쌓이는 곳", body: "Cursor·AI 작업이 자동 평가돼 여기 작업으로 쌓여요. 위 단계 배지로 진행 상태도 봐요." },
  { key: "open", target: "work-card", tab: "work", placement: "right",
    title: "작업 열기", body: "작업 하나를 열면 그 작업의 평가·개선안이 한 화면에 보여요." },
  { key: "verdict", target: "verdict", tab: "work", needsSelection: true, placement: "bottom",
    title: "잘했나 판단", body: "이 작업을 잘했는지 — 점수·판정을 한눈에 봐요." },
  { key: "proposals", target: "proposals", tab: "work", needsSelection: true, placement: "top",
    title: "뭘 고치나 결정", body: "개선안을 승인/거절해요. 승인하면 자산에 반영돼 다음 작업이 더 나아져요." },
];
```

> `Tab` 타입은 현재 `app.tsx` 안에 정의돼 있다(`type Tab = "overview" | "registry" | "work"`). tour-steps가 import하려면 공유 위치가 필요하다 — Task 2에서 `app-tabs.ts`로 추출한다. 이 Task에서 import 경로(`../../app-tabs`)를 미리 쓰고, Task 2에서 그 파일을 만들면 typecheck가 맞는다. **이 Task의 typecheck는 Task 2 완료 후 함께 통과**시킨다(또는 이 Task에서 `app-tabs.ts`를 먼저 만들어도 됨 — 구현자 판단).

- [ ] **Step 2: 검증(Task 2와 함께)**

Task 2에서 `app-tabs.ts` 생성 후 `corepack pnpm -r typecheck` 통과.

- [ ] **Step 3: 커밋(Task 2와 묶어도 됨)**

```bash
git add apps/web/src/domains/onboarding/tour-steps.ts
git commit -m "feat(web): 온보딩 투어 6단계 정의(TourStep·TOUR_STEPS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 2: Tab 타입 공유 추출

**Files:**
- Create: `apps/web/src/app-tabs.ts`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: app-tabs.ts 생성**

```ts
/** 상단 탭 식별자 — app.tsx 와 온보딩 투어가 공유. */
export type Tab = "overview" | "registry" | "work";
export const VALID_TABS: Tab[] = ["overview", "registry", "work"];
```

- [ ] **Step 2: app.tsx 에서 기존 정의 제거 후 import**

`app.tsx`의 `type Tab = ...`와 `const VALID_TABS = ...`(있으면) 정의를 삭제하고 상단에 `import { type Tab, VALID_TABS } from "./app-tabs";` 추가. 기존 사용처는 그대로 동작.

- [ ] **Step 3: 검증**

Run: `corepack pnpm -r typecheck`
Expected: 통과(Tab·VALID_TABS 가 app-tabs 에서 해석됨, tour-steps import도 해결).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app-tabs.ts apps/web/src/app.tsx apps/web/src/domains/onboarding/tour-steps.ts
git commit -m "refactor(web): Tab 타입을 app-tabs.ts 로 추출(투어와 공유) + 투어 단계 정의

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 3: use-tour 상태 hook

**Files:**
- Create: `apps/web/src/domains/onboarding/use-tour.ts`

- [ ] **Step 1: hook 작성**

투어 활성/단계 상태와 네비게이션. 화면 전환(탭·선택)은 콜백으로 위임받아, 단계 전환마다 해당 단계의 `tab`·`needsSelection`에 맞춰 호출한다.

```ts
import { useCallback, useState } from "react";
import { TOUR_STEPS } from "./tour-steps";

interface TourCallbacks {
  /** 단계의 탭으로 전환. */
  onTab: (tab: "overview" | "registry" | "work") => void;
  /** needsSelection 단계면 첫 작업 선택, 아니면 선택 해제(null). */
  onSelection: (needsSelection: boolean) => void;
}

export function useTour(cb: TourCallbacks) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const applyStep = useCallback(
    (index: number) => {
      const step = TOUR_STEPS[index];
      if (step === undefined) return;
      cb.onTab(step.tab);
      cb.onSelection(step.needsSelection === true);
    },
    [cb],
  );

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    applyStep(0);
  }, [applyStep]);

  const close = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const ni = i + 1;
      if (ni >= TOUR_STEPS.length) {
        setActive(false);
        return i;
      }
      applyStep(ni);
      return ni;
    });
  }, [applyStep]);

  const prev = useCallback(() => {
    setStepIndex((i) => {
      const pi = Math.max(0, i - 1);
      applyStep(pi);
      return pi;
    });
  }, [applyStep]);

  const toggle = useCallback(() => {
    if (active) close();
    else start();
  }, [active, close, start]);

  return { active, stepIndex, step: TOUR_STEPS[stepIndex], total: TOUR_STEPS.length, start, close, next, prev, toggle };
}
```

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/onboarding/use-tour.ts
git commit -m "feat(web): useTour — 투어 상태·네비(화면 전환은 콜백 위임)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 4: TourOverlay (딤+펄스+말풍선)

**Files:**
- Create: `apps/web/src/domains/onboarding/tour-overlay.tsx`

- [ ] **Step 1: 컴포넌트 작성**

활성 시 렌더. 현재 단계의 `target`(data-tour 값)으로 요소를 찾아 위치를 계산, 딤 오버레이 + 펄스 링 + 말풍선(제목·설명·이전/다음(완료)/닫기·진행 N/M). 타겟 없으면 중앙 말풍선. 탭 전환/드릴다운 직후 마운트 지연은 rAF 재시도로 흡수.

```tsx
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type { TourStep } from "./tour-steps";

interface Rect { top: number; left: number; width: number; height: number; }

interface Props {
  active: boolean;
  step: TourStep | undefined;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function TourOverlay({ active, step, stepIndex, total, onNext, onPrev, onClose }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!active || step == null || step.target == null) {
      setRect(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el != null) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      // 탭 전환/드릴다운 후 요소 마운트 대기 — 최대 30프레임 재시도.
      if (tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(measure);
      } else {
        setRect(null); // 못 찾으면 중앙 말풍선
      }
    };
    measure();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, step, stepIndex]);

  if (!active || step == null) return null;

  const isLast = stepIndex >= total - 1;
  const pad = 6;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* 딤 오버레이 — 클릭하면 닫힘 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />

      {/* 타겟 펄스 링 */}
      {rect != null && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        >
          <span className="absolute inset-0 animate-ping rounded-lg ring-2 ring-primary/60" />
        </div>
      )}

      {/* 말풍선 — 타겟 아래(없으면 화면 중앙) */}
      <div
        className="absolute w-[320px] max-w-[90vw] rounded-lg border bg-background p-4 shadow-lg"
        style={
          rect != null
            ? { top: Math.min(rect.top + rect.height + 12, window.innerHeight - 200), left: Math.min(Math.max(rect.left, 12), window.innerWidth - 332) }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
        role="dialog"
        aria-label="가이드 투어"
      >
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold">{step.title}</h4>
          <span className="text-xs text-muted-foreground tabular-nums">{stepIndex + 1}/{total}</span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={onPrev}>이전</Button>
            )}
            <Button size="sm" onClick={onNext}>{isLast ? "완료" : "다음"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `corepack pnpm -r typecheck && cd apps/web && corepack pnpm build`
Expected: 통과. (아직 마운트 안 됨)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/onboarding/tour-overlay.tsx
git commit -m "feat(web): TourOverlay — 딤·펄스 링·말풍선 네비(타겟 없으면 중앙)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 5: data-tour 속성 부여

**Files:**
- Modify: `apps/web/src/domains/project/components/project-bar.tsx`
- Modify: `apps/web/src/domains/work/components/work-list-view.tsx`
- Modify: `apps/web/src/domains/work/components/work-detail-view.tsx`

- [ ] **Step 1: project-bar.tsx — 프로젝트 선택·스캔 타겟**

프로젝트 선택 `SelectTrigger`(또는 그 래퍼)에 `data-tour="project-select"`, 스캔 버튼에 `data-tour="scan"` 추가. (해당 요소를 grep으로 찾아 JSX 속성만 추가 — 동작 불변.)

- [ ] **Step 2: work-list-view.tsx — 목록·첫 작업 카드 타겟**

목록 그룹을 감싸는 영역(또는 cursor 그룹 `<section>`)에 `data-tour="work-list"`, **첫 번째 작업 카드 버튼**에 `data-tour="work-card"`. 첫 항목 판별은 `WorkSection`의 map index 0 또는 목록 첫 렌더 항목. 한 곳에만 부여(중복 금지).

- [ ] **Step 3: work-detail-view.tsx — 판정·개선안 타겟**

`WorkDetailIngest`의 VerdictStrip 래퍼에 `data-tour="verdict"`, 개선안 `<section>`에 `data-tour="proposals"`. (VerdictStrip 자체는 외부 컴포넌트이므로 감싸는 div에 부여.)

- [ ] **Step 4: 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 통과(속성 추가만, 동작 불변).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/domains/project/components/project-bar.tsx apps/web/src/domains/work/components/work-list-view.tsx apps/web/src/domains/work/components/work-detail-view.tsx
git commit -m "feat(web): 투어 타겟 data-tour 속성 부여(프로젝트선택·스캔·목록·카드·판정·개선안)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 6: app.tsx 통합 — 토글 버튼 + 오버레이 + 콜백

**Files:**
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: 첫 작업 id 조회 + useTour 연결**

app.tsx에서:
- `import { useIngests } from "./domains/feedback/use-feedback";` (이미 다른 hook 쓰는 패턴 따라) — 전역 `projectId`로 첫 ingest id 조회: `const { data: tourIngests } = useIngests(projectId);` 그리고 `const firstWorkId = tourIngests?.[0]?.id ?? null;`
- `useTour` 콜백 연결:
```tsx
import { useTour } from "./domains/onboarding/use-tour";
import { TourOverlay } from "./domains/onboarding/tour-overlay";
// ...
const tour = useTour({
  onTab: (t) => setTab(t),
  onSelection: (needs) => {
    if (needs && firstWorkId != null) setWorkSelection({ kind: "ingest", id: firstWorkId });
    else setWorkSelection(null);
  },
});
```
> `setWorkSelection`·`setTab`은 이미 app.tsx에 존재. `WorkSelection` kind는 "ingest"(작업 상세). firstWorkId 없으면 onSelection(true)이어도 선택 안 함 → TourOverlay가 중앙 말풍선(엣지케이스).

- [ ] **Step 2: 헤더 가이드 토글 버튼 추가**

헤더의 `<InfoDialog .../>` 옆(ServerHealthIndicator/InfoDialog 그룹)에 나침반 토글 버튼:
```tsx
import { Compass } from "lucide-react";
// ...
<Button
  variant={tour.active ? "default" : "ghost"}
  size="icon"
  onClick={tour.toggle}
  title="가이드 투어"
  aria-label="가이드 투어"
>
  <Compass className="h-4 w-4" />
</Button>
```

- [ ] **Step 3: TourOverlay 마운트**

`</main>` 직전(또는 TooltipProvider 내부 최상위)에:
```tsx
<TourOverlay
  active={tour.active}
  step={tour.step}
  stepIndex={tour.stepIndex}
  total={tour.total}
  onNext={tour.next}
  onPrev={tour.prev}
  onClose={tour.close}
/>
```

- [ ] **Step 4: 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app.tsx
git commit -m "feat(web): 헤더 가이드 토글 + TourOverlay 마운트 + 탭·선택 콜백 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Task 7: Playwright 실연동 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 스택 확인 후 실연동 (mcp__playwright, :5173 — 재시작 금지)**

> 폴링·탭 전환으로 snapshot ref가 갱신되니 클릭 직전 새 snapshot. 단계 전환은 말풍선 "다음" 버튼 클릭.

1. 헤더 나침반(가이드) 클릭 → 투어 시작, 1단계 "프로젝트 고르기" 말풍선 + 프로젝트 선택에 펄스 링, 진행 "1/6".
2. "다음" → 2 스캔 → 3 작업 목록 → 4 작업 카드. 각 단계 타겟에 펄스, 작업 탭 자동 유지.
3. 4→5 "다음" → 첫 작업 자동 선택돼 상세로 전환, "verdict"에 펄스("잘했나 판단"), 5/6.
4. 5→6 → 개선안 섹션 펄스("뭘 고치나 결정"), 6/6 버튼 "완료".
5. "완료" → 오버레이 사라짐. 다시 토글 → 재시작. "닫기"·딤 클릭으로도 종료.
6. 작업 0건 프로젝트(parallel 등) 선택 후 투어 → 4~6단계가 중앙 말풍선으로 깨짐 없이 진행.
- 투어 중 실제 mutation 클릭 금지. 스크린샷 verify-tour-*.png(커밋 제외, 후 삭제).

- [ ] **Step 2: 통과 시 보고**

모든 시나리오 통과면 추가 커밋 없음(코드 변경 없는 검증 task). 실패·이상 발견 시 해당 컴포넌트 수정 후 재검증.

---

## Self-Review (spec 대비)

- 트리거(헤더 토글, 자동 시작 없음) → Task 6. 형태(딤·펄스·말풍선 N/M·네비) → Task 4. 탭/상세 자동 전환 → Task 3(use-tour applyStep) + Task 6(콜백). data-tour 타겟 6개 → Task 5. 6단계 시퀀스 → Task 1. 엣지(타겟 없음 중앙 말풍선) → Task 4(rect null). 첫 작업 id app 제공 → Task 6. 모두 매핑됨.
- 타입 일관성: `Tab`(app-tabs.ts, Task 2)을 tour-steps(Task 1)·use-tour(Task 3 내부 리터럴 동일)·app(Task 6)이 일관 사용. `TourStep`·`TOUR_STEPS`(Task 1) → use-tour(Task 3)·tour-overlay(Task 4) 일관. `WorkSelection` kind "ingest"(Task 6)는 기존 work/types 정의와 일치.
- placeholder 없음(전 코드 제시).
- 한계: web 단위테스트 없음 → 동작은 Playwright 의존. 첫 작업 자동선택은 ingest 기준(kind "ingest") — 수동 실행 run만 있는 프로젝트면 5·6 타겟이 비어 중앙 말풍선(엣지로 수용).
