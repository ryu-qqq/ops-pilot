# OpsPilot — 개발 지침 (Claude Code 자동 로드)

OpsPilot = Claude Code 자산(에이전트/스킬/커맨드)을 **프로젝트별로 저작·버저닝·격리실행·평가**하는 로컬 컨트롤 플레인. 배경/서사: [`README.md`](./README.md). 코드 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md).

> **Pivot ADR**: [wiki raw — Cursor-first pivot](https://github.com/ryu-qqq/ryu-qqq-wiki/blob/main/raw/ops-pilot-cursor-first-pivot-2026-05-25.md) · wiki [_overview](https://github.com/ryu-qqq/ryu-qqq-wiki/blob/main/wiki/projects/ops-pilot/_overview.md) · [_verification-status](https://github.com/ryu-qqq/ryu-qqq-wiki/blob/main/wiki/projects/ops-pilot/_verification-status.md)

## 역할 분담 (Cursor-first)

| 도구 | 역할 |
|---|---|
| **Cursor IDE** | 일상 코딩·Composer · worktree · git · 터미널 |
| **Claude Code** | 백그라운드 평가·지침 개선 (`work-evaluator` 등) |
| **OpsPilot** | 실행·평가·MCP · agent-crew 소비 레포 |
| **Engineering OS** (Notion) | *지금 뭘 할지* — Tasks `TASK-xxx` |
| **agent-crew** | 공유 Harness 자산 **원본** (git tag) |
| **LLM wiki** | *왜 그렇게 했는지* — ADR · overview |

## 작업 추적 — Engineering OS (Jira OPSP 대체)

| 리소스 | URL |
|---|---|
| **허브** | https://www.notion.so/36be81355305810ab090d786d4384140 |
| **Tasks** | https://www.notion.so/7097c213a7404f4b956397b52569f3ed |
| **Projects** | https://www.notion.so/1555be7500ef4d898a91cb5343bbc7d9 |
| **Epics** | https://www.notion.so/c8708e25b7f144178dba868869b40f72 |

- Task ID = `TASK-xxx` (Jira `OPSP-xxx` 대체)
- 완료 시 Tasks **`Wiki ADR`** · **`Commit`** 필드 필수
- 프로젝트 설정: `.claude/project.yaml` · agent-crew 핀: `.claude/agent-crew.lock` (현재 **v0.4.0**)

## 작업 루프 (모든 Task 공통, 예외 없음)

1. **Engineering OS Task 읽기** — Notion MCP 또는 허브 🔥 P0. **main에서 새 브랜치** (`feat/...`). main 직접 커밋 금지.
2. **시작** — Task `상태` → `진행 중`. agent-crew `engineering-os` skill / `notion-manager` 위임. wiki 선례는 `wiki-lookup`.
3. **구현** — `CONVENTIONS.md` 준수 (토스 4원칙, `src/domains/<feature>/`, kebab-case, TanStack Query + Query Key Factory, Zod `@opspilot/shared-types`).
4. **검증** (통과 전 커밋 금지): `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`. UI 변경은 Playwright 실연동.
5. **커밋** — 한국어 메시지, 끝에 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
6. **완료** — Notion: `상태` → `완료`, **Wiki ADR**·**Commit** 기록. wiki raw/ 또는 in-repo ADR 필요 시 `journal-recorder`·`adr` skill. 정직한 한계는 Task 코멘트·메모.
7. **머지** — 루프(저작→실행→평가) 닫히면 `main` `--no-ff` 머지.

### Harness 자산 변경 시 (agent-crew)

- **공통** agent/skill 수정 → [agent-crew](https://github.com/ryu-qqq/agent-crew) 레포에서 버전(tag) 올린 뒤 ops-pilot `.claude/` sync (현재 **수동 rsync** — 제품 auto-sync 미구현).
- **ops-pilot 전용** 자산만 이 레포 `.claude/`에 둔다 (판단: *다른 프로젝트가 쓸 수 있나?* → No면 여기).

## 스택 불변식

- Node ≥ 20, **pnpm은 `corepack pnpm`** (전역설치 막힘). 모노레포: `apps/web`(Vite+React+TS) · `apps/server`(Fastify+Zod+better-sqlite3) · `packages/{config,shared-types}`.
- 의존성 최소 원칙. 새 스타일/런타임 의존성 추가는 Engineering OS Task에 근거·결정 기록.

## 서버 기동·검증 격리 (반복된 함정 — 반드시 지킬 것)

- **루트 `pnpm dev` 금지** (= `pnpm -r --parallel dev` → OPS_DB_PATH 없는 server 중복 기동 → 미마이그레이션 DB로 :3001 선점 → `no such table`). 서버=`cd apps/server && OPS_DB_PATH=/tmp/x.sqlite pnpm dev`, 웹=`cd apps/web && pnpm dev` 따로.
- 검증은 항상 **임시 `OPS_DB_PATH`/`OPS_PROJECTS_DIR`/`OPS_WORKTREES_DIR`** 로 격리. 시작 전 `lsof -ti:3001/:5173` 스테일 프로세스 kill. 올바른 서버 확인: `curl /api/runs` 가 정상 JSON인지.
- 사용자용 영속 기동은 기본 DB + `OPS_PROJECTS_DIR=~/Documents/ryu-qqq` + SSH `GIT_SSH_COMMAND`(BatchMode). 영속 DB에 사용자 데이터(spring-platform-commons 등) 있을 수 있음 — wipe 금지, 스키마 변경 시에만 `db:reset` 확인 후.

## 핵심 설계 (바꾸지 말 것, 변경 시 Task로)

- **git 커밋 = 버전의 단일 원천.** 프로젝트는 git URL 클론(`~/.opspilot/projects`). 버전 생성은 OpsPilot이 강제(구조화 커밋 + 훅).
- **실행은 격리 worktree**(프로젝트 클론에서 버전 커밋으로 add, 끝나면 폐기). 클론·원본 무오염.
- **실행은 비동기**(`startRun` 즉시 반환, 백그라운드 `runLoop`, 프론트 폴링).
- 평가축: 시나리오 성공조건 / 사람 스코어(`scorer=human`) / (미구현) 머신 스코어러. 사람 점수→추천 환류는 **아직 미구현 — 현재는 저장만**.
- **MCP 어댑터**: `:3001/mcp` 에 11개 툴(`scan_project`/`list_projects`/`list_assets`/`list_scenarios`/`start_run`/`get_run`/`compare_runs`/`ingest_cursor_session`/`list_proposals`/`apply_proposal`/`review_proposals`). domains 함수 재사용. 등록: `claude mcp add --transport http opspilot http://localhost:3001/mcp`. 데이몬 로그: `mcp/log.ts` (`OPS_TERM_LOG=off`).

## 정직성 규칙

검증 실패·미구현·스코프 함정은 숨기지 말고 **Notion Task 메모**와 사용자 보고에 명시. 추측으로 "된다" 하지 말 것. North Star = "에이전트가 제대로·일관되게 작동하는지 판단을 빨리 돕는가" — UX/기능 추가는 이 기준으로 거른다.
