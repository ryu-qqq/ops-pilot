# 리뷰 결과물 → 자산개선 seam 잇기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 리뷰의 검증된 지적을 ops-pilot `draft` proposal로 자동 적립해, 기존 reviewer→approve→apply→git 파이프라인을 그대로 타게 한다(사람이 초안을 손으로 옮기는 단계 제거, apply HITL 유지).

**Architecture:** Approach A — 합성 `pr_review` ingest_bundle. 새 서비스 함수 `ingestReviewProposal`이 ingest_bundle(trigger=`pr_review`, status=`done`) + improvement_proposal(`draft`)을 한 트랜잭션으로 만든다. work-evaluator eval은 건너뛴다(사람이 이미 판단). 다운스트림(review-queue·approve·apply·harness-bridge sync)과 작업 인박스 UI는 100% 재사용. agent-crew `review-ledger` 스킬은 "초안 텍스트 제시"를 신규 엔드포인트 POST로 교체한다.

**Tech Stack:** TypeScript, Fastify(+fastify-type-provider-zod), zod, better-sqlite3, vitest, React(web). pnpm 워크스페이스(`apps/server`·`apps/web`·`packages/shared-types`).

## Global Constraints

- 설계 정본: `docs/superpowers/specs/2026-06-28-review-outcome-asset-seam-design.md`. 충돌 시 spec 우선.
- HITL 경계(ADR-0004 4A): review proposal은 `draft`로만 진입, **auto-apply 금지**. approve는 사람만.
- 새 코어 경로는 LLM/claude run을 스폰하지 않는다(결정적·단위테스트 가능). reviewer 실행은 기존 트리거(수동 review 또는 `getAutoReview()`)에 맡긴다.
- `improvement_proposal` 테이블 스키마 무변경. 스키마 변경은 `ingest_bundle.ingest_trigger` CHECK 한 곳뿐.
- 마이그레이션은 멱등. 기존 `apps/server/src/db/migrate.ts`의 `reconcileXxx` 패턴을 따른다(SQLite CHECK 변경 = 테이블 재구성).
- 작업 루프는 ops-pilot `CLAUDE.md` 준수: 격리 스택(임시 `OPS_DB_PATH`+포트)으로 검증, 루트 `pnpm dev` 금지, 커밋은 `cd apps/server` 기준.
- 자산 식별(targetKind/targetPath)은 스킬이 `list_assets`로 한다 — 엔드포인트는 해석하지 않는다.

---

## File Structure

**ops-pilot (이 레포, 브랜치 `feat/review-outcome-seam`):**
- `apps/server/src/db/schema.sql` — ingest_trigger CHECK에 `pr_review` 추가(신규 DB).
- `apps/server/src/db/migrate.ts` — 기존 DB용 reconcile(테이블 재구성) 추가.
- `packages/shared-types/src/domain.ts` — ingestTrigger 유니온 확장 + `IngestBundleContext`에 review provenance + `reviewProposalRequestSchema`/타입.
- `apps/server/src/domains/feedback/service.ts` — `ingestReviewProposal` 추가.
- `apps/server/src/routes/api/feedback.ts` — `POST /feedback/review-proposal` 라우트.
- `apps/server/src/mcp/*` — `ingest_review_proposal` MCP 도구(기존 등록 패턴 따름).
- `apps/web/src/domains/work/components/*` — run 없는 `pr_review` bundle 견고 렌더 + 출처 배지.
- `docs/adr/0008-review-outcome-asset-seam.md` — 방향 ADR(Accepted).

**agent-crew (별도 레포):**
- `skills/review-ledger/SKILL.md` — 초안 제시 → 엔드포인트 POST 교체.

---

## Setup (워크트리/브랜치)

