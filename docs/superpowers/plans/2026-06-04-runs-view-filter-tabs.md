# 실행/트레이스 재구성 (프로젝트 필터 + 상세 3탭) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실행/트레이스 탭에 프로젝트 필터(전역 projectId 재사용 + run 목록 서버 필터 + 리스트에 프로젝트명)를 추가하고, 긴 run 상세를 VerdictStrip 고정 + 3탭(트레이스/평가/시나리오)으로 재구성한다.

**Architecture:** 백엔드는 `listRuns(projectId?)`에 project 조인 WHERE + SELECT project name을 더하고 `GET /runs?projectId=`를 받는다. 프론트는 `useRuns(projectId)`로 Query Key를 분기하고, runs-view에 경량 프로젝트 Select(전역 `opspilot.projectId` 바인딩)를 붙이며, 상세 하단을 shadcn `Tabs`로 분리한다. 컴포넌트 자체(TraceView·GradePanel·ScenarioPanel 등)는 그대로 두고 위치만 옮긴다.

**Tech Stack:** Fastify + Zod · better-sqlite3 · vitest · React + TanStack Query(Query Key Factory) · shadcn Tabs/Select

**참조 스펙:** `docs/superpowers/specs/2026-06-04-runs-view-filter-tabs-design.md`
**브랜치:** `feat/runs-view-tabs` (생성됨, spec 커밋 `bd8d5bb`)

**검증 명령:** `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/server && corepack pnpm test` · `cd apps/web && corepack pnpm build`

> **검증 격리(반복 함정):** 영속 server :3001 / web :5173 watch 중. **루트 `pnpm dev` 금지.** 서버 테스트는 격리 임시 DB(vitest), 빌드만 따로.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `apps/server/src/domains/run/repository.ts` | `RunListItem`에 `projectName`, `listRuns(projectId?)` 조인 WHERE + SELECT | 수정 |
| `apps/server/src/routes/api/runs.ts` | `GET /runs` querystring `projectId?` + `runListItem` zod에 `projectName` | 수정 |
| `apps/server/src/domains/run/list-runs.test.ts` | listRuns 프로젝트 필터·projectName 단위테스트 | **신규** |
| `apps/web/src/domains/run/api.ts` | `runListItemSchema.projectName`, `getRuns(projectId?)`, `runKeys.list(projectId)` | 수정 |
| `apps/web/src/domains/run/use-run.ts` | `useRuns(projectId?)` | 수정 |
| `apps/web/src/domains/run/components/run-list.tsx` | `projectId` prop, 항목에 프로젝트명 | 수정 |
| `apps/web/src/domains/run/components/runs-view.tsx` | 프로젝트 Select + projectId 배선 + 상세 3탭 | 수정 |
| `apps/web/src/app.tsx` | `RunsView`에 `projectId`/`onProjectIdChange` 전달 | 수정 |

---

## Task 1: 백엔드 — listRuns 프로젝트 필터 + projectName

**Files:**
- Modify: `apps/server/src/domains/run/repository.ts` (RunListItem ~120-133, listRuns ~135-150)
- Modify: `apps/server/src/routes/api/runs.ts` (runListItem zod ~59-72, GET /runs ~500-504)
- Test: `apps/server/src/domains/run/list-runs.test.ts` (신규)

- [ ] **Step 1: 실패 테스트 작성**

`apps/server/src/domains/run/list-runs.test.ts` 신규. **먼저 `apps/server/src/domains/run/benchmark.test.ts`를 Read** 해 격리 DB 셋업·`seedRun`류 헬퍼(project→asset→asset_version→scenario→run INSERT 체인)를 확인하고 동일 패턴으로 2개 프로젝트를 시드한다. 골격:

