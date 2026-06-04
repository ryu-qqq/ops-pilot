# 머신 스코어러 (기준-인식 자동 judge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** run 완료 시(토글 ON일 때) 사람이 정한 successCriteria 품질을 먼저 판정한 뒤 LLM judge로 채점하는 `scorer='machine'`을 추가한다 — 기준이 부실하면 가짜 점수 대신 정직한 보류 + 보강 제안을 낸다.

**Architecture:** 백엔드 수직 슬라이스 — (1) `scorer` enum + score.detail 스키마 + DB 마이그레이션, (2) 결정적 기준 게이트와 LLM 채점을 분리한 `machine-score.ts`, (3) runLoop의 env-게이트 자동 hook + 수동 라우트, (4) benchmark 집계 + 프론트 표면화. 결정적 부분(게이트)은 단위테스트, 비결정 부분(LLM)은 격리 스모크로 가른다.

**Tech Stack:** TypeScript · Fastify + Zod · better-sqlite3 · vitest(pool='forks') · React + TanStack Query · Claude API(`runClaudeOnce`)

**참조 스펙:** `docs/superpowers/specs/2026-06-04-machine-scorer-design.md`

**브랜치:** `feat/machine-scorer` (이미 생성됨, spec 커밋 `d45baf2`)

**검증 명령(공통):**
- typecheck: `corepack pnpm -r typecheck`
- lint: `corepack pnpm lint`
- 서버 테스트: `cd apps/server && corepack pnpm test`
- 웹 빌드: `cd apps/web && corepack pnpm build`

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `packages/shared-types/src/domain.ts` | `scorerSchema`에 `machine`, `scoreSchema.detail`에 machine 필드, `machineGateStatusSchema`, benchmark 타입 확장 | 수정 |
| `apps/server/src/db/schema.sql` | 신규 DB의 score CHECK에 `'machine'` | 수정 |
| `apps/server/src/db/migrate.ts` | `reconcileMachineScorer`(기존 DB CHECK 재구성) | 수정 |
| `apps/server/src/domains/score/machine-score.ts` | 결정적 게이트 + LLM 채점 + env 자동 hook | **신규** |
| `apps/server/src/domains/run/service.ts` | runLoop 말미에서 자동 hook 호출 | 수정 |
| `apps/server/src/routes/api/runs.ts` | `POST /runs/:id/machine-score`, compare에 `machineScore` | 수정 |
| `apps/server/src/domains/run/benchmark.ts` | machine 분포 + 기준 보류 카운트 | 수정 |
| `apps/server/src/domains/score/machine-score.test.ts` | 게이트·저장 단위테스트 | **신규** |
| `apps/server/src/domains/run/benchmark.test.ts` | machine 집계 케이스 | 수정 |
| `apps/web/.../verdict-strip.tsx` 외 | machine 칸·신뢰게이트·제안 표시 | 수정 |

---

## Task 1: scorer enum + score.detail 스키마 + DB 마이그레이션

**Files:**
- Modify: `packages/shared-types/src/domain.ts` (scorerSchema ~48-54, scoreSchema ~208-223)
- Modify: `apps/server/src/db/schema.sql` (score 테이블 CHECK)
- Modify: `apps/server/src/db/migrate.ts` (migrate 본문 ~10-20, reconcile 함수 추가)
- Test: `apps/server/src/domains/score/machine-score.test.ts` (마이그레이션 케이스)

- [ ] **Step 1: shared-types — scorer enum + machineGateStatus + detail 확장**

`packages/shared-types/src/domain.ts`의 `scorerSchema`를 수정하고, 바로 아래에 게이트 상태 enum을 추가한다:

```typescript
export const scorerSchema = z.enum([
  "schema",
  "assertion",
  "llm_judge",
  "human",
  "machine",
]);
export type Scorer = z.infer<typeof scorerSchema>;

// 머신 스코어러 기준 게이트 상태 — 채점 전 successCriteria 품질 판정 결과.
//  scored        = 기준 충분, PASS/FAIL + score 유효
//  criteria_weak = 기준 있으나 모호 → 점수 내되 신뢰 보류
//  no_criteria   = 기준 비었음 → 점수 null, 채점 불가
export const machineGateStatusSchema = z.enum([
  "scored",
  "criteria_weak",
  "no_criteria",
]);
export type MachineGateStatus = z.infer<typeof machineGateStatusSchema>;
```

