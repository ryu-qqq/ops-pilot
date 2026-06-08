# OpsPilot

![Node](https://img.shields.io/badge/Node-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)

Cursor·Claude로 만든 규칙·에이전트가 진짜 나아지는지 측정하고, 고칠 거리를 뽑아 다시 반영하는 로컬 컨트롤 플레인입니다.

## ⚡ 한눈에

- **무엇** — `.claude`·`.cursor` 하네스(규칙·에이전트·스킬)가 실제로 사람 손을 덜 타게 만드는지 재고, 개선하는 도구입니다.
- **누구** — Cursor나 Claude Code로 일하면서 자기 하네스를 키우는 사람을 위한 것입니다.
- **어떻게** — 작업 기록에서 정정 왕복을 측정하고, 개선안을 뽑아, 규칙·에이전트에 반영합니다. 쓰는 도구가 Cursor든 Claude든 상관없습니다.

## 🤔 왜 만들었나

하네스를 깔면 생산성은 분명 오릅니다. 그런데 그게 진짜 나아지고 있는지, 아니면 매번 똑같이 손이 가는지는 알 길이 없었습니다. 한 번 시키면 끝나는 일과, 몇 번씩 되돌아와 다시 고쳐줘야 하는 일 — 그 차이를 숫자로 보고 싶었습니다.

재서 고칠 거리를 찾고 규칙·에이전트에 반영하면 다음엔 손이 덜 갑니다. 그 한 바퀴를 도구에 상관없이 돌려보려고 만들었습니다.

![개요 · 프로젝트 · 작업](docs/screenshots/three-tabs.png)

## 📦 무엇을 하나

프로젝트를 등록하면 그 안 `.claude`·`.cursor` 자산이 자동으로 잡힙니다. 그다음 세 가지를 합니다.

- **측정** — Cursor·Claude로 한 작업을 읽어, 사람이 몇 번 고쳐줬는지(정정 왕복)를 잽니다. 자산을 얼마나 쓰는지, 아예 안 쓰는지도 봅니다.
- **개선** — 작업마다 "이 규칙을 이렇게 고치면 손이 덜 가겠다"는 개선안을 뽑습니다.
- **반영** — 승인하면 규칙·에이전트에 도로 반영합니다. 공유 자산(agent-crew)이면 상류에서 고치라고 안내합니다.

화면은 셋입니다.

개요에서는 자산을 최근 7일·30일 동안 얼마나 썼는지, 정정 왕복이 줄고 있는지 추세로 봅니다. 자주 쓰는 자산일수록 다듬어 둘 값어치가 크고, 아예 안 쓰는 자산은 삭제 후보입니다.

![개요 — 자산 사용량과 헬스](docs/screenshots/overview-usage.png)

프로젝트에서는 자산을 목록으로 보고, 하나를 클릭하면 버전 타임라인과 형식·트리거 점검 같은 상세를 봅니다.

![프로젝트 — 자산과 버전 타임라인](docs/screenshots/project.png)

작업에서는 Cursor·Claude로 일하며 "이건 이렇게 해줘" 하고 고쳐 나온 결과를 평가받습니다. 작업을 열면 판정과 개선안이 먼저 보이고, 트레이스·검토·변경 diff는 필요할 때 펼칩니다.

![작업 — 판정과 개선안](docs/screenshots/work-detail.png)

## 🚀 시작하기

```bash
./scripts/bootstrap.sh
```

한 줄이면 아래가 멱등하게(이미 된 건 건너뛰고) 끝납니다.

- 전제조건 점검 — Node 20+, corepack, 로컬 `claude` CLI. CLI가 없으면 러너·MCP·초안 생성이 안 도니 참고하세요.
- 의존성 설치 — `corepack pnpm install`. DB는 `better-sqlite3`, 로컬 SQLite 파일 하나를 씁니다.
- DB 마이그레이션 — 스키마를 잡습니다. 기존 영속 DB가 있으면 먼저 백업합니다.
- 서버(:3001)·웹(:5173) 기동.
- MCP 등록 — `claude mcp add`. 이후 Claude Code 세션에서 OpsPilot 툴을 호출할 수 있습니다.

띄우고 나면 `http://localhost:5173` 을 열고 헤더의 나침반(가이드 투어)을 켜면 됩니다. 프로젝트 등록부터 개선안 결정까지 따라가며 짚어줍니다.

## 🧱 스택

pnpm 모노레포입니다. Node 20 이상, `corepack pnpm` 을 씁니다.

| 워크스페이스 | 기술 |
| --- | --- |
| `apps/web` | Vite · React · TypeScript · TanStack Query · shadcn/ui · Tailwind · React Flow |
| `apps/server` | Fastify · TypeScript · better-sqlite3 |
| `packages/*` | 공유 ESLint/TS 설정 · Zod 스키마 |

코드 규칙은 [CONVENTIONS.md](./CONVENTIONS.md), 데이터 모델은 [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)에 있습니다.

## 🚧 아직 안 되는 것

- [ ] 검증한 버전을 다른 프로젝트로 이식 — 지금은 같은 자산 안에서 버전 올리기까지입니다.
- [ ] npm 한 줄 설치 — 지금은 레포를 클론해서 직접 띄웁니다.
- [ ] Agent SDK·클라우드 실행 — 지금은 로컬 Claude Code 환경만 봅니다.

## 📚 더 자세히

내 프로젝트에 공통 하네스를 입히는 법, 등록 두 모드(로컬 연결·관리 클론), MCP 툴 목록은 [온보딩 가이드](docs/consumer-onboarding.md)에 정리해뒀습니다.
