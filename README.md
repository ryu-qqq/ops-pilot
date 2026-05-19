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
| 러너 | @anthropic-ai/claude-agent-sdk (TS, 헤드리스) |
| 모노레포 | pnpm workspace (`apps/web` + `apps/server` + `packages/*`) |

코드 컨벤션은 [`CONVENTIONS.md`](./CONVENTIONS.md) (토스 4원칙 기반). 작업 추적은 지라 `OPSP`.

## 상태

MVP Phase 1 = 레지스트리 + 트레이스 뷰어 (지라 OPSP-2~8). 백로그 = OPSP-9~12.

---

## 후순위 (나중에) — 원래 ops-pilot 비전

이 디렉터리는 원래 다른 포트폴리오(토스 *Web Automation Platform* JD 정조준:
에러로그 → LLM RCA → Jira/wiki 자동기록 → 데이터 플라이휠 AX 플랫폼)였다.
**그 작업은 후순위로 미루고**, 이 레포는 위 Harness Control Plane을 먼저 한다.

원래 코드·상세 브리프(`PROJECT_BRIEF.md`)·헥사고날 스캐폴드는 전부
`../ops-pilot-legacy-backup-20260519.tar.gz` 에 보존돼 있다. 나중에 그 비전으로
돌아갈 때 이 백업을 풀어 참조한다. (요지: Node/TS, AWS, Slack=UI, MCP, RCA 7필드, 플라이휠)
