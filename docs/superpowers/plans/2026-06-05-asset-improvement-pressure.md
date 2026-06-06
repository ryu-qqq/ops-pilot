# 자산별 개선 압력 뷰 — 구현 계획 (의제 002-3 1단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트의 하네스 자산별로 개선 압력 신호(개선안 누적 + 정정 왕복)를 모아 압력 순으로 보여주는 읽기전용 집계 뷰를 만든다.

**Architecture:** 새 `asset-pressure` 도메인이 `improvement_proposal`(feedback)과 `asset_work_metric`(usage) 두 테이블을 가로질러 읽는다. 자의적 가중합 없이 신호를 투명하게 행으로 나열하고 정렬만 한다. 스키마 변경 없음 — 새 읽기 엔드포인트 하나와 프론트 자산 헬스 카드 확장.

**Tech Stack:** Fastify + Zod (fastify-type-provider-zod), better-sqlite3, `@opspilot/shared-types`, vitest(서버), React + TanStack Query(웹, vitest 없음 → Playwright 수동 검증).

**Spec:** `docs/superpowers/specs/2026-06-05-asset-improvement-pressure-design.md`

---

## 설계 결정 (실행 전 합의된 것)

- **신호는 둘:** 개선안 누적(미처리 draft·approved / 반영 applied / 거절 rejected를 분리 카운트), 정정 왕복(`correction_roundtrips` 합). 평가 실패는 스코프 밖.
- **행 = 신호 합집합.** 스캔된 `asset` 테이블 기준이 아니다. proposal은 `target_path`로 그룹, work_metric은 `kind:name`으로 그룹. **두 차원이 달라 1단계는 억지로 한 자산으로 머지하지 않는다** — 같은 식별자면 한 행, 아니면 각자 행으로 가진 신호 열만 채운다(나머지 0/null).
- **점수 합산 금지.** `riskLevel` 같은 계산 등급도 만들지 않는다(spec 명시). 정렬 기본값만 둔다.
- **reference signal 라벨링.** correction_roundtrips는 품질 점수가 아니므로 응답에 `signalNote`를 둔다(기존 `projectWorkMetricReportSchema` 관행).

## 파일 구조

**백엔드 (신규 도메인):**
- `apps/server/src/domains/asset-pressure/repository.ts` — proposal 집계 SQL 한 함수.
- `apps/server/src/domains/asset-pressure/repository.test.ts` — proposal 집계 단위 테스트.
- `apps/server/src/domains/asset-pressure/service.ts` — proposal 집계 + work_metric(기존 함수 재사용) 합쳐 행 배열 생성·정렬.
- `apps/server/src/domains/asset-pressure/service.test.ts` — 행 생성·정렬·머지 단위 테스트.
- `apps/server/src/routes/api/asset-pressure.ts` — `GET /api/asset-pressure`.

**공유 타입:**
- `packages/shared-types/src/domain.ts` — 응답 스키마 추가(파일 말미).

**프론트 (신규 도메인 + 기존 카드 확장):**
- `apps/web/src/domains/asset-pressure/api.ts` — Query Key Factory + fetch.
- `apps/web/src/domains/asset-pressure/use-asset-pressure.ts` — `useAssetPressure` hook.
- `apps/web/src/domains/registry/components/overview/health-summary-cards.tsx` — "개선 압력" 섹션 추가(수정).

**재사용(수정 안 함):**
- `apps/server/src/domains/usage/work-metric-repository.ts:79` `listWorkMetricsForClone(clonePath)` — work_metric 행 조회.
- `apps/server/src/domains/feedback/repository.ts:196` `listProposalsByProject` — SQL 매핑 패턴 선례.
- project 조회로 `clonePath` 얻기 — `apps/server/src/domains/project/` 의 단건 조회 함수(실행 시 선례 확인: `getProjectById`/`findProject` 류).

---

## Task 1: shared-types 응답 스키마

**Files:**
- Modify: `packages/shared-types/src/domain.ts` (파일 말미에 추가)

`improvementProposalStatusSchema`, `improvementTargetKindSchema`, 헬퍼 `id`/`ts`/`z`는 같은 파일에 이미 정의돼 있으니 그대로 참조한다.