```typescript
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../../db/index.js";
import { migrate } from "../../db/migrate.js";
import { listRuns } from "./repository.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ops-listruns-"));
  dbPath = join(dir, "test.sqlite");
  closeDb();
  migrate(dbPath);
});
afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

// project→asset→asset_version→scenario→run 최소 체인 1개를 시드하고 runId 반환.
// 컬럼은 schema.sql 의 각 테이블 NOT NULL 을 보고 채운다(benchmark.test.ts 선례 참고).
function seedRun(db: ReturnType<typeof getDb>, projectName: string): { projectId: string; runId: string } {
  const now = new Date().toISOString();
  const projectId = randomUUID();
  db.prepare(`INSERT INTO project (id, name, git_url, clone_path, workspace_mode, remote_verified, default_branch, created_at)
              VALUES (?, ?, 'git@x', '/tmp/x', 'managed', 0, 'main', ?)`).run(projectId, projectName, now);
  const assetId = randomUUID();
  db.prepare(`INSERT INTO asset (id, project_id, kind, name, scope, source, source_path, created_at)
              VALUES (?, ?, 'agent', 'a', 'project', 'unknown', '.claude/agents/a.md', ?)`).run(assetId, projectId, now);
  const versionId = randomUUID();
  db.prepare(`INSERT INTO asset_version (id, asset_id, git_commit, created_at)
              VALUES (?, ?, 'c0ffee', ?)`).run(versionId, assetId, now);
  const scenarioId = randomUUID();
  db.prepare(`INSERT INTO scenario (id, asset_id, name, input, expectation, created_at)
              VALUES (?, ?, 's', 'in', '{}', ?)`).run(scenarioId, assetId, now);
  const runId = randomUUID();
  db.prepare(`INSERT INTO run (id, asset_version_id, scenario_id, status, runner, created_at)
              VALUES (?, ?, ?, 'succeeded', 'fixture', ?)`).run(runId, versionId, scenarioId, now);
  return { projectId, runId };
}

describe("listRuns — 프로젝트 필터 + projectName", () => {
  it("projectId 없으면 전체, projectName 이 채워진다", () => {
    const db = getDb(dbPath);
    seedRun(db, "alpha");
    seedRun(db, "beta");
    const all = listRuns();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.projectName).sort()).toEqual(["alpha", "beta"]);
  });
  it("projectId 로 그 프로젝트 run 만 반환한다", () => {
    const db = getDb(dbPath);
    const a = seedRun(db, "alpha");
    seedRun(db, "beta");
    const only = listRuns(a.projectId);
    expect(only.length).toBe(1);
    expect(only[0]?.projectName).toBe("alpha");
  });
});
```

> 주의: `schema.sql`의 project/asset/asset_version/scenario/run DDL NOT NULL 컬럼이 위와 다르면 그에 맞춰 INSERT 컬럼을 보정한다(benchmark.test.ts 의 시드가 이미 같은 체인을 만든다 — 그쪽을 그대로 본떠라).

- [ ] **Step 2: 실패 확인**

Run: `cd apps/server && corepack pnpm test -- list-runs`
Expected: FAIL (`listRuns(projectId)` 미지원 — projectName 없음 / 인자 무시)

- [ ] **Step 3: repository.ts 수정**

`RunListItem` interface에 `projectName` 추가:

```typescript
export interface RunListItem {
  id: string;
  status: string;
  runner: string;
  createdAt: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  scenarioId: string;
  scenarioName: string;
  assetName: string;
  assetKind: string;
  gitCommit: string;
  projectName: string;
}
```

`listRuns`에 optional projectId + project 조인 + 조건:

```typescript
export function listRuns(projectId?: string): RunListItem[] {
  const where = projectId ? "WHERE p.id = @projectId" : "";
  return getDb()
    .prepare(
      `SELECT r.id, r.status, r.runner, r.created_at AS createdAt,
              r.prompt_tokens AS promptTokens, r.completion_tokens AS completionTokens,
              r.cost_usd AS costUsd,
              s.id AS scenarioId, s.name AS scenarioName, a.name AS assetName, a.kind AS assetKind,
              av.git_commit AS gitCommit, p.name AS projectName
       FROM run r
       JOIN scenario s ON s.id = r.scenario_id
       JOIN asset_version av ON av.id = r.asset_version_id
       JOIN asset a ON a.id = av.asset_id
       JOIN project p ON p.id = a.project_id
       ${where}
       ORDER BY r.created_at DESC`,
    )
    .all({ projectId: projectId ?? null }) as RunListItem[];
}
```

