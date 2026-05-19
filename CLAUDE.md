# OpsPilot — 개발 지침 (Claude Code 자동 로드)

OpsPilot = Claude Code 자산(에이전트/스킬/커맨드)을 **프로젝트별로 저작·버저닝·격리실행·평가**하는 로컬 컨트롤 플레인. 배경/서사: [`README.md`](./README.md). 코드 규칙: [`CONVENTIONS.md`](./CONVENTIONS.md).

> **먼저 읽어라**: 이 세션 메모리(`MEMORY.md` → `opspilot-harness-control-plane.md`)에 현재 진척·미머지 여부·남은 백로그·정직한 한계·운영 메모가 있다. 작업 시작 전 그걸로 현재 상태를 확인하라. 작업 추적은 지라 `OPSP`(`ryu-qqq.atlassian.net`, cloudId `30a5c83f-d274-485a-af23-37c40c0e4f9f`), 에픽 **OPSP-14**.

## 작업 루프 (모든 이슈 공통, 예외 없음)

1. 지라 이슈 읽기 → **main에서 새 브랜치** (`feat/...`). 기능을 main에 직접 커밋하지 말 것.
2. 구현 — `CONVENTIONS.md` 준수 (토스 4원칙, 도메인 폴더 `src/domains/<feature>/`, kebab-case, 서버상태=TanStack Query + Query Key Factory, 검증=공통 Zod `@opspilot/shared-types`).
3. 검증(통과 전 커밋 금지): `corepack pnpm -r typecheck` · `corepack pnpm lint` · `cd apps/web && corepack pnpm build`. UI 변경은 Playwright로 실연동 확인.
4. 커밋 (한국어 메시지, 끝에 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`).
5. 지라: 진행중→완료 전이 + 산출물·검증·커밋해시 코멘트. 정직한 한계도 코멘트에.
6. 메모리 갱신(진척·다음 단계). 루프(저작→실행→평가류)가 닫히면 브랜치 main 머지(`--no-ff`).

## 스택 불변식

- Node ≥ 20, **pnpm은 `corepack pnpm`** (전역설치 막힘). 모노레포: `apps/web`(Vite+React+TS) · `apps/server`(Fastify+Zod+better-sqlite3) · `packages/{config,shared-types}`.
- 의존성 최소 원칙. 새 스타일/런타임 의존성 추가는 이슈에 근거·결정 기록.

## 서버 기동·검증 격리 (반복된 함정 — 반드시 지킬 것)

- **루트 `pnpm dev` 금지** (= `pnpm -r --parallel dev` → OPS_DB_PATH 없는 server 중복 기동 → 미마이그레이션 DB로 :3001 선점 → `no such table`). 서버=`cd apps/server && OPS_DB_PATH=/tmp/x.sqlite pnpm dev`, 웹=`cd apps/web && pnpm dev` 따로.
- 검증은 항상 **임시 `OPS_DB_PATH`/`OPS_PROJECTS_DIR`/`OPS_WORKTREES_DIR`** 로 격리. 시작 전 `lsof -ti:3001/:5173` 스테일 프로세스 kill. 올바른 서버 확인: `curl /api/runs` 가 정상 JSON인지.
- 사용자용 영속 기동은 기본 DB + `OPS_PROJECTS_DIR=~/Documents/ryu-qqq` + SSH `GIT_SSH_COMMAND`(BatchMode). 영속 DB에 사용자 데이터(spring-platform-commons 등) 있을 수 있음 — wipe 금지, 스키마 변경 시에만 `db:reset` 확인 후.

## 핵심 설계 (바꾸지 말 것, 변경 시 이슈로)

- **git 커밋 = 버전의 단일 원천.** 프로젝트는 git URL 클론(`~/.opspilot/projects`). 버전 생성은 OpsPilot이 강제(구조화 커밋 + 훅).
- **실행은 격리 worktree**(프로젝트 클론에서 버전 커밋으로 add, 끝나면 폐기). 클론·원본 무오염.
- **실행은 비동기**(`startRun` 즉시 반환, 백그라운드 `runLoop`, 프론트 폴링).
- 평가축: 시나리오 성공조건 / 사람 스코어(`scorer=human`) / (미구현) 머신 스코어러. 사람 점수→추천 환류(OPSP-21)는 **아직 미구현 — 현재는 저장만**.

## 정직성 규칙

검증 실패·미구현·스코프 함정은 숨기지 말고 지라 코멘트와 사용자 보고에 명시. 추측으로 "된다" 하지 말 것. North Star = "에이전트가 제대로·일관되게 작동하는지 판단을 빨리 돕는가" — UX/기능 추가는 이 기준으로 거른다.