- [ ] **Step 1: 스키마와 타입 추가**

`packages/shared-types/src/domain.ts` 말미에 추가:

```typescript
// === 자산별 개선 압력 (의제 002-3) ===
// 신호를 투명하게 나열만 한다 — 자의적 가중합/등급 없음. correction 은 reference signal.

export const assetPressureProposalCountsSchema = z.object({
  draft: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
export type AssetPressureProposalCounts = z.infer<typeof assetPressureProposalCountsSchema>;

export const assetPressureRowSchema = z.object({
  // 식별 라벨. proposal 행이면 target_path, work_metric 행이면 "kind:name".
  label: z.string().min(1),
  // work_metric 행이면 agent|skill, proposal 행이면 해당 targetKind, 알 수 없으면 null.
  kind: z.string().nullable(),
  proposals: assetPressureProposalCountsSchema,
  // reference signal — 품질 점수가 아니다.
  correctionRoundtrips: z.number().int().nonnegative(),
  // work_metric 행에서 그 자산이 등장한 세션 수(proposal-only 행이면 0).
  sessions: z.number().int().nonnegative(),
  // 가장 최근 신호 시각(proposal createdAt 또는 work_metric last_seen). 없으면 null.
  lastSignalAt: ts.nullable(),
});
export type AssetPressureRow = z.infer<typeof assetPressureRowSchema>;

export const assetPressureReportSchema = z.object({
  signalType: z.literal("reference"),
  signalNote: z.string(),
  projectId: id,
  rows: z.array(assetPressureRowSchema),
});
export type AssetPressureReport = z.infer<typeof assetPressureReportSchema>;
```

- [ ] **Step 2: 빌드로 타입 검증**

Run: `corepack pnpm -r typecheck`
Expected: PASS (shared-types 컴파일 통과)

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/domain.ts
git commit -m "feat(shared-types): 자산 개선 압력 응답 스키마 (의제 002-3)"
```

---

## Task 2: repository — proposal 자산별 집계

proposal을 `target_path`로 그룹해 status별 카운트와 최근 시각을 낸다. `ingest_bundle.project_id`로 프로젝트를 좁힌다(선례: `feedback/repository.ts:196` 의 JOIN).

**Files:**
- Create: `apps/server/src/domains/asset-pressure/repository.ts`
- Test: `apps/server/src/domains/asset-pressure/repository.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/asset-pressure/repository.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, resetDbForTest } from "../../db/index.js";
import { countProposalsByAssetForProject } from "./repository.js";

// 테스트 헬퍼: 최소 ingest_bundle + proposal 삽입.
function seedProposal(projectId: string, targetPath: string, status: string) {
  const db = getDb();
  const ingestId = randomUUID();
  db.prepare(
    `INSERT INTO ingest_bundle (id, project_id, notion_task_url, git_ref, diff_summary, context_json, status, ingest_trigger, created_at)
     VALUES (?, ?, NULL, 'abc123', '', '{}', 'reviewed', 'auto', '2026-06-05T00:00:00.000Z')`,
  ).run(ingestId, projectId);
  db.prepare(
    `INSERT INTO improvement_proposal (id, ingest_id, run_id, target_kind, target_path, rationale, content, status, applied_commit, created_at)
     VALUES (?, ?, NULL, 'cursor_rule', ?, 'r', 'c', ?, NULL, '2026-06-05T01:00:00.000Z')`,
  ).run(randomUUID(), ingestId, targetPath, status);
}