ops-pilot은 이미 브랜치 `feat/review-outcome-seam`에 있다(spec 커밋 `a5c3300` 존재). 추가 워크트리 불필요 — 같은 브랜치에서 이어 구현.

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git branch --show-current   # feat/review-outcome-seam 확인
corepack pnpm install       # 의존성 (이미 설치돼 있으면 빠르게 통과)
```

검증용 격리 스택(테스트 외 수동 확인 시):
```bash
OPS_DB_PATH=/tmp/opspilot-seam.sqlite PORT=3099 corepack pnpm --filter @opspilot/server dev
```

---

## Task 1: 스키마·마이그레이션 — ingest_trigger에 'pr_review' 허용

**Files:**
- Modify: `apps/server/src/db/schema.sql:159`
- Modify: `apps/server/src/db/migrate.ts` (reconcile 함수 추가 + `migrate()`에서 호출)
- Test: `apps/server/src/db/migrate.test.ts` (없으면 생성)

**Interfaces:**
- Produces: `ingest_bundle` 테이블이 `ingest_trigger IN ('auto','manual','pr_review')`를 허용. 후속 Task가 `trigger:'pr_review'`로 insert 가능.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/db/migrate.test.ts`:
```ts
import { existsSync, rmSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { getDb, closeDb } from "./index.js";
import { migrate } from "./migrate.js";

const TMP = "/tmp/opspilot-migrate-test.sqlite";

afterEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (existsSync(f)) rmSync(f);
});

it("allows ingest_trigger='pr_review' after migrate", () => {
  migrate(TMP);
  const db = getDb(TMP);
  // project FK 충족용 최소 row
  db.prepare(
    "INSERT INTO project (id, name, repo_path, workspace_mode, created_at) VALUES ('p1','t','/x','linked','2026-01-01')",
  ).run();
  const insert = () =>
    db
      .prepare(
        `INSERT INTO ingest_bundle (id, project_id, git_ref, diff_summary, context_json, status, ingest_trigger, created_at)
         VALUES ('b1','p1','ref','d','{}','done','pr_review','2026-01-01')`,
      )
      .run();
  expect(insert).not.toThrow();
});
```
주의: `project` insert 컬럼은 실제 스키마에 맞춘다(`apps/server/src/db/schema.sql`의 project 테이블 확인 후 컬럼 정정).

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/db/migrate.test.ts`
Expected: FAIL — CHECK 제약 위반(`CHECK constraint failed: ingest_bundle`).

- [ ] **Step 3: schema.sql 수정(신규 DB)**

`apps/server/src/db/schema.sql:159` 의 CHECK를:
```sql
  ingest_trigger  TEXT NOT NULL DEFAULT 'manual' CHECK (ingest_trigger IN ('auto', 'manual', 'pr_review')),
```

- [ ] **Step 4: migrate.ts에 기존-DB 재구성 reconcile 추가**

`reconcileIngestBundleStatus`를 템플릿으로, ingest_trigger CHECK에 `pr_review`가 없으면 테이블을 재구성하는 함수를 추가한다. **현재 컬럼(ingest_trigger 포함)을 모두 보존**해야 한다(구 템플릿은 ingest_trigger 이전 것이라 컬럼 목록이 다름 — 아래처럼 전체 컬럼 복사):

```ts
// ingest_trigger CHECK 에 'pr_review' 추가(리뷰 출처). 기존 DB 는 CHECK 변경 불가라 재구성.
// 멱등: sql 에 'pr_review' 가 이미 있으면 skip. reconcileIngestTrigger(컬럼 보장) 뒤에 호출.
function reconcileIngestTriggerPrReview(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ingest_bundle'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'pr_review'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE ingest_bundle__new (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES project (id) ON DELETE CASCADE,
        notion_task_url TEXT,
        git_ref         TEXT NOT NULL,
        diff_summary    TEXT NOT NULL,
        context_json    TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'evaluating', 'done', 'reviewing', 'reviewed', 'failed')),
        ingest_trigger  TEXT NOT NULL DEFAULT 'manual'
                        CHECK (ingest_trigger IN ('auto', 'manual', 'pr_review')),
        created_at      TEXT NOT NULL
      );
      INSERT INTO ingest_bundle__new
        SELECT id, project_id, notion_task_url, git_ref, diff_summary, context_json, status, ingest_trigger, created_at
        FROM ingest_bundle;
      DROP TABLE ingest_bundle;
      ALTER TABLE ingest_bundle__new RENAME TO ingest_bundle;
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_project ON ingest_bundle (project_id);
      CREATE INDEX IF NOT EXISTS idx_ingest_bundle_status ON ingest_bundle (status);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}
