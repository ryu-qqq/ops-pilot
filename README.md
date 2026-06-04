# OpsPilot

Claude Code 에이전트·스킬·커맨드를 만들고, 버전을 매기고, 격리된 환경에서 돌려보고, 점수로 평가하는 로컬 도구.

내가 만든 에이전트가 의도대로 일관되게 작동하는지를 느낌이 아니라 트레이스와 점수로 확인하려고 만들었다.

![작업 탭](docs/screenshots/work-list.png)

## 왜 만들었나

조직 위키의 Harness 글은 "에이전트·스킬을 플러그인으로 배포하면 팀 생산성의 저점이 올라간다"고 주장한다. 그런데 정작 *배포한 자산이 제대로 작동하는지 판단할 방법*은 비워뒀다 — 리뷰도, 버저닝도, 정확도 모니터링도. 그게 없으면 "좋아 보이는" 프롬프트를 느낌으로 고치고, 이전 버전과 뭐가 달라졌는지도 모른 채 넘어간다. OpsPilot은 그 빈자리를 메운다.

## 어떻게 동작하나

만들고 → 버전 매기고 → 격리 실행하고 → 평가하고 → 채택하는 한 바퀴를 닫는다.

자산은 폼으로 작성한다(컨셉 한 줄을 주면 AI가 트리거·도구·본문 초안을 채운다). 저장하면 구조화 커밋이 강제되는데, 여기서 git 커밋 하나가 곧 버전 하나다 — 별도 버전 DB는 없고 git 히스토리가 버전 히스토리다. 실행은 그 커밋으로 만든 일회용 worktree에서 일어나고 끝나면 버려지므로 원본 레포는 오염되지 않는다. 실행 요청은 즉시 반환되고 백그라운드로 도니까 수십 분 걸려도 화면을 막지 않는다. 러너는 로컬 `claude` CLI를 그대로 띄운다 — 별도 키도 과금도 없다.

## 세 화면

**개요** — 언제 얼마나 돌렸는지(활동 잔디), 요즘 자주 쓴 자산, 프로젝트 자산 헬스를 한눈에.

![개요](docs/screenshots/overview.png)

**프로젝트** — 등록한 프로젝트의 자산을 목록과 상태(문제·미사용)로 보고, 각 자산의 git 버전 타임라인을 다룬다. 자산을 새로 쓰고, 버전과 시나리오를 골라 실행하고, 여러 버전을 나란히 비교해 하나를 채택하는 일이 여기서 일어난다.

![프로젝트](docs/screenshots/project.png)

**작업** — 일상의 중심. Cursor나 Claude로 한 작업이 자동 평가돼 쌓인다. 하나를 열면 잘했는지(판정)와 뭘 고칠지(개선안)가 먼저 보이고, 처리 단계·평가·실행 트레이스·검토·변경 diff는 필요할 때 펼쳐 본다. 원래 결정(피드백)과 증거(트레이스)로 화면이 갈라져 있던 걸 한 흐름으로 합친 것이다.

![작업 상세](docs/screenshots/work-detail.png)

## 평가

정답이 있는 작업은 시나리오 성공조건으로 통과/실패를 자동 채점한다. 정답이 없는 작업은 머신 스코어러(성공조건을 인식하는 judge)와 LLM 비평으로 기준 기반 채점하고, 사람이 점수와 회고 메모를 남길 수도 있다. 숫자만으로 부족한 "왜"가 메모로 쌓인다.

여기에 같은 버전·시나리오를 여러 번 돌려 일관성(통과율·편차)을 보는 벤치마크, 버전을 나란히 두는 A·B 비교, 단계별 트레이스와 흐름 그래프, worktree에서 실제 바뀐 파일의 diff가 더해진다.

## 온보딩 투어

처음 쓰는 사람은 헤더의 나침반 버튼을 켜면 된다. 프로젝트 선택부터 개선안 결정까지 핵심 경로 여섯 단계를 스포트라이트로 짚어준다. 단계에 맞춰 화면이 알아서 넘어간다.

![온보딩 투어](docs/screenshots/tour.png)

## 일상 루프

Cursor나 Claude로 한 작업을 그대로 평가 대상으로 삼는다 — 일을 두 번 하지 않는다.

작업을 커밋하면 ingest되고(수동 또는 자동), work-evaluator가 평가하고 proposal-reviewer가 검토해 개선안을 만든다. 개선안은 사람이 승인하거나 거절하고, 승인한 것만 자산에 반영된다. 반영된 `.claude`가 다음 세션의 기준이 된다.

내 프로젝트에 공통 하네스를 입히는 방법(agent-crew 연동, 등록 두 모드, MCP 툴)은 [온보딩 가이드](docs/consumer-onboarding.md)에 정리해뒀다.

## 스택

pnpm 모노레포다. `apps/web`은 Vite·React·TypeScript(TanStack Query, shadcn/ui, React Flow), `apps/server`는 Fastify·TypeScript·better-sqlite3, `packages/*`는 공유 설정과 Zod 스키마. Node 20 이상, `corepack pnpm`을 쓴다.

코드 규칙은 [CONVENTIONS.md](./CONVENTIONS.md), 데이터 모델은 [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)에 있다.

## 시작하기

```bash
./scripts/bootstrap.sh
```

전제조건을 점검하고 의존성 설치·DB 마이그레이션·서버(:3001)·프론트(:5173)를 멱등하게 띄운다. 브라우저로 `http://localhost:5173`을 연 뒤 헤더의 나침반(투어)을 켜고 따라가면 된다.

손으로 띄우려면:

```bash
corepack pnpm install
cd apps/server && corepack pnpm db:migrate && corepack pnpm dev   # :3001
cd apps/web && corepack pnpm dev                                  # :5173
```

Claude Code 세션에서 OpsPilot 툴을 쓰려면 MCP를 등록한다. 툴 목록과 소비 프로젝트 적용은 [온보딩 가이드](docs/consumer-onboarding.md) 참고.

```bash
claude mcp add --transport http opspilot http://localhost:3001/mcp
```

## 아직 안 된 것

- 검증한 버전을 *다른 프로젝트*로 옮기는 이식. 지금 채택은 같은 자산 안에서의 "앞으로 감기"까지다.
- 사람 점수·회고를 더 나은 프롬프트 추천으로 되먹이는 고리. 지금은 모으는 단계까지(그게 되먹임의 연료다).
- 클린 머신에서 npm 한 줄 설치. 지금은 레포를 클론해 직접 띄운다.
- 로컬 Claude Code 환경이 대상이다. Agent SDK·클라우드 실행은 나중 일이다.