describe("countProposalsByAssetForProject", () => {
  beforeEach(() => resetDbForTest());
  afterEach(() => resetDbForTest());

  it("target_path 별로 status 카운트를 집계한다", () => {
    const projectId = randomUUID();
    seedProposal(projectId, ".cursor/rules/foo.mdc", "draft");
    seedProposal(projectId, ".cursor/rules/foo.mdc", "applied");
    seedProposal(projectId, ".cursor/rules/bar.mdc", "draft");

    const rows = countProposalsByAssetForProject(projectId);

    const foo = rows.find((r) => r.targetPath === ".cursor/rules/foo.mdc");
    expect(foo).toBeDefined();
    expect(foo!.draft).toBe(1);
    expect(foo!.applied).toBe(1);
    expect(foo!.approved).toBe(0);
    expect(rows).toHaveLength(2);
  });

  it("다른 프로젝트의 proposal 은 섞지 않는다", () => {
    const a = randomUUID();
    const b = randomUUID();
    seedProposal(a, ".cursor/rules/foo.mdc", "draft");
    seedProposal(b, ".cursor/rules/foo.mdc", "draft");

    expect(countProposalsByAssetForProject(a)).toHaveLength(1);
  });
});
```

> 참고: `resetDbForTest`/`getDb` 의 정확한 export 위치는 실행 시 `apps/server/src/db/` 에서 확인한다(기존 `*.test.ts` 가 쓰는 동일 헬퍼를 그대로 import). ingest_bundle 컬럼명(`ingest_trigger`, `diff_summary`, `context_json`)은 `schema.sql:140` 영역 기준 — 삽입 실패 시 schema.sql 의 실제 컬럼에 맞춘다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/asset-pressure/repository.test.ts`
Expected: FAIL ("countProposalsByAssetForProject is not a function" 또는 모듈 없음)

- [ ] **Step 3: repository 구현**

`apps/server/src/domains/asset-pressure/repository.ts`:

```typescript
import { getDb } from "../../db/index.js";

export interface ProposalAssetCountRow {
  targetPath: string;
  targetKind: string;
  draft: number;
  approved: number;
  applied: number;
  rejected: number;
  lastCreatedAt: string | null;
}

/**
 * 프로젝트의 improvement_proposal 을 target_path 별로 status 카운트 집계.
 * ingest_bundle.project_id 로 프로젝트를 좁힌다(선례: feedback/repository.ts:196).
 */
export function countProposalsByAssetForProject(projectId: string): ProposalAssetCountRow[] {
  const sql = `
    SELECT p.target_path AS targetPath,
           MIN(p.target_kind) AS targetKind,
           SUM(CASE WHEN p.status = 'draft' THEN 1 ELSE 0 END) AS draft,
           SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN p.status = 'applied' THEN 1 ELSE 0 END) AS applied,
           SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
           MAX(p.created_at) AS lastCreatedAt
    FROM improvement_proposal p
    JOIN ingest_bundle ib ON p.ingest_id = ib.id
    WHERE ib.project_id = ?
    GROUP BY p.target_path
  `;
  const rows = getDb().prepare(sql).all(projectId) as Record<string, unknown>[];
  return rows.map((row) => ({
    targetPath: row.targetPath as string,
    targetKind: row.targetKind as string,
    draft: Number(row.draft),
    approved: Number(row.approved),
    applied: Number(row.applied),
    rejected: Number(row.rejected),
    lastCreatedAt: (row.lastCreatedAt as string | null) ?? null,
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/asset-pressure/repository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/domains/asset-pressure/repository.ts apps/server/src/domains/asset-pressure/repository.test.ts
git commit -m "feat(asset-pressure): proposal 자산별 status 집계 repository"
```

---

## Task 3: service — 두 신호 합쳐 행 배열·정렬

proposal 집계(Task 2)와 work_metric(기존 `listWorkMetricsForClone`)을 합쳐 `AssetPressureRow[]` 를 만든다. 두 신호는 식별 차원이 달라 **머지하지 않고** 각자 행으로 둔다. proposal 행 label = `targetPath`, work_metric 행 label = `kind:name`. 정렬: 미처리(draft+approved) 내림차순, 동률이면 correctionRoundtrips 내림차순.

