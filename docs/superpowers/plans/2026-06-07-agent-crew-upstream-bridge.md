# agent-crew 상류 안내 다리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** crew 자산(agent/skill/command) 개선안이 프로젝트 clone에 조용히 적용돼 분기되는 걸 막고, "상류(agent-crew)에서 고쳐라"를 사전 배지로 알리고 apply 시 차단·안내한다.

**Architecture:** 단일 판정 함수(`classifyProposalTarget`, agent-crew.lock의 syncedFiles 멤버십)를 진실원으로 둔다. 서버 apply 진입에서 crew면 `UpstreamRequiredError`를 던져 차단(진짜 방어선). 조회 API는 `crewBound`를 실어 UI 사전 배지에 쓴다. UI는 best-effort 배지+버튼 대체.

**Tech Stack:** Fastify · Zod(@opspilot/shared-types) · better-sqlite3 · vitest · React + TanStack Query · shadcn/ui

---

## File Structure

- **Create** `apps/server/src/domains/feedback/classify-target.ts` — 판정 함수 + `UpstreamRequiredError` + crew 경로/info 빌더. 순수 로직 한 곳.
- **Create** `apps/server/src/domains/feedback/classify-target.test.ts` — vitest 단위 테스트.
- **Modify** `apps/server/src/domains/agent-crew/sync.ts:8` — `DEFAULT_CREW_PATH` export.
- **Modify** `packages/shared-types/src/domain.ts:497` — `proposalWithSourceSchema`에 `crewBound` optional 추가.
- **Modify** `apps/server/src/domains/feedback/proposal-service.ts` — `listProposalsForProject`에서 crewBound 채움(54), `applyProposal` catch에서 UpstreamRequiredError re-throw(101).
- **Modify** `apps/server/src/domains/feedback/apply.ts:209` — applyProposalToProject 진입에 차단.
- **Modify** `apps/server/src/routes/api/feedback.ts:273` — apply 라우트 409 분기.
- **Modify** `apps/server/src/mcp/server.ts:431` — apply_proposal 분기.
- **Modify** `apps/web/src/domains/feedback/components/proposal-card.tsx` — 배지(129)+버튼 대체(201).

---

### Task 1: 판정 함수 + UpstreamRequiredError (단일 진실)

**Files:**
- Modify: `apps/server/src/domains/agent-crew/sync.ts:8`
- Create: `apps/server/src/domains/feedback/classify-target.ts`
- Test: `apps/server/src/domains/feedback/classify-target.test.ts`

- [ ] **Step 1: sync.ts에서 DEFAULT_CREW_PATH export**

`apps/server/src/domains/agent-crew/sync.ts:8`을 `const DEFAULT_CREW_PATH = ...`에서 `export const DEFAULT_CREW_PATH = ...`로 변경(값 동일).

- [ ] **Step 2: 실패하는 테스트 작성**

Create `apps/server/src/domains/feedback/classify-target.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { AgentCrewLockFile } from "../agent-crew/sync.js";
import { classifyProposalTarget } from "./classify-target.js";

const lockWith = (files: string[]): AgentCrewLockFile => ({
  version: "v0.12.0",
  syncedFiles: files,
});

describe("classifyProposalTarget", () => {
  it("cursor_rule 은 manifest 와 무관하게 항상 project", () => {
    expect(classifyProposalTarget(lockWith([".cursor/rules/x.mdc"]), "cursor_rule", ".cursor/rules/x.mdc")).toBe("project");
  });

  it("agent 가 manifest 에 있으면 crew", () => {
    expect(classifyProposalTarget(lockWith([".claude/agents/foo.md"]), "agent", ".claude/agents/foo.md")).toBe("crew");
  });

  it("agent 가 manifest 에 없으면 project-local", () => {
    expect(classifyProposalTarget(lockWith([".claude/agents/other.md"]), "agent", ".claude/agents/foo.md")).toBe("project");
  });

  it("lock 이 null 이면 project (agent-crew 미사용)", () => {
    expect(classifyProposalTarget(null, "agent", ".claude/agents/foo.md")).toBe("project");
  });

  it("syncedFiles 가 비면 project (legacy lock, 추측 금지)", () => {
    expect(classifyProposalTarget(lockWith([]), "skill", ".claude/skills/foo/SKILL.md")).toBe("project");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/feedback/classify-target.test.ts`
