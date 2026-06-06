# 하네스 복리 증명 — 정정비율 추세 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개요탭 최상단에 프로젝트 단위 "정정비율 추세 + apply 마커" 차트를 두어, 하네스 엔지니어링이 복리가 되고 있는지를 정직한 신호로 보인다.

**Architecture:** 기존 `asset_work_metric`(정정·발화·first_seen)과 `improvement_proposal`(applied)을 읽기 전용으로 집계하는 백엔드 엔드포인트 하나(`GET /api/usage/compounding-trend`)와, 그 응답을 순수 SVG 라인 차트로 그리는 프론트 섹션 하나. 스키마 변경 없음. 집계는 순수 함수로 분리해 vitest로 검증.

**Tech Stack:** 서버 = Fastify + fastify-type-provider-zod + better-sqlite3 + vitest. 웹 = Vite + React + TanStack Query + 순수 SVG(차트 라이브러리 미도입, 의존성 최소 원칙) + Tailwind 토큰. 공유 타입 = `@opspilot/shared-types`(Zod).

**검증 비대칭 (반드시 인지):** `apps/server`는 vitest가 있어 TDD 한다. `apps/web`은 vitest가 없다 — 검증은 `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build` + Playwright 실연동이다. 웹 태스크에 단위테스트 단계를 넣지 않는다.

**서버 격리 (CLAUDE.md 함정):** 검증용 서버는 항상 임시 DB로. 루트 `pnpm dev` 금지. 수동 확인 시 `cd apps/server && OPS_DB_PATH=/tmp/cp.sqlite corepack pnpm dev`, 웹은 따로. 시작 전 `lsof -ti:3001` stale kill.

---

## File Structure

**생성:**
- `apps/server/src/domains/usage/compounding-trend.ts` — 순수 집계 함수(주 버킷·정정비율·apply 이벤트 매핑). DB 의존 없음.
- `apps/server/src/domains/usage/compounding-trend.test.ts` — 위 순수 함수 vitest.
- `apps/server/src/domains/usage/compounding-trend-service.ts` — DB 조회를 순수 함수에 물려 응답을 만드는 서비스.
- `apps/web/src/domains/registry/components/overview/compounding-trend-chart.tsx` — 순수 SVG 차트(표현 전용, 데이터 패칭 없음).
- `apps/web/src/domains/registry/components/overview/compounding-trend-section.tsx` — 패칭·상태·캐비앗 래퍼.

**수정:**
- `packages/shared-types/src/domain.ts` — 응답 Zod 스키마 추가(파일 끝, projectWorkMetric 블록 아래).
- `apps/server/src/routes/api/usage.ts` — `GET /usage/compounding-trend` 라우트 추가.
- `apps/web/src/domains/registry/api.ts` — Query Key + fetch 함수 추가.
- `apps/web/src/domains/registry/use-registry.ts` — `useCompoundingTrend` 훅 추가.
- `apps/web/src/domains/registry/components/overview-view.tsx` — 프로젝트 선택기를 상단으로 올리고, 추세 섹션을 최상단에, 활동 잔디를 최하단으로 강등.

---

## Task 1: 공유 응답 스키마 (shared-types)

**Files:**
- Modify: `packages/shared-types/src/domain.ts` (파일 끝, line 699 `ProjectWorkMetricReport` 타입 export 아래에 append)

- [ ] **Step 1: 스키마 추가**

`packages/shared-types/src/domain.ts` 끝(699행 아래)에 추가. `id` 와 `z` 는 이 파일에서 이미 쓰이고 있다(같은 스코프).

```typescript

// ── 하네스 복리 증명 — 프로젝트 단위 정정비율 추세 (의제 002 고리 #3) ──
// ⚠️ reference signal. 추세는 인과가 아니라 신호다 — 작업 난도·사용자 숙련도가 혼란변수.
// 정정비율 = Σ correction_roundtrips ÷ Σ invocation_count (낮을수록 하네스가 덜 보챈다).

// 주(week) 버킷 한 칸.
export const compoundingTrendPointSchema = z.object({
  // 버킷 시작일(월요일, UTC) YYYY-MM-DD.
  periodStart: z.string(),
  // 이 버킷에서 자산이 발화된 세션 수(표본). 적을수록 흔들린다.
  sessions: z.number().int().nonnegative(),
  invocations: z.number().int().nonnegative(),
  corrections: z.number().int().nonnegative(),
  // corrections ÷ invocations. 발화 0이면 null.
  correctionRate: z.number().nullable(),
});
export type CompoundingTrendPoint = z.infer<typeof compoundingTrendPointSchema>;

// 하네스를 손본 시점(개선안 적용). 추세 위 세로 마커.
export const compoundingApplyEventSchema = z.object({
  // ⚠️ 개선안 생성 시각(created_at) 기준 근사. applied 시각 컬럼이 없어 주 버킷
  //    입도에서 허용 가능한 근사로 둔다(설계 문서의 열린 질문).
  at: z.string(),
  targetKind: z.string(),
  targetPath: z.string(),
});
export type CompoundingApplyEvent = z.infer<typeof compoundingApplyEventSchema>;

export const compoundingTrendSchema = z.object({
  signalType: z.literal("reference"),
  signalNote: z.string(),
  projectId: id,
  projectName: z.string(),
  clonePath: z.string(),
  bucket: z.literal("week"),
  // periodStart 오름차순(과거→현재).
  points: z.array(compoundingTrendPointSchema),
  // at 오름차순.
  applyEvents: z.array(compoundingApplyEventSchema),
  totalSessions: z.number().int().nonnegative(),
  totalInvocations: z.number().int().nonnegative(),
});
export type CompoundingTrend = z.infer<typeof compoundingTrendSchema>;
```