**Files:**
- Create: `apps/server/src/domains/asset-pressure/service.ts`
- Test: `apps/server/src/domains/asset-pressure/service.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/asset-pressure/service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildAssetPressureRows } from "./service.js";

describe("buildAssetPressureRows", () => {
  it("proposal 행과 work_metric 행을 각자 만들고 미처리 순 정렬한다", () => {
    const proposalCounts = [
      { targetPath: ".cursor/rules/low.mdc", targetKind: "cursor_rule", draft: 1, approved: 0, applied: 5, rejected: 0, lastCreatedAt: "2026-06-05T01:00:00.000Z" },
      { targetPath: ".cursor/rules/high.mdc", targetKind: "cursor_rule", draft: 3, approved: 1, applied: 0, rejected: 0, lastCreatedAt: "2026-06-05T02:00:00.000Z" },
    ];
    const workMetrics = [
      { kind: "agent", name: "work-evaluator", correctionRoundtrips: 4, sessions: 2, lastSeen: "2026-06-05T03:00:00.000Z" },
    ];

    const rows = buildAssetPressureRows(proposalCounts, workMetrics);

    // 미처리(draft+approved): high=4, work-evaluator=0(미처리 없음), low=1 → high 먼저.
    expect(rows[0].label).toBe(".cursor/rules/high.mdc");
    expect(rows[0].proposals.draft).toBe(3);
    expect(rows[0].correctionRoundtrips).toBe(0);

    const wm = rows.find((r) => r.label === "agent:work-evaluator");
    expect(wm).toBeDefined();
    expect(wm!.correctionRoundtrips).toBe(4);
    expect(wm!.sessions).toBe(2);
    expect(wm!.proposals.applied).toBe(0);
    expect(rows).toHaveLength(3);
  });

  it("미처리 동률이면 correctionRoundtrips 로 정렬한다", () => {
    const rows = buildAssetPressureRows(
      [],
      [
        { kind: "agent", name: "a", correctionRoundtrips: 1, sessions: 1, lastSeen: null },
        { kind: "agent", name: "b", correctionRoundtrips: 7, sessions: 1, lastSeen: null },
      ],
    );
    expect(rows[0].label).toBe("agent:b");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/asset-pressure/service.test.ts`
Expected: FAIL ("buildAssetPressureRows is not a function")

- [ ] **Step 3: service 구현**

`apps/server/src/domains/asset-pressure/service.ts`:

```typescript
import type { AssetPressureReport, AssetPressureRow } from "@opspilot/shared-types";
import { listWorkMetricsForClone } from "../usage/work-metric-repository.js";
import { countProposalsByAssetForProject, type ProposalAssetCountRow } from "./repository.js";

const SIGNAL_NOTE =
  "개선 압력은 참고 신호입니다 — 품질 점수가 아니라 '다음에 손볼 자산'을 좁히는 용도입니다.";

// work_metric 을 (kind:name) 으로 그룹한 최소 입력 형태.
export interface WorkMetricAggInput {
  kind: string;
  name: string;
  correctionRoundtrips: number;
  sessions: number;
  lastSeen: string | null;
}

function unprocessed(row: AssetPressureRow): number {
  return row.proposals.draft + row.proposals.approved;
}

/** 순수 함수 — proposal 집계 + work_metric 집계를 행 배열로. 머지하지 않고 각자 행. */
export function buildAssetPressureRows(
  proposalCounts: ProposalAssetCountRow[],
  workMetrics: WorkMetricAggInput[],
): AssetPressureRow[] {
  const proposalRows: AssetPressureRow[] = proposalCounts.map((p) => ({
    label: p.targetPath,
    kind: p.targetKind,
    proposals: { draft: p.draft, approved: p.approved, applied: p.applied, rejected: p.rejected },
    correctionRoundtrips: 0,
    sessions: 0,
    lastSignalAt: p.lastCreatedAt,
  }));

  const workRows: AssetPressureRow[] = workMetrics.map((w) => ({
    label: `${w.kind}:${w.name}`,
    kind: w.kind,
    proposals: { draft: 0, approved: 0, applied: 0, rejected: 0 },
    correctionRoundtrips: w.correctionRoundtrips,
    sessions: w.sessions,
    lastSignalAt: w.lastSeen,
  }));

  return [...proposalRows, ...workRows].sort((a, b) => {
    const byUnprocessed = unprocessed(b) - unprocessed(a);
    if (byUnprocessed !== 0) return byUnprocessed;
    return b.correctionRoundtrips - a.correctionRoundtrips;
  });
}

/**
 * work_metric row(세션×자산)를 (kind:name) 으로 그룹: correctionRoundtrips 합·세션 수·최근 last_seen.
 */
export function aggregateWorkMetrics(
  rows: { kind: string; name: string; correctionRoundtrips: number; lastSeen: string | null }[],
): WorkMetricAggInput[] {
  const byKey = new Map<string, WorkMetricAggInput>();
  for (const r of rows) {
    const key = `${r.kind}:${r.name}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        kind: r.kind,
        name: r.name,
        correctionRoundtrips: r.correctionRoundtrips,
        sessions: 1,
        lastSeen: r.lastSeen,
      });
    } else {
      cur.correctionRoundtrips += r.correctionRoundtrips;
      cur.sessions += 1;
      if (r.lastSeen && (!cur.lastSeen || r.lastSeen > cur.lastSeen)) cur.lastSeen = r.lastSeen;
    }
  }
  return [...byKey.values()];
}