`scoreSchema.detail`(약 208-223줄)의 `.object({...})`에 machine 전용 optional 필드를 더한다:

```typescript
  detail: z
    .object({
      reason: z.string().optional(),
      expected: z.unknown().optional(),
      actual: z.unknown().optional(),
      // 머신 스코어러 전용(scorer='machine'일 때만 채워짐).
      gateStatus: machineGateStatusSchema.optional(),
      criteriaCritique: z.string().optional(),
      suggestedCriteria: z.array(z.string()).optional(),
    })
    .nullable(),
```

- [ ] **Step 2: schema.sql — 신규 DB의 score CHECK에 machine 추가**

`apps/server/src/db/schema.sql`의 score 테이블 정의에서 scorer CHECK를 수정:

```sql
  scorer     TEXT NOT NULL CHECK (scorer IN ('schema', 'assertion', 'llm_judge', 'human', 'machine')),
```

- [ ] **Step 3: migrate.ts — reconcileMachineScorer 추가**

`apps/server/src/db/migrate.ts`의 `migrate()` 본문, `reconcileScoreCheck(db);` **다음 줄**에 호출을 추가:

```typescript
  reconcileScoreCheck(db);
  reconcileMachineScorer(db);
```

그리고 `reconcileScoreCheck` 함수 **아래**에 새 함수를 추가한다(기존 'human' 재구성과 같은 패턴, 'machine' 부재 시에만 재구성):

```typescript
// 머신 스코어러: score.scorer CHECK 에 'machine' 추가. 'human' 재구성 뒤에 돌며,
// CHECK 에 'machine' 이 이미 있으면 skip(멱등). 행 보존 재구성.
function reconcileMachineScorer(db: ReturnType<typeof getDb>): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='score'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'machine'")) return;

  db.exec("PRAGMA foreign_keys=OFF;");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE score__new (
        id         TEXT PRIMARY KEY,
        run_id     TEXT NOT NULL REFERENCES run (id) ON DELETE CASCADE,
        scorer     TEXT NOT NULL CHECK (scorer IN ('schema','assertion','llm_judge','human','machine')),
        passed     INTEGER NOT NULL CHECK (passed IN (0,1)),
        score      REAL CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
        detail     TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO score__new SELECT id, run_id, scorer, passed, score, detail, created_at FROM score;
      DROP TABLE score;
      ALTER TABLE score__new RENAME TO score;
      CREATE INDEX IF NOT EXISTS idx_score_run ON score (run_id);
    `);
  });
  tx();
  db.exec("PRAGMA foreign_keys=ON;");
}
```

- [ ] **Step 4: 마이그레이션 테스트 작성 (실패 확인용)**

`apps/server/src/domains/score/machine-score.test.ts` 신규 작성. (benchmark.test.ts·auto-ingest.test.ts의 격리 DB 패턴 그대로 — `beforeEach` closeDb→migrate(tmp), `afterEach` 정리.) 기존 테스트 파일에서 정확한 import/헬퍼 시그니처를 먼저 확인한 뒤 맞춘다:

```typescript
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ops-machine-"));
  dbPath = join(dir, "test.sqlite");
  closeDb();
  migrate(dbPath);
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("score 마이그레이션 — machine scorer", () => {
  it("migrate 후 scorer='machine' INSERT 가 CHECK 를 통과한다", () => {
    const db = getDb(dbPath);
    // run FK 충족용 최소 row — 실제 컬럼은 schema.sql 참조해 채운다(아래는 예시).
    const runId = randomUUID();
    db.prepare(
      `INSERT INTO run (id, asset_version_id, scenario_id, status, created_at)
       VALUES (?, ?, ?, 'succeeded', ?)`,
    ).run(runId, randomUUID(), randomUUID(), new Date().toISOString());
    expect(() =>
      db
        .prepare(
          `INSERT INTO score (id, run_id, scorer, passed, score, detail, created_at)
           VALUES (?, ?, 'machine', 0, NULL, NULL, ?)`,
        )
        .run(randomUUID(), runId, new Date().toISOString()),
    ).not.toThrow();
  });
});
```

> 주의: `run` 테이블의 NOT NULL 컬럼이 위 예시와 다르면 `apps/server/src/db/schema.sql`의 run DDL을 보고 INSERT 컬럼을 맞춘다. 목적은 "machine INSERT 가 CHECK 를 통과"만 검증.

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `cd apps/server && corepack pnpm test -- machine-score`
Expected: PASS (마이그레이션이 machine 을 허용하므로 통과). 만약 FAIL 이면 reconcile 누락 — Step 3 점검.

- [ ] **Step 6: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: PASS (shared-types·server 모두). detail 스키마 확장이 기존 createScoreWithDetail 호출과 호환되는지 확인.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/domain.ts apps/server/src/db/schema.sql apps/server/src/db/migrate.ts apps/server/src/domains/score/machine-score.test.ts
git commit -m "feat(score): scorer enum 에 machine 추가 + detail 게이트필드 + 마이그레이션

reconcileMachineScorer 로 기존 DB score CHECK 재구성(행 보존, 멱등).
scoreSchema.detail 에 gateStatus·criteriaCritique·suggestedCriteria optional.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 결정적 기준 게이트 (단위테스트 가능 부분)

**Files:**
- Create: `apps/server/src/domains/score/machine-score.ts`
- Test: `apps/server/src/domains/score/machine-score.test.ts` (게이트 케이스 추가)

- [ ] **Step 1: 게이트 테스트 작성 (실패 확인용)**

`machine-score.test.ts`에 describe 블록 추가:

```typescript
import { evaluateCriteriaGate } from "./machine-score.js";