```
그리고 `migrate()` 본문에서 `reconcileIngestTrigger(db);` **다음 줄**에 `reconcileIngestTriggerPrReview(db);`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/db/migrate.test.ts`
Expected: PASS.

- [ ] **Step 6: 영속 DB 마이그레이트(개발 환경 정합)**

Run: `cd apps/server && corepack pnpm db:migrate`
Expected: 에러 없이 완료(멱등). 영속 `opspilot.sqlite`가 pr_review를 허용하게 됨.

- [ ] **Step 7: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add apps/server/src/db/schema.sql apps/server/src/db/migrate.ts apps/server/src/db/migrate.test.ts
git commit -m "feat(db): ingest_trigger 에 pr_review 허용 (리뷰 출처 bundle)"
```

---

## Task 2: shared-types — ingestTrigger 확장 + review 요청 스키마

**Files:**
- Modify: `packages/shared-types/src/domain.ts`
- Test: `packages/shared-types/src/domain.test.ts` (없으면 생성; 있으면 케이스 추가)

**Interfaces:**
- Produces:
  - `ingestTrigger` zod 유니온에 `'pr_review'` 포함(서버/웹 타입 정합).
  - `IngestBundleContext`에 선택적 `review?: ReviewProvenance` + `scenarioId?: string | null`.
  - `reviewProposalRequestSchema` + `type ReviewProposalRequest`:
    ```ts
    { projectId: string; targetKind: TargetKind; targetPath: string;
      rationale: string; content: string;
      review: { prNumber: number; repo: string; commentUrl: string; reviewer: string; mistakeType: string };
      scenarioId?: string | null }
    ```
  - `reviewProposalResponseSchema` = `{ ingestId: string; proposalId: string }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared-types/src/domain.test.ts`:
```ts
import { expect, it } from "vitest";
import { reviewProposalRequestSchema, ingestTriggerSchema } from "./domain.js";

it("ingestTrigger accepts pr_review", () => {
  expect(ingestTriggerSchema.parse("pr_review")).toBe("pr_review");
});