/** 엔드포인트 진입점 — 프로젝트 clonePath 로 work_metric 을, projectId 로 proposal 을 집계. */
export function getAssetPressureReport(projectId: string, clonePath: string): AssetPressureReport {
  const proposalCounts = countProposalsByAssetForProject(projectId);
  const rawWorkMetrics = listWorkMetricsForClone(clonePath);
  const workAgg = aggregateWorkMetrics(
    rawWorkMetrics.map((m) => ({
      kind: m.kind,
      name: m.name,
      correctionRoundtrips: m.correctionRoundtrips,
      lastSeen: m.lastSeen ?? null,
    })),
  );
  return {
    signalType: "reference",
    signalNote: SIGNAL_NOTE,
    projectId,
    rows: buildAssetPressureRows(proposalCounts, workAgg),
  };
}
```

> 참고: `listWorkMetricsForClone` 반환 행의 정확한 필드명(`correctionRoundtrips`/`correction_roundtrips`, `lastSeen`/`last_seen`)은 실행 시 `usage/work-metric-repository.ts:79` 에서 확인해 `.map` 을 맞춘다. camelCase 매핑이 이미 돼 있으면 그대로, snake 면 변환.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/asset-pressure/service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/domains/asset-pressure/service.ts apps/server/src/domains/asset-pressure/service.test.ts
git commit -m "feat(asset-pressure): 두 신호 합쳐 행 배열·정렬 service"
```

---

## Task 4: route — GET /api/asset-pressure

`projectId` 쿼리로 받아 프로젝트의 `clonePath` 를 조회한 뒤 `getAssetPressureReport` 를 반환. 라우트 패턴은 `routes/api/feedback.ts` 선례를 따른다(autoload 자동 등록).

**Files:**
- Create: `apps/server/src/routes/api/asset-pressure.ts`

- [ ] **Step 1: 라우트 구현**

`apps/server/src/routes/api/asset-pressure.ts`:

```typescript
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assetPressureReportSchema, errorSchema } from "@opspilot/shared-types";
import { getAssetPressureReport } from "../../domains/asset-pressure/service.js";
import { getProjectById } from "../../domains/project/repository.js";

const assetPressure: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/asset-pressure",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid() }),
        response: { 200: assetPressureReportSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const project = getProjectById(req.query.projectId);
      if (!project) {
        return reply.status(404).send({ error: "NotFound", detail: "project not found" });
      }
      return getAssetPressureReport(project.id, project.clonePath);
    },
  );
};

export default assetPressure;
```

> 참고: `getProjectById` 의 정확한 이름·반환 필드(`clonePath`)와 `errorSchema` export 여부는 실행 시 확인한다 — project 도메인 단건 조회 함수가 다른 이름이면 그것을 쓰고, `errorSchema` 가 shared-types에 없으면 feedback 라우트가 쓰는 동일 에러 스키마를 import한다.

- [ ] **Step 2: 타입·빌드 검증**

Run: `corepack pnpm -r typecheck`
Expected: PASS

- [ ] **Step 3: 엔드포인트 수동 확인 (격리 DB)**