Expected: FAIL — `classify-target.js` 없음 / `classifyProposalTarget` 미정의.

- [ ] **Step 4: classify-target.ts 구현**

Create `apps/server/src/domains/feedback/classify-target.ts`:

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ImprovementTargetKind } from "@opspilot/shared-types";
import { type AgentCrewLockFile, DEFAULT_CREW_PATH } from "../agent-crew/sync.js";

/** crew 로 올라갈 수 있는 자산 종류. cursor_* · workflow_patch 는 항상 프로젝트 전용. */
const CREW_KINDS = new Set<ImprovementTargetKind>(["agent", "skill", "command"]);

/**
 * 개선안 대상이 공유 crew 자산인지 프로젝트 전용인지 판정한다 — 단일 진실.
 * 기준: targetKind 가 crew 종류이고 targetPath 가 그 프로젝트 agent-crew.lock 의
 * syncedFiles manifest 에 있으면 crew. (scanner 의 buildSourceTagger 와 같은 기준.)
 * lock 없음 / manifest 빔 = project (추측 금지).
 */
export function classifyProposalTarget(
  lock: AgentCrewLockFile | null,
  targetKind: ImprovementTargetKind,
  targetPath: string,
): "crew" | "project" {
  if (!CREW_KINDS.has(targetKind)) return "project";
  const manifest = lock?.syncedFiles;
  if (!manifest || manifest.length === 0) return "project";
  return manifest.includes(targetPath) ? "crew" : "project";
}

export interface UpstreamRequiredInfo {
  crewRepoPath: string;
  crewRelPath: string;
  crewFileExists: boolean;
  content: string;
  resyncHint: string;
}