describe("evaluateCriteriaGate — 결정적 사전 판정", () => {
  it("assertions 가 비면 no_criteria", () => {
    expect(evaluateCriteriaGate([])).toBe("no_criteria");
  });
  it("공백만 있는 줄만 있으면 no_criteria", () => {
    expect(evaluateCriteriaGate(["  ", ""])).toBe("no_criteria");
  });
  it("의미 있는 기준이 있으면 null(=LLM 판정으로 위임)", () => {
    expect(evaluateCriteriaGate(['응답에 "AWS_SECRET_KEY" 포함'])).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd apps/server && corepack pnpm test -- machine-score`
Expected: FAIL ("evaluateCriteriaGate is not exported" / 모듈 없음)

- [ ] **Step 3: machine-score.ts 최소 구현 (게이트만)**

`apps/server/src/domains/score/machine-score.ts` 신규:

```typescript
import { z } from "zod";
import type { MachineGateStatus } from "@opspilot/shared-types";

export class MachineScoreError extends Error {}

// 결정적 사전 판정: 기준이 아예 없으면(빈 줄 제외) no_criteria, 아니면 null
//  → null 이면 LLM 이 "모호한가(criteria_weak)" vs "충분한가(scored)" 를 판정한다.
// LLM 호출 없이 즉시 가른다(빈 기준에 토큰 낭비 금지).
export function evaluateCriteriaGate(
  assertions: string[],
): Extract<MachineGateStatus, "no_criteria"> | null {
  const meaningful = assertions.filter((a) => a.trim() !== "");
  return meaningful.length === 0 ? "no_criteria" : null;
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `cd apps/server && corepack pnpm test -- machine-score`
Expected: PASS (마이그레이션 + 게이트 테스트 모두)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/domains/score/machine-score.ts apps/server/src/domains/score/machine-score.test.ts
git commit -m "feat(score): 머신 스코어러 결정적 기준 게이트 evaluateCriteriaGate

빈 기준 → no_criteria 즉시 판정(LLM 호출 전). 단위테스트.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: LLM 채점 + 전체 파이프라인

**Files:**
- Modify: `apps/server/src/domains/score/machine-score.ts`

- [ ] **Step 1: LLM 채점 스키마·프롬프트·파이프라인 구현**

`machine-score.ts`에 아래를 추가한다. `gradeAssertions`(llm-grade.ts)의 호출 패턴(`runClaudeOnce` → `extractJsonObject` → zod safeParse)을 그대로 따른다:

```typescript
import {
  extractJsonObject,
  runClaudeOnce,
} from "../assist/claude.js";
import { getRun, listLastAssistantTexts } from "../run/repository.js";
import { getScenario } from "../scenario/repository.js";
import { createScoreWithDetail } from "./repository.js";

// LLM 응답: 게이트 판정(scored|criteria_weak) + 채점 + 기준 비평/보강제안 을 한 번에.
const machineGradeSchema = z.object({
  gateStatus: z.enum(["scored", "criteria_weak"]),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  criteriaCritique: z.string(),
  suggestedCriteria: z.array(z.string()),
});

const SYSTEM = `당신은 Claude Code 실행 결과 채점자다. 먼저 시나리오 성공조건(assertions)이
작성자의 의도를 *변별*할 만큼 충분한지 판정한 뒤, 출력을 채점한다.

게이트 판정:
- "scored": 기준이 구체적이고 좋은 출력만 통과시킨다(변별력 있음).
- "criteria_weak": 기준이 모호하거나 너무 느슨해 틀린 출력도 통과시킬 수 있다.
  (이 경우에도 채점은 하되, 신뢰는 낮다.)

채점 규칙(엄격):
- 표면적 준수는 FAIL. 단어만 언급하고 실제 수행 안 했거나, 비었거나, 우연히 맞으면 FAIL.
- 의심스러우면 입증 책임은 PASS 쪽 — 근거 약하면 FAIL.

suggestedCriteria: 이 시나리오에 추가하면 변별력이 오를 성공조건 0~3개(criteria_weak 이면 필수).

JSON 한 객체만 출력. 코드펜스/설명 금지.
{ "gateStatus": "scored|criteria_weak", "passed": true, "score": 0.0,
  "criteriaCritique": "<1-2문장 한국어>", "suggestedCriteria": ["<조건>"] }`;

interface MachineGradeLlm {
  gateStatus: "scored" | "criteria_weak";
  passed: boolean;
  score: number;
  criteriaCritique: string;
  suggestedCriteria: string[];
}

// LLM 으로 게이트 판정 + 채점. 직접 호출 가능(재사용·향후 테스트).
async function gradeWithCriteria(
  assertions: string[],
  output: string,
): Promise<MachineGradeLlm> {
  const prompt = `${SYSTEM}

--- 실행 출력 ---
${output.trim() === "" ? "(출력 없음)" : output.slice(0, 6000)}
--- 끝 ---

성공조건(assertions):
${assertions.map((a, i) => `${String(i + 1)}. ${a}`).join("\n")}`;

  const raw = await runClaudeOnce(prompt, { timeoutMs: 90_000 });
  let obj: unknown;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new MachineScoreError(`머신 채점 응답 파싱 실패: ${(e as Error).message}`);
  }
  const parsed = machineGradeSchema.safeParse(obj);
  if (!parsed.success) {
    throw new MachineScoreError(
      `머신 채점 결과 스키마 불일치: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

// 기준 없을 때(no_criteria) LLM 으로 초안 성공조건만 제안(채점 안 함).
async function suggestCriteriaForEmpty(
  scenarioInput: string,
  output: string,
): Promise<string[]> {
  const prompt = `다음 Claude Code 시나리오에는 성공조건(assertions)이 없다.
이 시나리오의 의도를 변별할 성공조건 1~3개를 제안하라. JSON 배열만 출력(설명 금지).
예: ["응답에 'X' 포함", "파일 Y 를 수정"]

--- 시나리오 입력 ---
${scenarioInput.slice(0, 2000)}
--- 실행 출력(참고) ---
${output.slice(0, 2000)}`;
  try {
    const raw = await runClaudeOnce(prompt, { timeoutMs: 60_000 });
    const obj = extractJsonObject(raw);
    const arr = z.array(z.string()).safeParse(obj);
    return arr.success ? arr.data.slice(0, 3) : [];
  } catch {
    return []; // 제안 실패는 치명적 아님 — 빈 제안으로 둔다.
  }
}

export interface MachineScoreResult {
  runId: string;
  gateStatus: MachineGateStatus;
  passed: boolean;
  score: number | null;
  criteriaCritique: string;
  suggestedCriteria: string[];
}

// run 의 마지막 응답 + 시나리오 assertions 로 머신 채점하고 score(scorer='machine') 저장.
// 3상태: scored / criteria_weak (LLM) / no_criteria (결정적).
export async function machineScoreRun(runId: string): Promise<MachineScoreResult> {
  const run = getRun(runId);
  if (!run) throw new MachineScoreError(`run not found: ${runId}`);
  const scenario = getScenario(run.scenarioId);
  if (!scenario) throw new MachineScoreError("scenario not found");
  const assertions = scenario.expectation.assertions ?? [];
  const output = listLastAssistantTexts([runId])[runId] ?? "";

  let result: MachineScoreResult;
  if (evaluateCriteriaGate(assertions) === "no_criteria") {
    const suggested = await suggestCriteriaForEmpty(scenario.input, output);
    result = {
      runId,
      gateStatus: "no_criteria",
      passed: false, // 채점 불가를 통과로 위장 금지(spec §3).
      score: null,
      criteriaCritique:
        "성공조건이 비어 있어 채점할 수 없음 — 아래 제안을 시나리오에 추가하세요.",
      suggestedCriteria: suggested,
    };
  } else {
    const g = await gradeWithCriteria(assertions, output);
    result = {
      runId,
      gateStatus: g.gateStatus,
      passed: g.passed,
      score: g.score,
      criteriaCritique: g.criteriaCritique,
      suggestedCriteria: g.suggestedCriteria,
    };
  }

  createScoreWithDetail({
    runId,
    scorer: "machine",
    passed: result.passed,
    score: result.score,
    detail: {
      reason: result.criteriaCritique,
      gateStatus: result.gateStatus,
      criteriaCritique: result.criteriaCritique,
      suggestedCriteria: result.suggestedCriteria,
    },
  });
  return result;
}
```

- [ ] **Step 2: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: PASS. `scenario.input`·`scenario.expectation.assertions` 접근이 scenario 타입과 맞는지 확인(맞지 않으면 `apps/server/src/domains/scenario/repository.ts`의 getScenario 반환 타입 확인).

- [ ] **Step 3: lint**

Run: `corepack pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/domains/score/machine-score.ts
git commit -m "feat(score): 머신 스코어러 LLM 채점 파이프라인 machineScoreRun

기준 게이트(scored/criteria_weak/no_criteria) + 채점 + 보강제안 을 Claude API
한 번 호출에 묶음. no_criteria 는 LLM 호출 없이 초안 제안만. score(scorer='machine') 저장.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: runLoop 자동 hook (env 토글 가드)

**Files:**
- Modify: `apps/server/src/domains/score/machine-score.ts` (env-게이트 hook 추가)
- Modify: `apps/server/src/domains/run/service.ts` (runLoop 말미 호출)
- Test: `apps/server/src/domains/score/machine-score.test.ts` (env off 케이스)

- [ ] **Step 1: env 게이트 hook 테스트 작성 (실패 확인용)**

`machine-score.test.ts`에 추가:

```typescript
import { isAutoMachineScoreEnabled } from "./machine-score.js";

describe("isAutoMachineScoreEnabled — env 토글", () => {
  it("OPS_AUTO_MACHINE_SCORE 미설정이면 false", () => {
    delete process.env.OPS_AUTO_MACHINE_SCORE;
    expect(isAutoMachineScoreEnabled()).toBe(false);
  });
  it("'1' 이면 true", () => {
    process.env.OPS_AUTO_MACHINE_SCORE = "1";
    expect(isAutoMachineScoreEnabled()).toBe(true);
    delete process.env.OPS_AUTO_MACHINE_SCORE;
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd apps/server && corepack pnpm test -- machine-score`
Expected: FAIL ("isAutoMachineScoreEnabled is not exported")

- [ ] **Step 3: env 게이트 + fire-and-forget hook 구현**

`machine-score.ts`에 추가:

```typescript
import { mcpLog } from "../../mcp/log.js";

// ADR 0004 OPS_AUTO_INGEST 선례와 일관 — env 전역 토글, 기본 off(비용 방어).
export function isAutoMachineScoreEnabled(): boolean {
  return process.env.OPS_AUTO_MACHINE_SCORE === "1";
}

// runLoop 말미에서 호출. 토글 off 면 즉시 noop. on 이면 비동기로 머신 채점을 띄우고
// 실패는 흡수(실행 결과·다른 자동측정에 영향 X). assertion 자동채점과 동일한 안전 계약.
export function maybeAutoMachineScore(runId: string): void {
  if (!isAutoMachineScoreEnabled()) return;
  void machineScoreRun(runId).catch((e) => {
    try {
      mcpLog.line?.(`machine-score 실패(run ${runId}): ${(e as Error).message}`);
    } catch {
      // 로깅 실패도 흡수.
    }
  });
}
```

> 주의: `mcpLog`에 `line` 메서드가 없으면(시그니처는 `apps/server/src/mcp/log.ts` 확인) 단순 `console.error`로 대체하거나 로깅 줄을 빼고 빈 catch 로 흡수한다. 핵심은 throw 가 새지 않는 것.

- [ ] **Step 4: runLoop 에 hook 연결**

`apps/server/src/domains/run/service.ts`의 `finally` 블록, `evaluateAssertionsForRun(runId);`(약 124줄) **다음 줄**에 추가하고, 상단 import 에 추가:

```typescript
// import 추가 (auto-evaluate import 옆)
import { maybeAutoMachineScore } from "../score/machine-score.js";
```

```typescript
    evaluateAssertionsForRun(runId);
    maybeAutoMachineScore(runId); // 토글 OPS_AUTO_MACHINE_SCORE=1 일 때만(비동기·실패흡수)
    notifyRunCompleted(runId);
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `cd apps/server && corepack pnpm test -- machine-score`
Expected: PASS (env 토글 테스트 포함 전부)

- [ ] **Step 6: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/domains/score/machine-score.ts apps/server/src/domains/run/service.ts
git commit -m "feat(score): runLoop 자동 머신채점 hook (OPS_AUTO_MACHINE_SCORE off-by-default)

토글 on 일 때만 run 완료 후 비동기 머신 채점. 실패 흡수(실행 결과 무영향).
ADR 0004 OPS_AUTO_INGEST 와 동일한 env off-by-default 비용 방어.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 수동 라우트 + compare 표면화

**Files:**
- Modify: `apps/server/src/routes/api/runs.ts` (POST /runs/:id/machine-score, compare)

- [ ] **Step 1: POST /runs/:id/machine-score 추가**

`runs.ts` 상단 import 에 machine-score 추가:

```typescript
import {
  MachineScoreError,
  machineScoreRun,
} from "../../domains/score/machine-score.js";
```

`POST /runs/:id/grade` 블록(약 336-363줄) **바로 아래**에 대칭 라우트를 추가한다:

```typescript
  // 머신 스코어러 — 기준 게이트 + LLM 채점(수동 단건). 토글 off 여도 호출 가능.
  fastify.post(
    "/runs/:id/machine-score",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            runId: z.string(),
            gateStatus: machineGateStatusSchema,
            passed: z.boolean(),
            score: z.number().nullable(),
            criteriaCritique: z.string(),
            suggestedCriteria: z.array(z.string()),
          }),
          400: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        return await machineScoreRun(req.params.id);
      } catch (e) {
        if (e instanceof MachineScoreError) {
          return reply
            .status(400)
            .send({ error: "MachineScoreError", detail: e.message });
        }
        throw e;
      }
    },
  );
```

`machineGateStatusSchema`를 shared-types import 에 추가한다(파일 상단 `@opspilot/shared-types` import 블록).

- [ ] **Step 2: compare 응답에 machineScore 추가**

`GET /runs/compare`의 response 스키마(약 381-383줄)에 한 줄 추가:

```typescript
                assertionScore: scoreSchema.nullable(),
                judgeScore: scoreSchema.nullable(),
                humanScore: scoreSchema.nullable(),
                machineScore: scoreSchema.nullable(),
```

`pickLatest`의 타입(약 410-413줄)과 items 매핑(약 425-427줄)에 machine 추가:

```typescript
      const pickLatest = (
        runId: string,
        scorer: "assertion" | "llm_judge" | "human" | "machine",
      ) => {
```

```typescript
          assertionScore: pickLatest(run.id, "assertion"),
          judgeScore: pickLatest(run.id, "llm_judge"),
          humanScore: pickLatest(run.id, "human"),
          machineScore: pickLatest(run.id, "machine"),
```

- [ ] **Step 3: typecheck + lint**

Run: `corepack pnpm -r typecheck && corepack pnpm lint`
Expected: PASS

- [ ] **Step 4: 라우트 스모크 (격리 서버)**

Run:
```bash
cd apps/server && OPS_DB_PATH=/tmp/ms-smoke.sqlite corepack pnpm db:migrate
```
Expected: "마이그레이션 완료" 출력 — score 테이블이 machine 포함 CHECK 로 생성됨. (라우트 실연동은 Task 7 Playwright 에서 함께.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/api/runs.ts
git commit -m "feat(api): POST /runs/:id/machine-score + compare 에 machineScore

grade 와 대칭 수동 채점 라우트. 비교 뷰에 머신 점수 컬럼 데이터 노출.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: benchmark 집계 + 기준 보류 카운트

**Files:**
- Modify: `packages/shared-types/src/domain.ts` (benchmarkBySourceEntrySchema 에 machine)
- Modify: `apps/server/src/domains/run/benchmark.ts`
- Test: `apps/server/src/domains/run/benchmark.test.ts`

- [ ] **Step 1: benchmark 타입 확장**

`packages/shared-types/src/domain.ts`의 `benchmarkBySourceEntrySchema`(약 235줄)와 `benchmarkAggregateSchema`(약 250줄) 양쪽의 점수 분포 영역에 machine 필드를 더한다. `judge: numericStatsSchema.nullable()` 항목 옆에:

```typescript
  // 머신 스코어러 분포 + 기준 보류 카운트(§6.4 신뢰 게이트용).
  machine: numericStatsSchema.nullable(),
  machineCriteriaWeak: z.number().int().nonnegative(),
  machineNoCriteria: z.number().int().nonnegative(),
```

두 스키마(bySourceEntry, aggregate) 모두 동일하게 추가한다.

- [ ] **Step 2: benchmark 테스트 작성 (실패 확인용)**

`benchmark.test.ts`의 기존 패턴을 따라(파일을 먼저 Read 해 헬퍼·픽스처 빌더 확인) 케이스 추가:

```typescript
it("machine score 분포와 criteria_weak/no_criteria 카운트를 집계한다", () => {
  // 같은 (assetVersion×scenario) 로 run 3개 + score(scorer='machine') 3건:
  //  - scored      score=0.8
  //  - criteria_weak score=0.5
  //  - no_criteria  score=null
  // (기존 테스트의 run/score 삽입 헬퍼를 그대로 사용)
  const agg = aggregateBenchmark(runIds);
  expect(agg.machine?.mean).toBeCloseTo(0.65); // (0.8+0.5)/2, null 제외
  expect(agg.machineCriteriaWeak).toBe(1);
  expect(agg.machineNoCriteria).toBe(1);
});
```

> `benchmark.test.ts`의 기존 score 삽입 방식(createScoreWithDetail 직접 호출 또는 db.prepare)을 확인해 동일하게 machine score 3건을 만든다. detail.gateStatus 로 weak/no_criteria 를 구분 저장한다.

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `cd apps/server && corepack pnpm test -- benchmark`
Expected: FAIL (`agg.machine` 등 undefined)

- [ ] **Step 4: benchmark.ts 구현**

`pickLatestScore` 시그니처(약 36-39줄)에 `"machine"` 추가:

```typescript
function pickLatestScore(
  scores: Score[] | undefined,
  scorer: "assertion" | "llm_judge" | "human" | "machine",
): Score | null {
```

`summarizeSubset`(약 45-84줄)와 `aggregateBenchmark`(약 86-147줄) 양쪽에서 machine 분포·카운트를 모은다. summarizeSubset 의 루프에 추가:

```typescript
  const machineValues: number[] = [];
  let machineCriteriaWeak = 0;
  let machineNoCriteria = 0;
  // ... 기존 for (const r of runs) 루프 안에:
    const m = pickLatestScore(scoresByRun[r.id], "machine");
    if (m) {
      const gs = m.detail?.gateStatus;
      if (gs === "criteria_weak") machineCriteriaWeak += 1;
      else if (gs === "no_criteria") machineNoCriteria += 1;
      if (m.score !== null) machineValues.push(m.score);
    }
```

return 객체에 추가:

```typescript
    machine: stats(machineValues),
    machineCriteriaWeak,
    machineNoCriteria,
```

`aggregateBenchmark`에도 동일한 수집 루프와 return 필드를 더한다(기존 assertion/judge 수집 루프 옆).

- [ ] **Step 5: 테스트 실행 — 통과 확인**

Run: `cd apps/server && corepack pnpm test -- benchmark`
Expected: PASS

- [ ] **Step 6: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: PASS (benchmark 반환이 확장된 스키마와 일치)

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/domain.ts apps/server/src/domains/run/benchmark.ts apps/server/src/domains/run/benchmark.test.ts
git commit -m "feat(benchmark): machine score 분포 + criteria_weak/no_criteria 카운트

§6.4 신뢰 게이트용 — 기준 보류 비율을 프론트가 표면화할 수 있게 집계.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 프론트 표면화 + 실연동 검증

**Files (먼저 Read 해 구조 파악):**
- Modify: `apps/web/src/domains/runs/.../verdict-strip.tsx`
- Modify: compare 뷰 타입·컴포넌트 (machineScore 소비)
- Modify: benchmark-summary.tsx (machine + 신뢰 게이트)
- Modify: grade-panel 또는 asset-detail-panel 의 시나리오·실행 탭 (criteriaCritique·suggestedCriteria 표시)

- [ ] **Step 1: 프론트 구조 파악**

Run:
```bash
cd /Users/ryu-qqq/Documents/ryu-qqq/ops-pilot
rg -l "judgeScore|verdict-strip|benchmark-summary|grade-panel|machineScore" apps/web/src
```
각 파일을 Read 해 기존 assertion/judge/human 표면화 패턴을 확인한다. 머신은 그 패턴을 그대로 따른다(새 디자인 만들지 말 것 — 기존 칸 옆에 추가).

- [ ] **Step 2: verdict-strip 에 machine 칸 추가**

기존 단언·판정·사람 칸과 동일한 컴포넌트 패턴으로 `machine` 칸을 추가한다. gateStatus 별 표시:
- `scored`: 🟢 + score(예: `0.83`)
- `criteria_weak`: 🟡 + score + "신뢰 보류" 툴팁/배지
- `no_criteria`: 🔴 + "기준 없음"(점수 칸은 `—`)

shared-types `machineGateStatusSchema` 타입을 import 해 분기. compare 응답의 `machineScore.detail.gateStatus`를 읽는다.

- [ ] **Step 3: compare 뷰 타입에 machineScore 반영**

compare API 를 호출하는 TanStack Query 훅/타입에 `machineScore` 필드를 더한다(shared-types 의 응답 스키마가 단일 출처면 자동 — 아니면 로컬 타입에 추가).

- [ ] **Step 4: benchmark-summary 에 machine + 신뢰 게이트**

기존 §6.4 "외부 표본 부족 → 비교 신뢰 보류" 게이트 옆에, machine 분포(`machine` 평균)와 **기준 보류 게이트**를 추가: `machineNoCriteria > 0 || machineCriteriaWeak > 0`이면 "기준 보강 필요 — 측정 신뢰 보류" 배지. asset/baked bySource 양쪽 모두.

- [ ] **Step 5: 제안 표시 (criteriaCritique · suggestedCriteria)**

grade-panel(또는 머신 점수가 보이는 상세 영역)에서 머신 score 의 `detail.criteriaCritique`와 `detail.suggestedCriteria[]`를 표시한다. **1차는 읽기 전용 표시만** — "이 제안을 시나리오 성공조건에 직접 반영" 버튼은 만들지 않는다(spec §8 후속).

- [ ] **Step 6: 빌드 + typecheck + lint**

Run:
```bash
corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build
```
Expected: 모두 PASS

- [ ] **Step 7: Playwright 실연동 검증**

격리 신코드 스택을 띄우고(메모리 운영 함정 준수: live DB 는 `apps/server/opspilot.sqlite` WAL → `db.backup()` 일관복사, 신web↔구server 버전스큐 금지 = 양쪽 신코드), 실제 run 하나에 `POST /runs/:id/machine-score`(또는 토글 ON 자동)로 머신 점수를 만든 뒤:
- verdict-strip 에 machine 칸(🟢/🟡/🔴)이 보이는지
- 기준 없는 시나리오에서 no_criteria + suggestedCriteria 표시
- benchmark 뷰에서 기준 보류 게이트

캡처/확인. (토큰을 쓰는 실 채점이므로 1~2건만.)

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): 머신 스코어러 표면화 — verdict-strip·compare·benchmark 신뢰게이트·제안 표시

3상태(scored/criteria_weak/no_criteria) 배지 + 기준 보강 제안 읽기전용 표시.
원클릭 반영은 후속(spec §8).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 완료 기준 (전체 검증)

- [ ] `corepack pnpm -r typecheck` PASS
- [ ] `corepack pnpm lint` PASS
- [ ] `cd apps/server && corepack pnpm test` 전부 PASS (기존 8 + machine-score + benchmark 추가)
- [ ] `cd apps/web && corepack pnpm build` PASS
- [ ] Playwright 실연동: 3상태 중 최소 scored + no_criteria 2분기 화면 확인
- [ ] spec §1~§7 각 요구가 구현됐는지 대조 (§8 범위 밖은 제외)
- [ ] 완료 후: ADR 0005 로 결정 기록(adr 스킬) — "머신 스코어러 = 기준-인식 자동 judge" + Notion Task 의 Wiki ADR·Commit 필드. main `--no-ff` 머지.

## 범위 밖 (이 플랜에서 안 함 — spec §8)

- 보강/초안 제안을 시나리오에 바로 apply 하는 원클릭 HITL 액션
- project.yaml 프로젝트별 토글(1차는 env 전역)
- 임베딩·로컬모델 시맨틱 유사도
- 사람↔머신 점수 자동 환류