> better-sqlite3는 named param이 SQL에 없어도 객체로 넘기면 무시하므로(`@projectId`가 where 없을 때 미사용), `.all({ projectId: ... })`는 안전하다. 만약 "binding parameter not found" 에러가 나면, projectId 유무로 `.all(projectId)` vs `.all()`을 분기하라.

- [ ] **Step 4: runs.ts 라우트 수정**

`runListItem` zod에 `projectName: z.string()` 추가(객체 끝):

```typescript
  gitCommit: z.string(),
  projectName: z.string(),
});
```

`GET /runs`에 querystring + 전달:

```typescript
  fastify.get(
    "/runs",
    {
      schema: {
        querystring: z.object({ projectId: z.string().uuid().optional() }),
        response: { 200: z.object({ runs: z.array(runListItem) }) },
      },
    },
    async (req) => ({ runs: listRuns(req.query.projectId) }),
  );
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm test -- list-runs`
Expected: PASS (2건)

- [ ] **Step 6: typecheck + lint**

Run: `corepack pnpm -r typecheck && corepack pnpm lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/domains/run/repository.ts apps/server/src/routes/api/runs.ts apps/server/src/domains/run/list-runs.test.ts
git commit -m "feat(run): listRuns 프로젝트 필터 + projectName (GET /runs?projectId=)

run→asset→project 조인. projectId 쿼리 파라미터로 그 프로젝트 run 만, projectName 노출.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 프론트 데이터 — 스키마·getRuns·useRuns projectId

**Files:**
- Modify: `apps/web/src/domains/run/api.ts` (runListItemSchema ~16-30, getRuns, runKeys.list ~47)
- Modify: `apps/web/src/domains/run/use-run.ts` (useRuns ~36-44)

- [ ] **Step 1: api.ts — 스키마·키·getRuns에 projectId**

`runListItemSchema`에 `projectName` 추가:

```typescript
  gitCommit: z.string(),
  projectName: z.string(),
});
```

`runKeys.list`를 projectId 분기로:

```typescript
  list: (projectId?: string | null) =>
    [...runKeys.all, "list", projectId ?? "all"] as const,
```

`getRuns`를 Read 해(현재 `/api/runs` GET) projectId 쿼리스트링을 받게 수정. 현재 구현 형태에 맞춰:

```typescript
export async function getRuns(projectId?: string | null): Promise<RunListItem[]> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const { runs } = await apiGet(`/api/runs${qs}`, runsResponse);
  return runs;
}
```

> `apiGet`·`runsResponse`의 정확한 시그니처는 api.ts 기존 코드를 따른다(다른 get 함수와 동형으로).

- [ ] **Step 2: use-run.ts — useRuns(projectId)**

```typescript
export function useRuns(projectId?: string | null) {
  return useQuery({
    queryKey: runKeys.list(projectId),
    queryFn: () => getRuns(projectId),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "running") ? 2000 : false,
  });
}
```

- [ ] **Step 3: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: 일부 호출부(run-list.tsx `useRuns()`)는 인자 없이 호출해도 optional 이라 통과. PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/domains/run/api.ts apps/web/src/domains/run/use-run.ts
git commit -m "feat(web): useRuns(projectId) + runKeys.list 분기 + projectName 스키마

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: run-list — 프로젝트명 표시 + projectId prop

**Files:**
- Modify: `apps/web/src/domains/run/components/run-list.tsx`

- [ ] **Step 1: props에 projectId + useRuns 전달 + 항목에 프로젝트명**

`Props`에 `projectId` 추가, `useRuns(projectId)` 호출, 항목 둘째 줄에 프로젝트명 표시:

```typescript
interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  projectId?: string | null;
}