- [ ] **Step 2: 타입 통과 확인**

Run: `corepack pnpm --filter @opspilot/shared-types typecheck`
Expected: PASS (오류 0)

- [ ] **Step 3: 커밋**

```bash
git add packages/shared-types/src/domain.ts
git commit -m "feat(types): 복리 추세 응답 스키마 (의제 002 고리 #3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 순수 집계 함수 + vitest (TDD)

**Files:**
- Create: `apps/server/src/domains/usage/compounding-trend.ts`
- Test: `apps/server/src/domains/usage/compounding-trend.test.ts`

집계는 DB와 분리한 순수 함수다. 입력 = `WorkMetricRow[]`(work-metric-repository의 export 타입)와 apply proposal 행 배열. 출력 = 정렬된 포인트·이벤트 배열.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/usage/compounding-trend.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { WorkMetricRow } from "./work-metric-repository.js";
import {
  isoWeekStart,
  aggregateTrendPoints,
  aggregateApplyEvents,
} from "./compounding-trend.js";

// Jan 1 2024 = 월요일 (고정 사실)을 앵커로 주 시작을 검증.
describe("isoWeekStart", () => {
  it("주중 날짜를 그 주 월요일(UTC)로 내린다", () => {
    expect(isoWeekStart("2024-01-03T12:00:00Z")).toBe("2024-01-01"); // 수
    expect(isoWeekStart("2024-01-07T23:59:00Z")).toBe("2024-01-01"); // 일
    expect(isoWeekStart("2024-01-08T00:00:00Z")).toBe("2024-01-08"); // 월
  });
});

function row(over: Partial<WorkMetricRow>): WorkMetricRow {
  return {
    sessionId: "s",
    kind: "agent",
    name: "x",
    cwd: "/p",
    invocationCount: 1,
    correctionRoundtrips: 0,
    firstSeen: "2024-01-03T10:00:00Z",
    lastSeen: "2024-01-03T11:00:00Z",
    ...over,
  };
}

describe("aggregateTrendPoints", () => {
  it("first_seen 주별로 발화·정정·세션을 합치고 정정비율을 낸다", () => {
    const points = aggregateTrendPoints([
      row({ sessionId: "a", invocationCount: 4, correctionRoundtrips: 2, firstSeen: "2024-01-03T10:00:00Z" }),
      row({ sessionId: "b", invocationCount: 6, correctionRoundtrips: 1, firstSeen: "2024-01-05T10:00:00Z" }),
      row({ sessionId: "c", invocationCount: 5, correctionRoundtrips: 0, firstSeen: "2024-01-10T10:00:00Z" }),
    ]);
    expect(points).toEqual([
      { periodStart: "2024-01-01", sessions: 2, invocations: 10, corrections: 3, correctionRate: 0.3 },
      { periodStart: "2024-01-08", sessions: 1, invocations: 5, corrections: 0, correctionRate: 0 },
    ]);
  });

  it("first_seen 이 null 인 행은 제외한다", () => {
    const points = aggregateTrendPoints([
      row({ firstSeen: null, invocationCount: 9, correctionRoundtrips: 9 }),
      row({ firstSeen: "2024-01-03T10:00:00Z", invocationCount: 2, correctionRoundtrips: 1 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ invocations: 2, corrections: 1, correctionRate: 0.5 });
  });

  it("발화 0 버킷의 정정비율은 null 이다", () => {
    const points = aggregateTrendPoints([
      row({ invocationCount: 0, correctionRoundtrips: 0 }),
    ]);
    expect(points[0]?.correctionRate).toBeNull();
  });
});

describe("aggregateApplyEvents", () => {
  it("at 오름차순으로 정렬해 매핑한다", () => {
    const events = aggregateApplyEvents([
      { createdAt: "2024-02-01T00:00:00Z", targetKind: "cursor_rule", targetPath: ".cursor/rules/b.mdc" },
      { createdAt: "2024-01-01T00:00:00Z", targetKind: "agent", targetPath: ".claude/agents/a.md" },
    ]);
    expect(events.map((e) => e.at)).toEqual([
      "2024-01-01T00:00:00Z",
      "2024-02-01T00:00:00Z",
    ]);
    expect(events[0]).toEqual({
      at: "2024-01-01T00:00:00Z",
      targetKind: "agent",
      targetPath: ".claude/agents/a.md",
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/usage/compounding-trend.test.ts`
Expected: FAIL ("Cannot find module './compounding-trend.js'" 또는 export 미정의)