Run:
```bash
cd apps/server && OPS_DB_PATH=/tmp/ap-test.sqlite corepack pnpm dev &
# 기동 후 (포트 3001):
curl -s "http://localhost:3001/api/asset-pressure?projectId=$(uuidgen)" | head -c 200
```
Expected: 404 JSON(`{"error":"NotFound",...}`) — 존재하지 않는 projectId라서. 정상 응답 형태 확인 후 dev 종료(`lsof -ti:3001 | xargs kill`).

> 영속 DB가 아니라 임시 `OPS_DB_PATH` 로 격리(CLAUDE.md 운영 함정). 검증 후 스테일 프로세스 kill.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/api/asset-pressure.ts
git commit -m "feat(asset-pressure): GET /api/asset-pressure 라우트"
```

---

## Task 5: 프론트 데이터 레이어 (api + hook)

Query Key Factory + fetch + `useQuery` hook. 선례: `registry/api.ts:28`, `registry/use-registry.ts:25`.

**Files:**
- Create: `apps/web/src/domains/asset-pressure/api.ts`
- Create: `apps/web/src/domains/asset-pressure/use-asset-pressure.ts`

- [ ] **Step 1: api.ts 작성**

`apps/web/src/domains/asset-pressure/api.ts`:

```typescript
import { assetPressureReportSchema, type AssetPressureReport } from "@opspilot/shared-types";
import { apiGet } from "../../lib/api-client"; // 선례: registry/api.ts 가 쓰는 동일 fetch 래퍼

export const assetPressureKeys = {
  all: ["asset-pressure"] as const,
  report: (projectId: string) => [...assetPressureKeys.all, projectId] as const,
};

export async function getAssetPressure(projectId: string): Promise<AssetPressureReport> {
  const raw = await apiGet(`/api/asset-pressure?projectId=${encodeURIComponent(projectId)}`);
  return assetPressureReportSchema.parse(raw);
}
```

> 참고: `apiGet`/fetch 래퍼의 정확한 import 경로·이름은 실행 시 `registry/api.ts` 가 쓰는 것을 그대로 따른다(프로젝트 공통 클라이언트). 응답 `.parse` 검증도 기존 api 들의 관행을 따른다.

- [ ] **Step 2: hook 작성**

`apps/web/src/domains/asset-pressure/use-asset-pressure.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { assetPressureKeys, getAssetPressure } from "./api";