export function RunList({ selectedId, onSelect, projectId }: Props) {
  const { data: runs, isPending, isError, error } = useRuns(projectId);
  // ... 기존 isPending/isError/empty 분기 그대로 ...
```

리스트 항목의 메타 줄(현재 `{r.scenarioName} · <code>{gitCommit}</code> · {runner}` 부분)에 프로젝트명을 앞에 덧붙인다 — 첫 줄(상태·kind·assetName) 아래 둘째 줄을 두 줄로:

```tsx
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {r.projectName}
              </Badge>
              <span className="truncate">{r.scenarioName}</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              <code className="font-mono">{r.gitCommit.slice(0, 8)}</code> · {r.runner}
              {r.promptTokens !== null &&
                ` · ${String(r.promptTokens + (r.completionTokens ?? 0))} tok`}
            </div>
```

(Badge 는 이미 import 됨.)

- [ ] **Step 2: typecheck + lint + build**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/domains/run/components/run-list.tsx
git commit -m "feat(web): run 리스트 항목에 프로젝트명 배지 + projectId 필터 prop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: runs-view — 프로젝트 Select + projectId 배선

**Files:**
- Modify: `apps/web/src/domains/run/components/runs-view.tsx` (Props·헤더)
- Modify: `apps/web/src/app.tsx` (RunsView 호출 ~110)

- [ ] **Step 1: runs-view Props에 projectId 추가 + 경량 프로젝트 Select**

`Props`에 `projectId`/`onProjectIdChange` 추가. 좌측 run 리스트 카드 위(또는 카드 헤더)에 경량 프로젝트 Select를 둔다 — **ProjectBar 전체(스캔·등록·훅 버튼)는 무거우니 쓰지 말고**, `useProjects()` + shadcn `Select`로 "전체" + 프로젝트 목록만. RunList 에 projectId 전달.

상단 import 추가:

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { useProjects } from "../../project/use-project";
```

Props:

```typescript
interface Props {
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
  compareRunIds: string[];
  onClearCompare: () => void;
  benchmarkRunIds: string[];
  onClearBenchmark: () => void;
  viewMode: RunViewMode;
  onViewModeChange: (m: RunViewMode) => void;
  projectId: string | null;
  onProjectIdChange: (id: string | null) => void;
}
```

좌측 카드를 프로젝트 Select + RunList로:

```tsx
      <Card className="p-4 space-y-3">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">실행 (run)</h2>
          <RunProjectFilter value={projectId} onChange={onProjectIdChange} />
        </div>
        <RunList selectedId={selectedRunId} onSelect={onSelectRun} projectId={projectId} />
      </Card>
```

파일 하단(또는 상단)에 작은 컴포넌트 추가:

```tsx
function RunProjectFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data: projects } = useProjects();
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? null : v)}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="프로젝트 전체" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">프로젝트 전체</SelectItem>
        {(projects ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

> `useProjects` 반환 타입(projects 배열, `{id,name}`)은 `apps/web/src/domains/project/use-project.ts`를 Read 해 확인. 다르면 맞춰라.

- [ ] **Step 2: app.tsx — RunsView 에 projectId 전달**

`app.tsx`의 `<RunsView ... />` 호출(약 110줄)에 추가:

```tsx
          <RunsView
            /* 기존 props 유지 */
            projectId={projectId}
            onProjectIdChange={setProjectId}
          />
```

(`projectId`/`setProjectId`는 app.tsx 20줄에 이미 있음.)

- [ ] **Step 3: typecheck + lint + build**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/domains/run/components/runs-view.tsx apps/web/src/app.tsx
git commit -m "feat(web): 실행/트레이스에 프로젝트 Select(전역 projectId) + run 목록 필터 배선

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 상세 3탭 재구성

**Files:**
- Modify: `apps/web/src/domains/run/components/runs-view.tsx` (상세 영역 ~109-195)

- [ ] **Step 1: 상세 하단을 3탭으로 — VerdictStrip·벤치마크·비교·액션은 고정**

현재 `viewMode === "graph" ? <FlowGraph> : <Card>...(ScenarioPanel·GradePanel·HumanScore·RunRetro·TraceView)` 블록을 **3탭**으로 바꾼다. VerdictStrip(61줄)·BenchmarkSummary·ComparisonView·액션 버튼 줄(109-174)은 **그대로 고정 유지**. 단 "트레이스 리스트 ⇄ 흐름 그래프" 토글(110-128)은 **트레이스 탭 안으로** 옮긴다.

상단 import 추가:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useState } from "react";
```

`RunsView` 함수 본문에 탭 상태:

```typescript
  const [detailTab, setDetailTab] = useState<"trace" | "eval" | "scenario">("trace");
```

액션 버튼 줄(109-174)에서 **viewMode 토글 div(111-128)를 제거**하고(그 토글은 트레이스 탭으로 이동), 변경보기·강제종료·다시실행 버튼 묶음만 남긴다. 그 아래 그래프/카드 분기(176-195)를 통째로 다음 탭 구조로 교체:

```tsx
        {selectedRunId !== null && (
          <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as typeof detailTab)} className="space-y-3">
            <TabsList className="flex w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="trace">트레이스</TabsTrigger>
              <TabsTrigger value="eval">평가</TabsTrigger>
              <TabsTrigger value="scenario">시나리오</TabsTrigger>
            </TabsList>

            <TabsContent value="trace" className="mt-0 space-y-3">
              <div className="flex rounded-md border p-0.5 w-fit">
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
              {viewMode === "graph" ? (
                <FlowGraph selectedRunId={selectedRunId} onSelectRun={onSelectRun} showRunSelect={false} />
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    <TraceView runId={selectedRunId} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="eval" className="mt-0 space-y-3">
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <GradePanel runId={selectedRunId} />
                  <HumanScore runId={selectedRunId} />
                  <RunRetro runId={selectedRunId} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scenario" className="mt-0 space-y-3">
              <Card>
                <CardContent className="pt-4">
                  <ScenarioPanel runId={selectedRunId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
```

> `CardHeader`("트레이스 — 왜 그렇게 행동했나")는 탭으로 대체되므로 제거. `CardHeader`/`CardTitle` import가 다른 곳(benchmark/compare 카드)에서 여전히 쓰이면 import 유지, 안 쓰이면 lint 가 잡는다 — lint 따라 정리.

- [ ] **Step 2: typecheck + lint + build**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: PASS (미사용 import 있으면 제거)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/domains/run/components/runs-view.tsx
git commit -m "feat(web): run 상세를 3탭(트레이스/평가/시나리오)으로 — VerdictStrip·액션 고정

긴 상세를 한 관심사씩. 트레이스 리스트⇄그래프 토글은 트레이스 탭 안으로.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Playwright 실연동 검증 (controller)**

영속 web :5173(이 브랜치 코드 reload)·server :3001에서:
- 실행/트레이스 탭 → 프로젝트 Select에 프로젝트 목록 + "전체", 선택 시 run 목록이 그 프로젝트로 필터되는지
- run 리스트 항목에 프로젝트명 배지
- run 선택 시 VerdictStrip 고정 + 3탭(트레이스 기본/평가/시나리오) 전환, 트레이스 탭 안 리스트⇄그래프 토글
- (web 재시작 필요 시: lsof :5173 kill 후 `cd apps/web && corepack pnpm dev`)

---

## 완료 기준

- [ ] `corepack pnpm -r typecheck` · `lint` PASS
- [ ] `cd apps/server && corepack pnpm test` 전부 PASS (list-runs 신규 포함)
- [ ] `cd apps/web && corepack pnpm build` PASS
- [ ] Playwright: 프로젝트 필터 동작 + 리스트 프로젝트명 + 3탭 전환 확인
- [ ] spec §2 A·B 요구 대조

## 범위 밖 (spec §4)

- 상태·source·종류 등 추가 필터 (프로젝트 필터만)
- 상세 컴포넌트 내부 로직 변경 (위치만 탭으로)
- 새 디자인 시스템