- [ ] **Step 3: 최소 구현**

`apps/server/src/domains/usage/compounding-trend.ts`:

```typescript
import type {
  CompoundingApplyEvent,
  CompoundingTrendPoint,
} from "@opspilot/shared-types";
import type { WorkMetricRow } from "./work-metric-repository.js";

/** ISO 시각을 그 주의 월요일(UTC) YYYY-MM-DD 로 내린다. */
export function isoWeekStart(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0=일 .. 6=토
  const shift = day === 0 ? -6 : 1 - day; // 월요일로 이동
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shift),
  );
  return monday.toISOString().slice(0, 10);
}

interface Acc {
  sessions: number;
  invocations: number;
  corrections: number;
}

/** first_seen 주 버킷별로 세션·발화·정정을 합치고 정정비율을 낸다(과거→현재). */
export function aggregateTrendPoints(
  rows: WorkMetricRow[],
): CompoundingTrendPoint[] {
  const byWeek = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.firstSeen) continue; // 시점 없는 행은 추세에 못 올린다
    const week = isoWeekStart(r.firstSeen);
    const acc = byWeek.get(week) ?? { sessions: 0, invocations: 0, corrections: 0 };
    acc.sessions += 1;
    acc.invocations += r.invocationCount;
    acc.corrections += r.correctionRoundtrips;
    byWeek.set(week, acc);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([periodStart, a]) => ({
      periodStart,
      sessions: a.sessions,
      invocations: a.invocations,
      corrections: a.corrections,
      correctionRate: a.invocations > 0 ? a.corrections / a.invocations : null,
    }));
}

/** applied 개선안 행 → apply 마커(at 오름차순). at = 개선안 created_at 근사. */
export function aggregateApplyEvents(
  proposals: { createdAt: string; targetKind: string; targetPath: string }[],
): CompoundingApplyEvent[] {
  return proposals
    .map((p) => ({
      at: p.createdAt,
      targetKind: p.targetKind,
      targetPath: p.targetPath,
    }))
    .sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm exec vitest run src/domains/usage/compounding-trend.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/domains/usage/compounding-trend.ts apps/server/src/domains/usage/compounding-trend.test.ts
git commit -m "feat(server): 복리 추세 순수 집계(주 버킷·정정비율·apply 마커)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 서비스 (DB 조회 → 응답)

**Files:**
- Create: `apps/server/src/domains/usage/compounding-trend-service.ts`

기존 `listWorkMetricsForClone`(work-metric-repository)와 `listProposalsByProject`(feedback/repository)를 순수 집계에 물린다. 후자는 `(projectId, "applied")` 로 필터하고, 반환 행은 `createdAt`·`targetKind`·`targetPath` 를 갖는다(repository.ts:196-229 확인됨).

- [ ] **Step 1: 서비스 작성**

`apps/server/src/domains/usage/compounding-trend-service.ts`:

```typescript
import type { CompoundingTrend, Project } from "@opspilot/shared-types";
import { listProposalsByProject } from "../feedback/repository.js";
import {
  aggregateApplyEvents,
  aggregateTrendPoints,
} from "./compounding-trend.js";
import { listWorkMetricsForClone } from "./work-metric-repository.js";

/** UI 라벨 — 추세를 인과로 오독하지 않게(설계 문서 §정직성). */
export const COMPOUNDING_SIGNAL_NOTE =
  "추세는 인과가 아니라 신호다. 정정비율(정정왕복÷발화)은 작업 난도와 사용자 숙련도 변화에 함께 영향받는다 — 비율이 떨어져도 하네스 개선 덕인지 단정할 수 없다. 표본(세션·발화)이 적은 구간은 흔들린다.";