/** crew 차단 시 안내 페이로드. crewFileExists=false 면 tag drift(manifest엔 crew인데 현 버전 부재). */
export function buildUpstreamInfo(targetPath: string, content: string): UpstreamRequiredInfo {
  const crewRepoPath = process.env.OPS_AGENT_CREW_PATH ?? DEFAULT_CREW_PATH;
  const crewRelPath = targetPath.replace(/^\.claude\//, "");
  const crewFileExists = existsSync(join(crewRepoPath, crewRelPath));
  const driftNote = crewFileExists
    ? ""
    : " (주의: manifest 엔 crew 인데 현 crew 레포엔 이 파일이 없음 — tag 확인 필요)";
  return {
    crewRepoPath,
    crewRelPath,
    crewFileExists,
    content,
    resyncHint: `${crewRepoPath} 에서 ${crewRelPath} 를 고치고 tag 올린 뒤 sync_agent_crew 로 재동기화하세요.${driftNote}`,
  };
}

/** apply 차단 신호 — "실패"가 아니라 "상류에서 처리해야 함". route/MCP 가 잡아 안내로 변환. */
export class UpstreamRequiredError extends Error {
  readonly info: UpstreamRequiredInfo;
  constructor(info: UpstreamRequiredInfo) {
    super("공유 crew 자산이라 프로젝트 clone 에 적용하지 않습니다 — agent-crew 레포에서 수정하세요.");
    this.name = "UpstreamRequiredError";
    this.info = info;
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd apps/server && corepack pnpm vitest run src/domains/feedback/classify-target.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: 커밋**

```bash
git add apps/server/src/domains/agent-crew/sync.ts apps/server/src/domains/feedback/classify-target.ts apps/server/src/domains/feedback/classify-target.test.ts
git commit -m "feat(server): crew 자산 판정 함수 + UpstreamRequiredError

agent-crew.lock syncedFiles 멤버십으로 개선안 대상이 crew인지 판정.
단일 진실. 차단 안내 페이로드(tag drift 메모 포함)와 에러 타입.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 응답 스키마 crewBound + 조회에서 채움

**Files:**
- Modify: `packages/shared-types/src/domain.ts:497-504`
- Modify: `apps/server/src/domains/feedback/proposal-service.ts:53-59`

- [ ] **Step 1: 스키마에 crewBound 추가**

`packages/shared-types/src/domain.ts`의 `proposalWithSourceSchema`(497) extend 안에 한 줄 추가:

```typescript
export const proposalWithSourceSchema = improvementProposalSchema.extend({
  commitSubject: z.string().nullable(),
  gitRef: z.string(),
  evalRunId: z.string().nullable(),
  reviewRunId: z.string().nullable(),
  trigger: ingestTriggerSchema,
  // crew 자산 여부(파생). 서버 조회에서 채움. ingest 뷰 등 미채움 경로는 undefined →
  // UI 는 === true 로만 분기, 진짜 차단은 서버 apply 가 한다.
  crewBound: z.boolean().optional(),
});
```

- [ ] **Step 2: service에서 crewBound 채움**

`apps/server/src/domains/feedback/proposal-service.ts`의 `listProposalsForProject`(54-59)를 교체. 상단 import에 다음을 추가(기존 import 블록):

```typescript
import { getProject } from "../registry/repository.js";
import { readAgentCrewLock } from "../agent-crew/sync.js";
import { classifyProposalTarget } from "./classify-target.js";
```

(주의: `getProject`·`readAgentCrewLock`의 정확한 export 경로는 typecheck로 확인 — service는 이미 `getProject`를 apply 경로 95줄에서 쓰므로 같은 import 출처를 재사용한다.)

함수 교체:

```typescript
/** 프로젝트 전역 proposal 큐. status 없으면 전체. crewBound 채워서 반환. */
export function listProposalsForProject(
  projectId: string,
  status?: ImprovementProposalStatus,
): ProposalWithSource[] {
  const rows = listProposalsByProject(projectId, status);
  const project = getProject(projectId);
  const lock = project ? readAgentCrewLock(project.clonePath) : null;
  return rows.map((p) => ({
    ...p,
    crewBound: classifyProposalTarget(lock, p.targetKind, p.targetPath) === "crew",
  }));
}
```

`ProposalWithSource` 타입 import가 없으면 `import type { ProposalWithSource } from "@opspilot/shared-types"` 추가. 기존 반환타입 `ProposalWithSourceRow[]`는 더 안 쓰면 import 정리.

- [ ] **Step 3: 빌드 검증**

Run: `corepack pnpm -r typecheck`
Expected: PASS. (실패 시 import 출처·`ProposalWithSourceRow` vs `ProposalWithSource` 타입 정합 조정)

- [ ] **Step 4: 커밋**

```bash
git add packages/shared-types/src/domain.ts apps/server/src/domains/feedback/proposal-service.ts
git commit -m "feat: proposal 조회에 crewBound 노출 — UI 사전 배지용

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: apply 차단 + service re-throw

**Files:**
- Modify: `apps/server/src/domains/feedback/apply.ts:209-213`
- Modify: `apps/server/src/domains/feedback/proposal-service.ts:101-104`

- [ ] **Step 1: applyProposalToProject 진입에 차단 추가**

`apps/server/src/domains/feedback/apply.ts` 상단 import에 추가:

```typescript
import { readAgentCrewLock } from "../agent-crew/sync.js";
import { buildUpstreamInfo, classifyProposalTarget, UpstreamRequiredError } from "./classify-target.js";
```

`applyProposalToProject`(209) 본문 맨 앞(`const summary =` 직전)에 삽입:

```typescript
export function applyProposalToProject(
  project: Project,
  proposal: ImprovementProposal,
): string {
  const lock = readAgentCrewLock(project.clonePath);
  if (classifyProposalTarget(lock, proposal.targetKind, proposal.targetPath) === "crew") {
    throw new UpstreamRequiredError(buildUpstreamInfo(proposal.targetPath, proposal.content));
  }

  const summary = `feedback proposal ${proposal.id.slice(0, 8)} → ${posix.basename(proposal.targetPath)}`;
  // ...기존 분기 유지...
```

- [ ] **Step 2: service applyProposal catch에서 re-throw**

`apps/server/src/domains/feedback/proposal-service.ts`의 `applyProposal` catch(101-104)를 교체. 상단 import에 `import { UpstreamRequiredError } from "./classify-target.js";` 추가:

```typescript
  try {
    appliedCommit = applyProposalToProject(project, proposal);
  } catch (e) {
    if (e instanceof UpstreamRequiredError) throw e; // 상류행 — ApplyError 로 뭉개지 않음
    const msg = e instanceof FeedbackApplyError ? e.message : (e as Error).message;
    throw new FeedbackProposalError("ApplyError", msg);
  }
```

- [ ] **Step 3: typecheck**

Run: `corepack pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/server/src/domains/feedback/apply.ts apps/server/src/domains/feedback/proposal-service.ts
git commit -m "feat(server): crew 자산 개선안 apply 차단 — 조용한 분기 방지

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: route + MCP 변환 (409 / errorResult)

**Files:**
- Modify: `apps/server/src/routes/api/feedback.ts:273-285`
- Modify: `apps/server/src/mcp/server.ts:431-439`

- [ ] **Step 1: REST 라우트 분기**

`apps/server/src/routes/api/feedback.ts` 상단 import에 `import { UpstreamRequiredError } from "../../domains/feedback/classify-target.js";` 추가(상대경로는 파일 위치 기준 조정). apply 핸들러 catch(현재 FeedbackProposalError만 분기, 273줄 근처)에 최우선 분기 추가:

```typescript
  } catch (e) {
    if (e instanceof UpstreamRequiredError) {
      return reply.status(409).send({ error: "UpstreamRequired", upstream: e.info });
    }
    if (e instanceof FeedbackProposalError) {
      if (e.code === "NotFound") {
        return reply.status(404).send({ error: "NotFound", detail: e.message });
      }
      return reply.status(400).send({ error: e.code, detail: e.message });
    }
    throw e;
  }
```

(409 응답 바디는 별도 Zod 스키마로 강제하지 않는다 — 에러 경로라 기존 라우트의 에러 응답들과 동일하게 자유 객체. 성공 응답 스키마는 그대로.)

- [ ] **Step 2: MCP apply_proposal 분기**

`apps/server/src/mcp/server.ts` 상단 import에 `import { UpstreamRequiredError } from "../domains/feedback/classify-target.js";` 추가(상대경로 조정). apply_proposal catch(431-439)에 최우선 분기:

```typescript
  } catch (e) {
    if (e instanceof UpstreamRequiredError) {
      return jsonResult({ upstreamRequired: true, ...e.info });
    }
    if (e instanceof FeedbackProposalError) return errorResult(`${e.code}: ${e.message}`);
    return errorResult(`apply failed: ${(e as Error).message}`);
  }
```

- [ ] **Step 3: typecheck + lint**

Run: `corepack pnpm -r typecheck && corepack pnpm lint`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add apps/server/src/routes/api/feedback.ts apps/server/src/mcp/server.ts
git commit -m "feat(server): crew 차단을 409/MCP 안내로 변환 — 500 아닌 정상 분기

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — 사전 배지 + 버튼 대체

**Files:**
- Modify: `apps/web/src/domains/feedback/components/proposal-card.tsx:128-131, 201-227`

- [ ] **Step 1: crewBound 배지 추가**

`proposal-card.tsx`의 CardTitle(128-131) 안, targetKind span 뒤에 추가:

```tsx
<Badge variant={proposalVariant[proposal.status] ?? "secondary"}>{proposal.status}</Badge>
<span className="font-mono text-xs text-muted-foreground">{proposal.targetKind}</span>
{proposal.crewBound === true && (
  <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
    공유 crew
  </Badge>
)}
```

- [ ] **Step 2: approved 블록에서 crew면 버튼 대체**

`proposal-card.tsx`의 `{proposal.status === "approved" && (` 블록(201-227)을 crewBound 분기로 감싼다. crewBound면 apply 호출 대신 안내 Dialog:

```tsx
{proposal.status === "approved" && (
  proposal.crewBound === true ? (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileCode className="h-3.5 w-3.5" />
          agent-crew에서 수정
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>공유 crew 자산 — 상류에서 수정</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          이 개선안은 여러 프로젝트가 공유하는 crew 자산(<code className="font-mono text-xs">{proposal.targetPath}</code>)
          이라 이 프로젝트 clone 에 적용하지 않습니다. agent-crew 레포에서 고치고 tag 올린 뒤
          <code className="font-mono text-xs"> sync_agent_crew </code>로 재동기화하세요.
        </p>
        <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
          {proposal.content}
        </pre>
      </DialogContent>
    </Dialog>
  ) : (
    <Dialog>
      {/* ...기존 "clone에 반영" Dialog 그대로... */}
    </Dialog>
  )
)}
```

(기존 Dialog 블록 전체를 else 가지로 옮긴다. apply.mutate 호출은 else 가지에만 남는다.)

- [ ] **Step 3: 빌드 검증**

Run: `cd apps/web && corepack pnpm build`
Expected: PASS. import(`FileCode`, `Badge`, `Dialog*`)는 이미 파일에서 사용 중이라 추가 import 불필요.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/domains/feedback/components/proposal-card.tsx
git commit -m "feat(web): crew 개선안 사전 배지 + agent-crew 수정 안내로 버튼 대체

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 통합 검증 — 실데이터 e2e + Playwright

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 정적 검증**

Run: `corepack pnpm -r typecheck && corepack pnpm lint && cd apps/web && corepack pnpm build`
Expected: 모두 PASS.

- [ ] **Step 2: server 단위 테스트 회귀**

Run: `cd apps/server && corepack pnpm vitest run`
Expected: classify-target 5건 포함 전부 PASS.

- [ ] **Step 3: 실데이터 e2e — terraform-reviewer 차단 확인**

격리 검증(CLAUDE.md): 임시 DB 대신 영속 DB를 읽기만 하는 단발 확인. infrastructure 프로젝트의 그 1건(`.claude/agents/terraform-reviewer.md`, crew manifest 멤버)을 apply 시도하면 차단되는지 본다. 서버를 임시 격리로 띄우거나, 판정만 떼어 확인:

```bash
# infrastructure lock manifest 에 그 경로가 있는지(=crew 판정 입력) 재확인
grep -F ".claude/agents/terraform-reviewer.md" /Users/ryu-qqq/Documents/ryu-qqq/Infrastructure/.claude/agent-crew.lock && echo "crew 입력 확인"
```

Expected: 매치 → classifyProposalTarget 이 "crew" 반환할 입력. (그 proposal 은 이미 status=applied 라 재apply 불가하니, 실제 apply 호출 e2e 는 새 crew 개선안이 생길 때로 미룬다 — 이 단계는 판정 입력 일치까지 확정하고, 차단 로직 자체는 Task1 단위테스트가 보증함을 기록.)

- [ ] **Step 4: Playwright UI 실연동**

격리 스택 기동(CLAUDE.md: 임시 OPS_DB_PATH). 작업 탭에서 crew 개선안 카드가 있으면 "공유 crew" 배지와 "agent-crew에서 수정" 버튼·안내 Dialog가 뜨는지 1회 확인. crew 개선안이 영속 DB에 approved 상태로 없으면, 임시 DB에 한 건 시드하거나 이 단계는 "배지/버튼 렌더 경로는 build·타입으로 보증, 실데이터 표면은 다음 crew 개선안 때 확인"으로 정직히 기록.

- [ ] **Step 5: 검증 결과 기록**

통과/미검증 항목을 정직하게 정리(특히 e2e 가 실데이터 부재로 부분 확인이면 명시).

---

## 비포함 (YAGNI)
자동 commit/push/PR, fork, tag 생성, 충돌 병합 없음. crewBound 가 쌓이면 반자동 export 의 토대(증분).