it("reviewProposalRequestSchema parses a valid review proposal", () => {
  const ok = reviewProposalRequestSchema.parse({
    projectId: "11111111-1111-1111-1111-111111111111",
    targetKind: "skill",
    targetPath: "skills/foo/SKILL.md",
    rationale: "반복된 지적",
    content: "수정 초안",
    review: { prNumber: 12, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
  });
  expect(ok.review.prNumber).toBe(12);
  expect(ok.scenarioId ?? null).toBeNull();
});
```
주의: `ingestTriggerSchema`의 실제 export 이름을 `domain.ts`에서 확인(없으면 인라인 유니온일 수 있음 → 이름 붙여 export). `targetKind` 허용값은 `improvement_proposal` CHECK와 동일(`cursor_rule|cursor_skill|agent|skill|command|workflow_patch`) — 기존 proposal 스키마의 targetKind enum 재사용.

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @opspilot/shared-types vitest run src/domain.test.ts`
Expected: FAIL — `reviewProposalRequestSchema` 미정의 / `pr_review` 거부.

- [ ] **Step 3: domain.ts 수정**

- `ingestTrigger` 유니온에 `"pr_review"` 추가(있으면 그 enum에, 없으면 `export const ingestTriggerSchema = z.enum(["auto","manual","pr_review"])`로 명명 export 후 ingest 스키마에서 사용).
- `IngestBundleContext` 타입/스키마에 `review`·`scenarioId` 선택 필드 추가.
- 신규:
```ts
export const reviewProvenanceSchema = z.object({
  prNumber: z.number().int(),
  repo: z.string().min(1),
  commentUrl: z.string().min(1),
  reviewer: z.string().min(1),
  mistakeType: z.string().min(1),
});
export const reviewProposalRequestSchema = z.object({
  projectId: z.string().uuid(),
  targetKind: improvementProposalSchema.shape.targetKind, // 기존 enum 재사용
  targetPath: z.string().min(1),
  rationale: z.string().min(1),
  content: z.string().min(1),
  review: reviewProvenanceSchema,
  scenarioId: z.string().uuid().nullable().default(null),
});
export type ReviewProposalRequest = z.infer<typeof reviewProposalRequestSchema>;
export const reviewProposalResponseSchema = z.object({
  ingestId: z.string(),
  proposalId: z.string(),
});
```
주의: `improvementProposalSchema.shape.targetKind` 재사용이 안 되면 동일 `z.enum([...])`를 직접 기술.

- [ ] **Step 4: 테스트 통과 + 타입체크**

Run: `corepack pnpm --filter @opspilot/shared-types vitest run src/domain.test.ts && corepack pnpm -r typecheck`
Expected: PASS, 타입체크 통과.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add packages/shared-types/src/domain.ts packages/shared-types/src/domain.test.ts
git commit -m "feat(types): reviewProposalRequest 스키마 + ingestTrigger pr_review"
```

---

## Task 3: 도메인 서비스 — ingestReviewProposal

**Files:**
- Modify: `apps/server/src/domains/feedback/service.ts`
- Test: `apps/server/src/domains/feedback/service.review-proposal.test.ts` (생성)

**Interfaces:**
- Consumes: `createIngestBundle(input: NewIngestBundle): IngestBundle`, `createImprovementProposal(input: NewImprovementProposal): ImprovementProposal` (from `./repository.js`); `ReviewProposalRequest` (shared-types). `createIngestBundle` 입력 필드: `{ projectId, notionTaskUrl?, gitRef, diffSummary, contextJson, status?, trigger? }`. `createImprovementProposal` 입력: `{ ingestId, runId, targetKind, targetPath, rationale, content }`.
- Produces: `ingestReviewProposal(input: ReviewProposalRequest): { ingestId: string; proposalId: string }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/domains/feedback/service.review-proposal.test.ts`:
```ts
import { existsSync, rmSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { getDb, closeDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { ingestReviewProposal } from "./service.js";
import { listProposalsByIngestId } from "./repository.js";

const TMP = "/tmp/opspilot-review-proposal.sqlite";

beforeEach(() => {
  migrate(TMP);
  const db = getDb(TMP);
  db.prepare(
    "INSERT INTO project (id, name, repo_path, workspace_mode, created_at) VALUES ('p1','t','/x','linked','2026-01-01')",
  ).run();
});
afterEach(() => {
  closeDb();
  for (const f of [TMP, `${TMP}-wal`, `${TMP}-shm`]) if (existsSync(f)) rmSync(f);
});

it("creates a pr_review bundle (status done) + draft proposal", () => {
  const { ingestId, proposalId } = ingestReviewProposal({
    projectId: "p1",
    targetKind: "skill",
    targetPath: "skills/foo/SKILL.md",
    rationale: "반복된 지적",
    content: "수정 초안",
    review: { prNumber: 12, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
    scenarioId: null,
  });
  const db = getDb(TMP);
  const bundle = db.prepare("SELECT status, ingest_trigger FROM ingest_bundle WHERE id = ?").get(ingestId) as {
    status: string; ingest_trigger: string;
  };
  expect(bundle.ingest_trigger).toBe("pr_review");
  expect(bundle.status).toBe("done"); // eval 스킵, 검토 대기 상태
  const drafts = listProposalsByIngestId(ingestId).filter((p) => p.status === "draft");
  expect(drafts).toHaveLength(1);
  expect(drafts[0].id).toBe(proposalId);
});

it("throws NotFound for an unknown project", () => {
  expect(() =>
    ingestReviewProposal({
      projectId: "99999999-9999-9999-9999-999999999999",
      targetKind: "skill",
      targetPath: "skills/foo/SKILL.md",
      rationale: "x",
      content: "y",
      review: { prNumber: 1, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
      scenarioId: null,
    }),
  ).toThrow(/not found/i);
});
```
주의: 테스트가 `getDb(TMP)`로 같은 DB 핸들을 쓰도록 service가 동일 핸들을 쓰는지 확인(다른 도메인 테스트의 DB 초기화 패턴 따름). `project` insert 컬럼은 실제 스키마에 맞춤.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/feedback/service.review-proposal.test.ts`
Expected: FAIL — `ingestReviewProposal` 미정의.

- [ ] **Step 3: service.ts에 함수 추가**

`apps/server/src/domains/feedback/service.ts` 상단 import에 `createImprovementProposal` 추가(이미 `createIngestBundle`은 import됨), `getDb`(`../../db/index.js`), `ReviewProposalRequest`를 `@opspilot/shared-types`에서 import. bundle+proposal은 **하나의 트랜잭션**으로 묶어 원자성을 보장한다(spec "단일 트랜잭션"):
```ts
export function ingestReviewProposal(
  input: ReviewProposalRequest,
): { ingestId: string; proposalId: string } {
  // 프로젝트 미존재 시 FeedbackIngestError('NotFound') (Task 4 라우트가 404 매핑)
  if (!projectExists(input.projectId)) {
    throw new FeedbackIngestError("NotFound", `project not found: ${input.projectId}`);
  }
  return getDb().transaction(() => {
    const bundle = createIngestBundle({
      projectId: input.projectId,
      gitRef: `pr-${input.review.prNumber}`,
      diffSummary: `PR #${input.review.prNumber}: ${input.review.mistakeType}`,
      contextJson: { review: input.review, scenarioId: input.scenarioId ?? null },
      trigger: "pr_review",
      status: "done", // eval 스킵 — 사람이 이미 판단. 검토/승인 대기.
    });
    const proposal = createImprovementProposal({
      ingestId: bundle.id,
      runId: null,
      targetKind: input.targetKind,
      targetPath: input.targetPath,
      rationale: input.rationale,
      content: input.content,
    });
    return { ingestId: bundle.id, proposalId: proposal.id };
  })();
}
```
주의: `projectExists`/`FeedbackIngestError`의 실제 export 위치 확인(기존 `ingestFeedback`이 프로젝트 검증·NotFound를 던지는 방식을 그대로 차용 — `service.ts` 상단에서 이미 import 중일 가능성 높음). `getDb().transaction(fn)()`는 better-sqlite3 패턴.
주의: `contextJson`이 타입상 `IngestBundleContext`를 요구하면 Task 2에서 넓힌 `review`·`scenarioId` 필드로 충족된다. `createImprovementProposal`의 `runId`가 `string | null`을 받는지 타입 확인(아니면 `NewImprovementProposal.runId` 타입을 `string | null`로 정정).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/feedback/service.review-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add apps/server/src/domains/feedback/service.ts apps/server/src/domains/feedback/service.review-proposal.test.ts
git commit -m "feat(feedback): ingestReviewProposal — pr_review bundle+draft proposal"
```