/** 한 프로젝트의 정정비율 주별 추세 + 개선안 적용 마커(읽기 전용 집계). */
export function compoundingTrendForProject(project: Project): CompoundingTrend {
  const rows = listWorkMetricsForClone(project.clonePath);
  const applied = listProposalsByProject(project.id, "applied");
  const points = aggregateTrendPoints(rows);
  const applyEvents = aggregateApplyEvents(applied);
  return {
    signalType: "reference",
    signalNote: COMPOUNDING_SIGNAL_NOTE,
    projectId: project.id,
    projectName: project.name,
    clonePath: project.clonePath,
    bucket: "week",
    points,
    applyEvents,
    totalSessions: points.reduce((a, p) => a + p.sessions, 0),
    totalInvocations: points.reduce((a, p) => a + p.invocations, 0),
  };
}
```

- [ ] **Step 2: 타입 통과 확인**

Run: `cd apps/server && corepack pnpm typecheck`
Expected: PASS

> 만약 `listProposalsByProject` 의 반환 타입에 `createdAt`/`targetKind`/`targetPath` 가 없다고 tsc가 불평하면, `apps/server/src/domains/feedback/repository.ts` 의 해당 함수 반환 타입을 열어 정확한 필드명을 확인하고 매핑을 맞춘다(이 함수는 SQL에서 `created_at AS createdAt`, `target_kind AS targetKind`, `target_path AS targetPath` 로 별칭을 준다 — repository.ts:196-229).

- [ ] **Step 3: 커밋**

```bash
git add apps/server/src/domains/usage/compounding-trend-service.ts
git commit -m "feat(server): 복리 추세 서비스 — work-metric+applied proposal 조합

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 라우트 (`GET /usage/compounding-trend`)

**Files:**
- Modify: `apps/server/src/routes/api/usage.ts`

기존 `/usage/work-metrics`(usage.ts:146-165)와 동일한 querystring·404 패턴.

- [ ] **Step 1: import 추가**

`apps/server/src/routes/api/usage.ts:1-6` 의 `@opspilot/shared-types` import 블록에 `compoundingTrendSchema` 를 추가:

```typescript
import {
  compoundingTrendSchema,
  projectUsageReportSchema,
  projectWorkMetricReportSchema,
  usageGlobalSchema,
  workMetricScanResultSchema,
} from "@opspilot/shared-types";
```

그리고 work-metric-service import 블록(usage.ts:14-17) 아래에 서비스 import 추가:

```typescript
import { compoundingTrendForProject } from "../../domains/usage/compounding-trend-service.js";
```

- [ ] **Step 2: 라우트 추가**

`usage.ts` 의 `/usage/work-metrics/scan` POST 라우트(168-172) 바로 위에 추가:

```typescript
  // 의제 002 고리 #3: 프로젝트 단위 정정비율 추세 + 개선안 적용 마커. 저장 지표만 읽는다.
  fastify.get(
    "/usage/compounding-trend",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: {
          200: compoundingTrendSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      const project = getProject(req.query.projectId);
      if (!project)
        return reply
          .status(404)
          .send({ error: "NotFound", detail: "project not found" });
      return compoundingTrendForProject(project);
    },
  );
```

- [ ] **Step 3: 타입 통과 확인**

Run: `cd apps/server && corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 격리 서버로 수동 확인**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; true
cd apps/server && OPS_DB_PATH=/tmp/cp-verify.sqlite corepack pnpm db:migrate
cd apps/server && OPS_DB_PATH=/tmp/cp-verify.sqlite corepack pnpm dev &
# 기동 후(2~3초): 잘못된 projectId → 404 JSON 확인
curl -s "http://localhost:3001/api/usage/compounding-trend?projectId=00000000-0000-0000-0000-000000000000"
```
Expected: `{"error":"NotFound","detail":"project not found"}` (스키마·라우트가 살아있음을 확인). 확인 후 서버 kill: `lsof -ti:3001 | xargs kill -9`.

> 실데이터 추세 확인은 Task 9의 영속 스택 + Playwright에서 한다(platform-gitops).

- [ ] **Step 5: 커밋**

```bash
git add apps/server/src/routes/api/usage.ts
git commit -m "feat(server): GET /usage/compounding-trend 엔드포인트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 프론트 데이터 계층 (api + 훅)

**Files:**
- Modify: `apps/web/src/domains/registry/api.ts`
- Modify: `apps/web/src/domains/registry/use-registry.ts`

- [ ] **Step 1: api.ts — 스키마 import·Query Key·fetch 추가**

`api.ts:2-17` 의 `@opspilot/shared-types` import 블록에 `compoundingTrendSchema` 추가:

```typescript
  assetVersionSchema,
  compoundingTrendSchema,
  improveResultSchema,
```

`registryKeys`(api.ts:28-49) 객체에 키 추가(`workMetrics` 아래):

```typescript
  compoundingTrend: (projectId: string) =>
    [...registryKeys.all, "compounding-trend", projectId] as const,
```

`getProjectWorkMetrics`(api.ts:90 부근) 아래에 fetch 함수 추가:

```typescript
// 의제 002 고리 #3: 프로젝트 단위 정정비율 추세 + apply 마커. ⚠️ reference signal.
export async function getCompoundingTrend(projectId: string) {
  return apiGet(
    `/api/usage/compounding-trend?projectId=${projectId}`,
    compoundingTrendSchema,
  );
}
```

- [ ] **Step 2: use-registry.ts — 훅 추가**

`use-registry.ts:6-23` import 블록의 `./api` import 에 `getCompoundingTrend` 추가(알파벳 순 위치, `getAssetScenarios` 아래쯤):

```typescript
  getCompoundingTrend,
