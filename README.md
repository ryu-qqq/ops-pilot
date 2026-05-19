# OpsPilot — Harness Control Plane

내가 만든 Claude Code 자산(에이전트 / 스킬 / 커맨드)이 **정말 의도대로, 일관되게 작동하는지**
검증·관측·버저닝하는 로컬 컨트롤 플레인.

> 왜: 조직 위키 `Software 3.0 시대, Harness를 통한 조직 생산성 저점 높이기`는
> 에이전트·스킬·커맨드를 플러그인으로 배포하면 팀 생산성 저점이 올라간다고 주장한다.
> 그러나 그 선언문 스스로 *"플러그인 리뷰/버저닝/배포 프로세스"* 와
> *"토큰 효율성·에이전트 정확도 모니터링 체계"* 는 미구현 과제로 남겼다.
> 이 프로젝트가 그 빠진 컨트롤 플레인이다. **선언 → 지라 체계화 → 구현** 의 서사.

## 핵심 (4대 평가 축)

1. **회귀 테스트** — 시나리오 셋으로 통과/실패 자동 채점
2. **실행 트레이스 관측** — 에이전트가 어떤 툴을 왜 호출했는지 시각화
3. **버전 A·B diff** — 프롬프트 변경의 행동 차이 정량 비교
4. **LLM-as-judge** — 정답 없는 작업의 기준 기반 채점

git 커밋 = 버전의 단일 원천.

## 스택

| 영역 | 선택 |
|---|---|
| 프론트 | Vite + React + TypeScript |
| 백엔드 | Node.js + TypeScript + Fastify |
| 저장소 | better-sqlite3 |
| 러너 | 로컬 `claude` CLI 헤드리스 직접 spawn (기존 로컬 인증 직결, 별도 키 불필요) |
| 모노레포 | pnpm workspace (`apps/web` + `apps/server` + `packages/*`) |

코드 컨벤션은 [`CONVENTIONS.md`](./CONVENTIONS.md) (토스 4원칙 기반). 작업 추적은 지라 `OPSP`.

## 상태

MVP Phase 1 **완료** (지라 OPSP-2~8): 레지스트리·스캐너·러너·대시보드·트레이스 뷰어.
백로그 = OPSP-9~12 (회귀 점수판 / A·B diff / 버전 활성화 / 토큰 패널).

## 데모 (Phase 1) — 클린 환경 재현

전제: Node ≥ 20, `corepack`(pnpm), 평가 대상 레포(예: 어떤 `.claude/`를 가진 git 레포).

```bash
# 1) 설치
corepack pnpm install

# 2) 백엔드 (터미널 A) — DB 자동 생성 + 기동
cd apps/server && corepack pnpm db:migrate && corepack pnpm dev   # :3001

# 3) 프론트 (터미널 B)
cd apps/web && corepack pnpm dev                                  # :5173
```

브라우저 `http://localhost:5173`:

1. **레지스트리** 탭 → 스캔할 레포 경로 입력 → **스캔** → 자산(에이전트/스킬/커맨드) 목록
2. 자산 선택 → 우측 **git 버전 타임라인** (커밋 = 버전)
3. 버전 선택 → **이 버전으로 실행** 폼 → 시나리오 입력 → `fixture`(토큰0·결정론) 또는 `local-claude`(실제) → **▶ 실행**
4. 자동으로 **실행 / 트레이스** 탭 이동 → run 선택 → 단계별 트레이스(툴 호출·판단·토큰) 펼쳐보기

> 한 줄 기동: 루트 `corepack pnpm dev` (= web+server 동시). 단 격리 테스트 시엔
> 워크스페이스별로 따로 띄우고 `OPS_DB_PATH`로 DB를 분리한다.

스크린샷: [`docs/screenshots/`](./docs/screenshots/) (레지스트리 대시보드, 트레이스 뷰어, E2E 흐름).

---

## 후순위 (나중에) — 원래 ops-pilot 비전

이 디렉터리는 원래 다른 포트폴리오(토스 *Web Automation Platform* JD 정조준:
에러로그 → LLM RCA → Jira/wiki 자동기록 → 데이터 플라이휠 AX 플랫폼)였다.
**그 작업은 후순위로 미루고**, 이 레포는 위 Harness Control Plane을 먼저 한다.

원래 코드·상세 브리프(`PROJECT_BRIEF.md`)·헥사고날 스캐폴드는 전부
`../ops-pilot-legacy-backup-20260519.tar.gz` 에 보존돼 있다. 나중에 그 비전으로
돌아갈 때 이 백업을 풀어 참조한다. (요지: Node/TS, AWS, Slack=UI, MCP, RCA 7필드, 플라이휠)