---

## Task 4: REST 엔드포인트 — POST /api/feedback/review-proposal

**Files:**
- Modify: `apps/server/src/routes/api/feedback.ts`
- Test: `apps/server/src/routes/api/feedback.review-proposal.test.ts` (생성; 기존 라우트 통합 테스트 패턴 따름)

**Interfaces:**
- Consumes: `ingestReviewProposal` (Task 3), `reviewProposalRequestSchema`·`reviewProposalResponseSchema` (Task 2). 프로젝트 존재 검증: `getProject`/`projectExists` (registry/project repository — 기존 ingest 라우트가 NotFound를 던지는 방식 재사용).
- Produces: `POST /feedback/review-proposal` → 200 `{ ingestId, proposalId }`, 404 프로젝트 없음.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/routes/api/feedback.review-proposal.test.ts` — 기존 라우트 테스트(있으면 `feedback*.test.ts`)의 app 부팅 헬퍼를 재사용. 핵심 단언:
```ts
import { expect, it } from "vitest";
// buildTestApp / 임시 DB seed 는 기존 라우트 테스트 헬퍼 패턴 따름
it("POST /api/feedback/review-proposal returns ingestId+proposalId", async () => {
  const app = await buildTestApp(); // 기존 헬퍼
  await seedProject(app, "p1");      // 기존 헬퍼 또는 직접 insert
  const res = await app.inject({
    method: "POST",
    url: "/api/feedback/review-proposal",
    payload: {
      projectId: "p1",
      targetKind: "skill",
      targetPath: "skills/foo/SKILL.md",
      rationale: "반복된 지적",
      content: "수정 초안",
      review: { prNumber: 12, repo: "o/r", commentUrl: "https://x", reviewer: "rv", mistakeType: "naming" },
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.ingestId).toBeTruthy();
  expect(body.proposalId).toBeTruthy();
});
```
주의: 기존 `feedback.ts` 라우트 테스트가 없다면, `app.inject`로 부팅하는 방식은 다른 `routes/api/*.test.ts`를 참고. 프로젝트 id가 uuid 검증에 걸리면 seed id도 uuid로.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/routes/api/feedback.review-proposal.test.ts`
Expected: FAIL — 404(라우트 없음).

- [ ] **Step 3: 라우트 추가**

`apps/server/src/routes/api/feedback.ts` import에 `ingestReviewProposal`(service), `reviewProposalRequestSchema`·`reviewProposalResponseSchema`(shared-types) 추가. `/feedback/ingest` 라우트 바로 아래에:
```ts
fastify.post(
  "/feedback/review-proposal",
  {
    schema: {
      body: reviewProposalRequestSchema,
      response: { 200: reviewProposalResponseSchema, 400: errorSchema, 404: errorSchema },
    },
  },
  async (req, reply) => {
    try {
      return ingestReviewProposal(req.body);
    } catch (e) {
      if (e instanceof FeedbackIngestError) {
        const code = e.code === "NotFound" ? 404 : 400;
        return reply.status(code).send({ error: e.code, detail: e.message });
      }
      throw e;
    }
  },
);
```
프로젝트 존재 검증은 Task 3의 `ingestReviewProposal`이 이미 `FeedbackIngestError('NotFound')`로 처리하므로 라우트는 위 catch만으로 404를 매핑한다. (Task 3 테스트에 "없는 projectId → throws NotFound" 케이스 1개를 함께 추가.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/routes/api/feedback.review-proposal.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add apps/server/src/routes/api/feedback.ts apps/server/src/routes/api/feedback.review-proposal.test.ts apps/server/src/domains/feedback/service.ts apps/server/src/domains/feedback/service.review-proposal.test.ts
git commit -m "feat(api): POST /feedback/review-proposal 엔드포인트"
```

---

## Task 5 (선택): MCP 도구 — ingest_review_proposal

> **YAGNI 주의:** `review-ledger` 스킬은 이미 REST(`POST /api/scenarios`)를 쓰므로 Task 4의 REST 엔드포인트만으로 seam이 닫힌다. 이 MCP 도구는 "MCP 입구도 통일하고 싶을 때"의 선택 작업 — 핵심 루프엔 불필요. 건너뛰어도 성공 기준은 충족된다.

**Files:**
- Modify: `apps/server/src/mcp/*` (기존 도구 등록 파일 — `tabs`/`tools` 정의 위치는 `docs/mcp-reference.md`와 `apps/server/dist/mcp/` 대응 소스 확인)
- Test: 기존 MCP 도구 테스트가 있으면 케이스 추가, 없으면 tools/list에 포함되는지 스모크.

**Interfaces:**
- Consumes: `ingestReviewProposal` (Task 3), `reviewProposalRequestSchema` (Task 2).
- Produces: MCP 도구 `ingest_review_proposal` — 입력 = reviewProposalRequest, 출력 = `{ ingestId, proposalId }`. (review-ledger 스킬이 REST 대신 MCP를 쓸 경우의 입구. REST와 동일 서비스 호출.)

- [ ] **Step 1: 기존 MCP 도구 등록 패턴 확인**

기존 도구(`ingest_cursor_session`·`list_assets`·`start_run` 등)가 등록된 소스 파일을 연다(`docs/mcp-reference.md`의 도구 목록 → 대응 소스). 입력 zod 스키마·핸들러가 서비스 함수를 호출하는 형태를 그대로 따른다.

- [ ] **Step 2: 도구 추가**

기존 도구 옆에 `ingest_review_proposal`을 등록. 핸들러는 `reviewProposalRequestSchema`로 파싱 → `ingestReviewProposal(input)` 반환. (기존 도구가 zod 입력을 쓰는 방식과 정확히 동일하게.)

- [ ] **Step 3: 스모크 검증(격리 스택)**

```bash
OPS_DB_PATH=/tmp/opspilot-mcp.sqlite PORT=3099 corepack pnpm --filter @opspilot/server dev &
# tools/list 에 ingest_review_proposal 포함 확인 (curl 또는 MCP inspector)
```
Expected: 도구 목록에 `ingest_review_proposal` 노출.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add apps/server/src/mcp
git commit -m "feat(mcp): ingest_review_proposal 도구"
```

---

## Task 6: 인박스 UI — run 없는 pr_review bundle 견고 렌더 + 출처 배지

**Files:**
- Modify: `apps/web/src/domains/work/components/work-detail-view.tsx`
- Modify: `apps/web/src/domains/work/components/work-list-view.tsx` (목록 배지)
- Test: 해당 컴포넌트 테스트가 있으면 케이스 추가; 없으면 빌드 + 수동 확인.

**Interfaces:**
- Consumes: ingest_bundle의 `ingest_trigger==='pr_review'`와 `contextJson.review` (Task 2 타입). run 없음(runId null) bundle.
- Produces: 작업 상세에서 run 의존 패널(VerdictStrip·트레이스·diff·등급)이 깨지지 않고, "PR 리뷰" 출처 배지 + PR 링크/리뷰어/mistakeType 표시. proposal 카드는 정상.

- [ ] **Step 1: run 의존 패널 가드**

`work-detail-view.tsx`에서 run/eval 데이터에 접근하는 패널들이 `runId == null`(또는 run 부재)일 때 렌더를 건너뛰거나 빈 상태를 보이도록 가드. (현재 코드가 run 존재를 전제하면 옵셔널 체크 추가.)

- [ ] **Step 2: 출처 배지 + provenance 표시**

`ingest_trigger==='pr_review'`이면 상단에 "PR 리뷰" 배지, `contextJson.review`의 `commentUrl`(링크)·`reviewer`·`mistakeType`을 작은 메타로 표시. 기존 배지/메타 컴포넌트 스타일 재사용.

- [ ] **Step 3: 목록 배지**

`work-list-view.tsx`에서 작업 항목이 pr_review면 목록에도 "PR 리뷰" 표식(기존 trigger 표식이 있으면 거기에 케이스 추가).

- [ ] **Step 4: 빌드 + 수동 확인**

Run: `cd apps/web && corepack pnpm build`
Expected: 빌드 성공. 격리 스택에서 Task 3로 만든 pr_review bundle이 작업 탭에 깨짐 없이 배지와 함께 보이는지 수동 확인.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add apps/web/src/domains/work
git commit -m "feat(web): pr_review 작업 견고 렌더 + 출처 배지"
```

---

## Task 7: ops-pilot ADR-0008 — 방향 기록

**Files:**
- Create: `docs/adr/0008-review-outcome-asset-seam.md`

- [ ] **Step 1: ADR 작성(Accepted)**

기존 ADR(0004·0006) 형식(Status·Date·Context·Decision·Consequences)을 따른다. 핵심: "PR 리뷰 채널의 끊긴 seam을 합성 pr_review ingest_bundle로 이어, review-ledger 산출을 기존 proposal 파이프라인에 자동 적립한다. HITL(apply 승인) 유지. World1/Linear/telemetry는 범위 밖." spec 파일을 근거로 링크. ADR-0001/0002/0004/0006 및 connectly ADR-0012 D3 참조.

- [ ] **Step 2: 커밋**

```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git add docs/adr/0008-review-outcome-asset-seam.md
git commit -m "docs(adr): 0008 리뷰 결과물→자산개선 seam (Accepted)"
```

---

## Task 8: agent-crew review-ledger 스킬 — POST로 교체 (별도 레포)

**Files:**
- Modify: `/Users/ryu-qqq/Documents/ryu-qqq/agent-crew/skills/review-ledger/SKILL.md`

**Interfaces:**
- Consumes: Task 4의 `POST /api/feedback/review-proposal` 계약(또는 Task 5 MCP `ingest_review_proposal`). 2-3단계의 `scenarioId`.
- Produces: 사람이 적립 선택한 지적이 ops-pilot `draft` proposal로 자동 적립됨(텍스트 제시 제거).

- [ ] **Step 1: 2-5단계 교체**

`review-ledger/SKILL.md`의 "proposal 초안 제시(display)" 단계(현 2-5)를, 사람이 적립 선택한 항목에 대해 신규 엔드포인트로 POST하는 절차로 교체:
- payload: `{ projectId, targetKind, targetPath, rationale, content, review:{prNumber,repo,commentUrl,reviewer,mistakeType}, scenarioId }`.
- `scenarioId`는 2-3단계 `POST /api/scenarios` 응답에서 받은 값.
- HITL 선택(어떤 지적을 적립할지)은 그대로 사람이 — 자동 적립이 아니라 "선택된 것만 POST".
- 결과 안내: "ops-pilot 인박스에서 검토·승인하라"로 문구 갱신(텍스트 복붙 안내 제거).

- [ ] **Step 2: 격리 검증**

임시 ops-pilot 인스턴스(`OPS_DB_PATH`+포트) 띄우고, 더미 payload로 POST가 200 + 인박스에 draft proposal이 뜨는지 손으로 시연(스킬은 지침이라 자동 테스트 대신 시연).

- [ ] **Step 3: 버전·커밋 (agent-crew 컨벤션)**

agent-crew `VERSIONING.md`에 따라 SemVer 마이너 올림 + CHANGELOG 갱신 후 커밋·태그.
```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/agent-crew
git add skills/review-ledger/SKILL.md CHANGELOG.md
git commit -m "feat(review-ledger): proposal 초안을 ops-pilot 엔드포인트로 자동 적립"
```

---

## 최종 통합 검증

- [ ] `cd apps/server && corepack pnpm -r typecheck && corepack pnpm -r lint`
- [ ] `cd apps/server && corepack pnpm vitest run` (전체 서버 테스트 green)
- [ ] `cd apps/web && corepack pnpm build`
- [ ] 격리 스택 e2e(수동): review-ledger 더미 POST → 작업 인박스에 draft proposal 표시 → 수동 review(또는 autoReview) → approve → apply→git 커밋 생성 확인 → harness-bridge sync 동작 확인. **approve 없이 apply 시도 → 거부(HITL 경계)**.

---

## Handoff (push/PR)

ops-pilot CLAUDE.md 루프: 루프가 닫히면 `main`에 `--no-ff` 머지 후 push(사용자 확인 후). Jira OPSP에 작업 생성·전이·코멘트. agent-crew는 별도 PR/태그.

```bash
# ops-pilot
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
git push -u origin feat/review-outcome-seam   # 또는 CLAUDE.md 대로 main --no-ff 머지
# 선재 변경 apps/server/src/domains/agent-crew/sync.ts 는 이 작업과 무관 — 건드리지 않음
```