```

`useProjectWorkMetrics`(use-registry.ts:44-51) 아래에 훅 추가:

```typescript
// 의제 002 고리 #3: 복리 추세(정정비율 + apply 마커). 저장 지표만 읽어 가볍다.
export function useCompoundingTrend(projectId: string | null) {
  return useQuery({
    queryKey: registryKeys.compoundingTrend(projectId ?? "none"),
    queryFn: () => getCompoundingTrend(projectId ?? ""),
    enabled: projectId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: 타입 통과 확인**

Run: `cd apps/web && corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/domains/registry/api.ts apps/web/src/domains/registry/use-registry.ts
git commit -m "feat(web): 복리 추세 api·훅 (useCompoundingTrend)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 순수 SVG 추세 차트

**Files:**
- Create: `apps/web/src/domains/registry/components/overview/compounding-trend-chart.tsx`

표현 전용. 시간축(주 버킷의 periodStart)을 x, 정정비율(0~1)을 y 로. **낮은 비율이 좋으므로 비율이 떨어지면 선이 아래로 내려가게** y 를 뒤집는다(rate 1 = 위, rate 0 = 아래). apply 이벤트는 세로선. 표본 적은 점은 흐리게. 색은 sparkline 패턴대로 `currentColor`(text-* 토큰).

- [ ] **Step 1: 컴포넌트 작성**

`apps/web/src/domains/registry/components/overview/compounding-trend-chart.tsx`:

```typescript
import { useId } from "react";
import type {
  CompoundingApplyEvent,
  CompoundingTrendPoint,
} from "@opspilot/shared-types";
import { cn } from "../../../../lib/utils";

interface Props {
  points: CompoundingTrendPoint[];
  applyEvents: CompoundingApplyEvent[];
  // 이 세션 수 미만 버킷은 "표본 적음"으로 흐리게.
  lowSampleBelow?: number;
  width?: number;
  height?: number;
}

const WEEK_MS = 7 * 86_400_000;

export function CompoundingTrendChart({
  points,
  applyEvents,
  lowSampleBelow = 2,
  width = 720,
  height = 200,
}: Props) {
  const id = useId();
  const padL = 32; // y 라벨 공간
  const padR = 12;
  const padT = 10;
  const padB = 20; // x 라벨 공간
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const tMin = Date.parse(points[0]?.periodStart ?? "");
  const tMaxRaw = Date.parse(points[points.length - 1]?.periodStart ?? "");
  // 마지막 버킷도 한 주 폭을 갖게 +1주. 단일 점이면 폭 0 방지.
  const tMax = Number.isNaN(tMaxRaw) ? tMin : tMaxRaw + WEEK_MS;
  const span = tMax - tMin || 1;

  const x = (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return padL;
    const clamped = Math.min(Math.max(t, tMin), tMax);
    return padL + ((clamped - tMin) / span) * innerW;
  };
  // rate 1 → 위(나쁨), rate 0 → 아래(좋음): 비율이 내려가면 선이 내려간다.
  const y = (rate: number) => padT + (1 - 0) * 0 + rate * innerH;

  const drawn = points.filter(
    (p): p is CompoundingTrendPoint & { correctionRate: number } =>
      p.correctionRate !== null,
  );
  const linePts = drawn
    .map((p) => `${String(Math.round(x(p.periodStart)))},${String(Math.round(y(p.correctionRate)))}`)
    .join(" ");

  const gridRates = [0, 0.5, 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-labelledby={id}
      className="max-w-full"
    >
      <title id={id}>프로젝트 정정비율 추세 (낮을수록 좋음)</title>

      {/* y 그리드 + 라벨 */}
      {gridRates.map((r) => (
        <g key={r} className="text-muted-foreground">
          <line
            x1={padL}
            x2={width - padR}
            y1={y(r)}
            y2={y(r)}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.3}
          />
          <text
            x={padL - 6}
            y={y(r) + 3}
            textAnchor="end"
            fontSize={9}
            fill="currentColor"
          >
            {`${String(Math.round(r * 100))}%`}
          </text>
        </g>
      ))}

      {/* apply 마커(세로선) */}
      {applyEvents.map((e, i) => (
        <line
          key={`${e.at}-${String(i)}`}
          x1={x(e.at)}
          x2={x(e.at)}
          y1={padT}
          y2={padT + innerH}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 2"
          className="text-info"
          opacity={0.7}
        >
          <title>{`개선 적용 · ${e.targetKind} ${e.targetPath} (${e.at.slice(0, 10)})`}</title>
        </line>
      ))}

      {/* 추세선 */}
      {drawn.length >= 2 && (
        <polyline
          points={linePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-foreground"
        />
      )}

      {/* 점(표본 적으면 흐리게) */}
      {drawn.map((p) => {
        const low = p.sessions < lowSampleBelow;
        return (
          <circle
            key={p.periodStart}
            cx={x(p.periodStart)}
            cy={y(p.correctionRate)}
            r={low ? 2 : 3}
            className={cn(low ? "text-muted-foreground" : "text-foreground")}
            fill="currentColor"
            opacity={low ? 0.45 : 1}
          >
            <title>{`${p.periodStart} · 정정 ${String(p.corrections)}/${String(p.invocations)} (${String(Math.round(p.correctionRate * 100))}%) · 세션 ${String(p.sessions)}${low ? " · 표본 적음" : ""}`}</title>
          </circle>
        );
      })}

      {/* x 라벨(처음·끝) */}
      {drawn.length > 0 && (
        <g className="text-muted-foreground">
          <text x={padL} y={height - 6} textAnchor="start" fontSize={9} fill="currentColor">
            {drawn[0]?.periodStart.slice(5)}
          </text>
          <text x={width - padR} y={height - 6} textAnchor="end" fontSize={9} fill="currentColor">
            {drawn[drawn.length - 1]?.periodStart.slice(5)}
          </text>
        </g>
      )}
    </svg>
  );
}
```

> 주: `y(rate)` 의 `padT + (1 - 0) * 0 + rate * innerH` 는 `padT + rate * innerH` 와 같다(가독성용 0 항 제거 가능). rate=0 → 위 padT 가 아니라 아래여야 하므로 식을 다음으로 둔다: `const y = (rate: number) => padT + (1 - rate) * innerH;` — **Step 1 작성 시 이 정정된 식을 쓴다.**

- [ ] **Step 2: y 식 정정 확인**

`compounding-trend-chart.tsx` 의 `y` 정의가 다음과 정확히 일치하는지 본다(위 주석대로):

```typescript
  const y = (rate: number) => padT + (1 - rate) * innerH;
```

- [ ] **Step 3: 타입·빌드 통과 확인**

Run: `cd apps/web && corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/domains/registry/components/overview/compounding-trend-chart.tsx
git commit -m "feat(web): 순수 SVG 정정비율 추세 차트(apply 마커·표본 흐림)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 섹션 래퍼 (패칭·상태·캐비앗)

**Files:**
- Create: `apps/web/src/domains/registry/components/overview/compounding-trend-section.tsx`

`activity-section.tsx`(이 폴더) 패턴을 따른다. projectId 없으면 안내, 표본 부족이면 "데이터 부족", 항상 캐비앗(signalNote) 노출.

- [ ] **Step 1: 컴포넌트 작성**

`apps/web/src/domains/registry/components/overview/compounding-trend-section.tsx`:

```typescript
import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";
import { EmptyState, ErrorNotice, Loading } from "../../../../lib/ui";
import { useCompoundingTrend } from "../../use-registry";
import { CompoundingTrendChart } from "./compounding-trend-chart";

interface Props {
  projectId: string | null;
}

// 개요 최상단 — "내 하네스 엔지니어링이 복리가 되고 있나"(이 프로젝트).
// 정정비율(정정왕복÷발화) 주별 추세 + 개선안 적용 마커. ⚠️ reference signal.
export function CompoundingTrendSection({ projectId }: Props) {
  const { data, isPending, isError, error } = useCompoundingTrend(projectId);

  return (
    <Card className="space-y-3 border-l-2 border-primary/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">하네스 복리 추세</h2>
          <Badge variant="outline" className="text-[10px]">
            이 프로젝트
          </Badge>
          <span className="text-xs text-muted-foreground">
            정정비율 · 주별 · 낮을수록 좋음
          </span>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground tabular-nums">
            세션 {data.totalSessions} · 발화 {data.totalInvocations} · 적용 마커{" "}
            {data.applyEvents.length}
          </p>
        )}
      </div>

      {projectId === null && (
        <EmptyState
          title="프로젝트를 고르면 복리 추세가 보여요"
          hint="아래 '자산 헬스'에서도 같은 프로젝트가 선택됩니다."
        />
      )}
      {projectId !== null && isPending && <Loading label="추세 불러오는 중…" />}
      {isError && <ErrorNotice error={error} />}
      {data && data.points.length < 2 && (
        <EmptyState
          title="추세를 그리기엔 데이터가 적어요"
          hint="작업 세션이 여러 주에 걸쳐 쌓이면 정정비율 추세가 그려집니다."
        />
      )}
      {data && data.points.length >= 2 && (
        <CompoundingTrendChart
          points={data.points}
          applyEvents={data.applyEvents}
        />
      )}

      {data && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {data.signalNote}
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: 타입 통과 확인**

Run: `cd apps/web && corepack pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/registry/components/overview/compounding-trend-section.tsx
git commit -m "feat(web): 복리 추세 섹션(상태·표본가드·정직성 캐비앗)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 개요탭 배치 — 선택기 상단 이동·잔디 강등

**Files:**
- Modify: `apps/web/src/domains/registry/components/overview-view.tsx`

추세는 프로젝트 단위라 선택기가 그 위에 있어야 한다. 헬스 카드 헤더에 박힌 프로젝트 Select 를 최상단 스코프 바로 끌어올려 추세·헬스를 한 스코프로 묶는다. 활동 잔디는 최하단으로 강등.

최종 순서: [프로젝트 스코프 바] → [복리 추세(프로젝트)] → [사용량 리더보드(전역)] → [자산 헬스(프로젝트, 선택기 제거)] → [활동 잔디(전역, 강등)].

- [ ] **Step 1: overview-view.tsx 전체 교체**

`apps/web/src/domains/registry/components/overview-view.tsx` 를 다음으로 교체:

```typescript
import type { ProjectWorkspaceMode } from "@opspilot/shared-types";
import { ArrowRight } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Loading } from "../../../lib/ui";
import { useProjects } from "../../project/use-project";
import { ActivitySection } from "./overview/activity-section";
import { CompoundingTrendSection } from "./overview/compounding-trend-section";
import { HealthSummaryCards } from "./overview/health-summary-cards";
import { UsageLeaderboard } from "./usage-leaderboard";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string | null) => void;
  onOpenProjectTab?: () => void;
}

function modeLabel(mode: ProjectWorkspaceMode): string {
  return mode === "linked" ? "로컬 연결" : "관리 클론";
}

function modeBadgeVariant(mode: ProjectWorkspaceMode): "success" | "secondary" {
  return mode === "linked" ? "success" : "secondary";
}

// 개요(overview) = OpsPilot 첫 진입. 위→아래:
// (1) 프로젝트 스코프 바 — "이 프로젝트" 섹션(추세·헬스)을 한 선택으로 묶는다.
// (2) 하네스 복리 추세 — 이 프로젝트(North Star: 복리가 되고 있나).
// (3) 사용량 리더보드 — 전역. (4) 자산 헬스 — 이 프로젝트.
// (5) 활동 잔디 — 전역(사용량 신호라 최하단으로 강등).
export function OverviewView({
  projectId,
  onProjectIdChange,
  onOpenProjectTab,
}: Props) {
  const { data: projects, isPending: projectsPending } = useProjects();

  return (
    <div className="space-y-4">
      {/* (1) 프로젝트 스코프 바 — 추세·헬스 공통 선택기 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">이 프로젝트</span>
          <Badge variant="outline" className="text-[10px]">
            추세·헬스 스코프
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[220px]">
            <Select
              value={projectId ?? ""}
              onValueChange={(id) => onProjectIdChange(id)}
              disabled={projectsPending}
            >
              <SelectTrigger>
                {projectsPending ? (
                  <Loading label="프로젝트 불러오는 중…" />
                ) : (
                  <SelectValue
                    placeholder={
                      projects && projects.length > 0
                        ? "프로젝트 선택"
                        : "등록된 프로젝트 없음"
                    }
                  />
                )}
              </SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span>
                        {p.name} ({p.defaultBranch ?? "?"})
                      </span>
                      <Badge
                        variant={modeBadgeVariant(p.workspaceMode)}
                        className="shrink-0 text-[10px]"
                      >
                        {modeLabel(p.workspaceMode)}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenProjectTab?.()}>
            프로젝트 탭에서 자세히
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* (2) 하네스 복리 추세 — 이 프로젝트 (North Star) */}
      <CompoundingTrendSection projectId={projectId} />

      {/* (3) 사용량 리더보드 — 전역 */}
      <UsageLeaderboard />

      {/* (4) 자산 헬스 — 이 프로젝트 */}
      <Card className="space-y-3 border-l-2 border-primary/40 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">자산 헬스</h2>
          <Badge variant="outline" className="text-[10px]">
            이 프로젝트
          </Badge>
        </div>
        <HealthSummaryCards projectId={projectId} />
      </Card>

      {/* (5) 활동 잔디 — 전역(사용량 신호, 최하단 강등) */}
      <ActivitySection />
    </div>
  );
}
```

- [ ] **Step 2: 타입·빌드 통과 확인**

Run: `cd apps/web && corepack pnpm typecheck && corepack pnpm build`
Expected: 둘 다 PASS (build = tsc + vite build 성공)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/domains/registry/components/overview-view.tsx
git commit -m "feat(web): 개요 최상단을 복리 추세로 — 선택기 상단 이동·잔디 강등

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 전체 검증 + Playwright 실연동

**Files:** (코드 변경 없음 — 회귀·실데이터 확인. 수정 필요 시 해당 태스크로 돌아가 고친다.)

- [ ] **Step 1: 모노레포 정적 검증**

Run:
```bash
corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build
```
Expected: 전부 PASS. 실패 시 메시지대로 고치고 해당 태스크 커밋에 fixup.

- [ ] **Step 2: 서버 vitest 회귀**

Run: `cd apps/server && corepack pnpm test`
Expected: 기존 + 신규(compounding-trend) 테스트 전부 PASS.

- [ ] **Step 3: 영속 스택 기동 (실데이터)**

CLAUDE.md 영속 기동 규약대로. 시작 전 stale kill.
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; lsof -ti:5173 | xargs kill -9 2>/dev/null; true
cd apps/server && OPS_PROJECTS_DIR=~/Documents/ryu-qqq corepack pnpm dev &
cd apps/web && corepack pnpm dev &
# 기동 확인:
curl -s http://localhost:3001/api/runs >/dev/null && echo "server ok"
```

- [ ] **Step 4: Playwright 실연동 확인**

Playwright MCP 로:
1. `browser_navigate` → `http://localhost:5173`
2. 개요탭에서 상단 스코프 바의 프로젝트 Select 를 연다.
3. 개선안이 쌓인 프로젝트(예: **platform-gitops** 또는 terraform-modules) 선택.
4. `browser_snapshot` 으로 확인:
   - 최상단이 "하네스 복리 추세" 카드인가(잔디 아님).
   - 데이터가 2주 이상이면 SVG 선이 그려지는가 / 적으면 "데이터 적음" 안내인가.
   - apply 마커(세로 점선)가 있고 hover 시 대상 경로 title 이 뜨는가(`browser_hover` 후 확인).
   - 캐비앗 문구(정정비율·인과 아님)가 카드 하단에 보이는가.
   - 활동 잔디가 최하단에 있는가.
5. `browser_console_messages` 로 에러 0 확인.

Expected: 위 모두 충족. 깨지면 원인 태스크로 복귀 수정.

- [ ] **Step 5: 정리**

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; lsof -ti:5173 | xargs kill -9 2>/dev/null; true
```

- [ ] **Step 6: (선택) Engineering OS·journal 기록**

CLAUDE.md 작업 루프 6번대로 Task 완료 시 Notion `상태`→`완료`, Wiki ADR·Commit 기록. 별도 진행.

---

## Self-Review

**스펙 커버리지(2026-06-06 설계 문서 대조):**
- 정정 효를 주축으로 → Task 2(`aggregateTrendPoints`, correctionRate). ✓
- 프로젝트 단위 고도 → Task 3(`compoundingTrendForProject`, clonePath 매핑). ✓
- 정정 *비율*(횟수 아님) → Task 1 스키마 `correctionRate` + Task 2 계산. ✓
- 시간축 first_seen(scanned_at 아님) → Task 2 `aggregateTrendPoints` 가 `firstSeen` 만 사용. ✓
- 주 버킷 → Task 2 `isoWeekStart`. ✓
- apply 마커 → Task 2 `aggregateApplyEvents` + Task 6 세로선. ✓
- 교란·표본·"인과 아님" 화면 명시 → Task 3 `COMPOUNDING_SIGNAL_NOTE` + Task 6 표본 흐림 + Task 7 캐비앗·표본가드. ✓
- 단일 복리 점수 없음 → 점수 합산 로직 없음(신호만 나란히). ✓
- 잔디 자리 대체·강등 → Task 8 순서 변경. ✓
- 002-3 압력 뷰는 드릴다운으로(스코프 밖, 후속) → 본 계획은 추세만, 압력 뷰 변경 없음. ✓
- 스키마 변경 없음 → ALTER 없음, 읽기 집계만. ✓

**플레이스홀더 스캔:** TBD/TODO 없음. 모든 코드 단계에 실제 코드. apply 마커 시각 근사(created_at)는 스키마 주석·캐비앗에 명시된 의도적 결정이지 미완이 아님.

**타입 일관성:** `CompoundingTrend`/`CompoundingTrendPoint`/`CompoundingApplyEvent` 가 Task 1 정의 → Task 2·3·6 에서 동일 이름으로 소비. `compoundingTrendForProject`·`getCompoundingTrend`·`useCompoundingTrend`·`CompoundingTrendChart`·`CompoundingTrendSection` 이름 일관. `aggregateTrendPoints`/`aggregateApplyEvents`/`isoWeekStart` Task 2 정의 ↔ Task 3 소비 일치. 라우트 경로 `/api/usage/compounding-trend` 서버(Task 4)·프론트(Task 5) 일치.

**알려진 리스크(설계 문서 열린 질문 재확인):** first_seen 이 재스캔에 덮어써지지 않는지는 `upsertWorkMetrics` 가 `first_seen = excluded.first_seen` 로 갱신하므로, 같은 세션의 transcript 시각이 안정적이면 동일값 유지(스캔마다 같은 JSONL 시각). 만약 흔들리면 Task 9 Playwright 단계에서 추세가 비현실적으로 출렁이는지 확인하고, 후속에서 first_seen 고정(첫 삽입 시만 기록) 보강을 검토.