export function useAssetPressure(projectId: string | null) {
  return useQuery({
    queryKey: assetPressureKeys.report(projectId ?? "none"),
    queryFn: () => getAssetPressure(projectId ?? ""),
    enabled: projectId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: 타입·빌드 검증**

Run: `corepack pnpm -r typecheck && cd apps/web && corepack pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/domains/asset-pressure/
git commit -m "feat(asset-pressure): 프론트 api·hook"
```

---

## Task 6: designer 스펙 — 자산 헬스 카드에 "개선 압력" 표면화

UI 레이아웃은 `opspilot-designer` 가 정한다. 이 태스크는 코드가 아니라 **설계 입력 산출**이다.

**Files:** (코드 변경 없음 — 스펙 산출)

- [ ] **Step 1: designer 호출**

`opspilot-designer` 에 다음을 의뢰:
- 위치: 개요탭 `health-summary-cards.tsx`(현재 미사용·형식 헬스 4 stat 카드) 맥락에 "개선 압력" 섹션을 어떻게 붙일지.
- 데이터: `AssetPressureReport.rows` — 각 행 `{ label, kind, proposals{draft,approved,applied,rejected}, correctionRoundtrips, sessions, lastSignalAt }`. 이미 미처리 순 정렬돼 옴.
- 요구: 신호를 **투명하게 나란히**(점수 합산·등급 없음). 미처리 개선안 수가 1차 눈길. correction 은 reference signal임을 `signalNote`로 명시(품질 점수 오독 방지). 압력 0 자산은 응답에 없음(빈 상태 카피 필요).
- 제약: 토스 4원칙, 기존 shadcn 패턴·CSS 변수 토큰, 자산 헬스 카드의 기존 톤과 일관.
- 산출: 정보구조·레이아웃·상태(로딩/빈/에러)·컴포넌트 매핑 스펙.

- [ ] **Step 2: 스펙을 plan 옆에 기록**

designer 산출을 `docs/superpowers/specs/2026-06-05-asset-pressure-ui.md` 로 저장하고 commit:

```bash
git add docs/superpowers/specs/2026-06-05-asset-pressure-ui.md
git commit -m "docs(spec): 자산 개선 압력 UI 설계 (designer)"
```

---

## Task 7: 프론트 UI — 자산 헬스 카드 확장

designer 스펙(Task 6)을 입력으로 `opspilot-frontend-dev` 가 구현. `useAssetPressure`(Task 5)를 소비해 개요탭 자산 헬스 영역에 개선 압력 섹션을 렌더.

**Files:**
- Modify: `apps/web/src/domains/registry/components/overview/health-summary-cards.tsx` (또는 designer가 지정한 인접 신규 컴포넌트)

- [ ] **Step 1: 구현**

designer 스펙대로 렌더. 핵심 계약(바뀌면 안 됨):
- `useAssetPressure(projectId)` 로 데이터.
- 행은 이미 정렬돼 있으니 그대로 순회.
- `report.signalNote` 를 섹션에 노출(reference signal 라벨).
- 로딩/빈(`rows.length === 0`)/에러 상태 처리.
- CSS 변수 토큰만, 하드코딩 hex 금지.

- [ ] **Step 2: 타입·lint·빌드**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 셋 다 PASS

- [ ] **Step 3: Playwright 실연동 검증**

영속 스택(:3001 OPS_AUTO_INGEST, :5173) 기동 확인 — **stale 시 :5173 재시작**(메모리 함정). 그 뒤:
- 개요탭 → platform-gitops 선택(개선안이 cursor_rule 로 다수 쌓인 프로젝트).
- 자산 헬스 영역에 "개선 압력" 섹션이 뜨고, 행이 미처리 개선안 순으로 보이는지.
- 한 행을 골라 DB/`list_proposals` 와 대조 — draft/applied 카운트 일치.
- `signalNote`("품질 점수 아님")가 보이는지.
- 스크린샷 1장(throwaway, 검증 후 삭제).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/domains/registry/components/overview/
git commit -m "feat(asset-pressure): 개요탭 자산 헬스에 개선 압력 섹션"
```

---

## Task 8: 마무리 — 채점·기록·머지

- [ ] **Step 1: reviewer 리뷰** — `opspilot-reviewer` 로 전체 변경(컨벤션·운영함정·도메인 경계) 리뷰. blocker는 반영.
- [ ] **Step 2: work-evaluator 채점** — 작업 4원칙(가정·최소·범위·검증).
- [ ] **Step 3: 메모리·의제 기록** — 메모리 백로그에 002-3 1단계 완료 반영. (의제 문서 진행 마킹은 선택.)
- [ ] **Step 4: main 머지 (HITL)** — `git checkout main && git merge --no-ff feat/asset-improvement-pressure`. 사용자 승인 후.

---

## Self-Review (작성자 체크)

- **Spec 커버리지:** 신호 둘(개선안 누적·정정 왕복) → Task 2·3. 행=합집합/머지 안 함 → Task 3 buildAssetPressureRows. 점수 합산 금지 → 스키마·service에 등급 없음 ✓. reference 라벨 → signalNote ✓. 자산 헬스 확장 → Task 6·7 ✓. 읽기전용/스키마 무변경 → 새 SELECT만 ✓. 평가 실패 제외 → 신호 둘만 ✓.
- **Placeholder:** 코드 스텝마다 실제 코드. "실행 시 확인" 주석은 선례 파일경로:라인을 명시한 한정적 확인(이름/매핑 정합)이지 미작성이 아님.
- **타입 일관성:** `AssetPressureRow`/`AssetPressureReport`/`assetPressureReportSchema`/`buildAssetPressureRows`/`getAssetPressureReport`/`countProposalsByAssetForProject`/`useAssetPressure`/`assetPressureKeys` — 정의(Task 1·2·3·5)와 사용처 일치 확인.
- **알려진 한계:** proposal(target_path)과 work_metric(kind:name)이 다른 차원이라 같은 자산이 두 행으로 보일 수 있음 — spec 리스크에 명시된 1단계 수용 사항.
