# ops-pilot 로컬 Docker Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ops-pilot(서버 :3001 + web :5173)을 로컬 Docker Compose로 상시 가동(재부팅 생존)하고, fresh DB + connectly 단일 마운트로 review→자산개선 풀 루프(apply→git 포함)가 컨테이너 안에서 완결되게 한다.

**Architecture:** 멀티스테이지 Dockerfile 하나(pnpm 모노레포 빌드 + better-sqlite3 linux 컴파일)로 단일 이미지를 만들고, compose에서 server·web 2서비스로 띄운다. DB는 named volume, connectly 레포는 컨테이너 경로 `/srv/connectly`로 rw 바인드마운트. apply→git은 commit-only라 git 자격증명 불필요(`safe.directory '*'` + 호스트 UID).

**Tech Stack:** Docker Compose, node:24, pnpm@9.15.0(corepack), Fastify, Vite, better-sqlite3.

## Global Constraints

- 설계 정본: `docs/superpowers/specs/2026-06-28-ops-pilot-local-docker-design.md`. 충돌 시 spec 우선.
- **DB**: fresh, named volume `opspilot-data` → `/data`, `OPS_DB_PATH=/data/opspilot.sqlite`. 기존 opspilot.sqlite 마운트 안 함.
- **마운트**: connectly만 — 호스트 `${CONNECTLY_PATH}` → `/srv/connectly`(rw). agent-crew `${AGENT_CREW_PATH}` → `/srv/agent-crew`(ro).
- **apply→git**: commit-only + 인라인 author → gitconfig/SSH 마운트 금지. 대신 `git config --global --add safe.directory '*'` + 호스트 UID 실행.
- **서버**: `0.0.0.0:${PORT}`(PORT=3001). 엔트리포인트는 `db:migrate`(멱등) 후 `node apps/server/dist/server.js`.
- **web**: 빌드된 dist를 `vite preview`로 서빙, `OPS_API_TARGET=http://server:3001`로 `/api` 프록시.
- **상시성**: 두 서비스 `restart: unless-stopped`.
- 패키지명: `@opspilot/server`·`@opspilot/web`·`@opspilot/shared-types`. 루트 빌드 `corepack pnpm -r build`.
- 기동 전 수동 ops-pilot(:3001/:5173) 종료(포트 충돌).
- 작업 브랜치: `feat/local-docker-compose`(spec 커밋 `dcde8d3` 존재). 선재 변경 `apps/server/src/domains/agent-crew/sync.ts`는 건드리지 않음.

## File Structure

- `apps/web/vite.config.ts` (수정) — `preview.proxy` 추가(컨테이너 web→server 프록시).
- `Dockerfile` (생성) — 멀티스테이지 빌드.
- `docker/entrypoint.sh` (생성) — server 기동 스크립트.
- `.dockerignore` (생성).
- `docker-compose.yml` (생성).
- `.env.example` (생성) — 호스트 경로·UID 변수 예시.

---

## Setup

```bash
cd <ops-pilot 레포 루트>
git branch --show-current   # feat/local-docker-compose 확인
docker --version            # Docker Desktop 동작 확인
```

---

## Task 1: vite preview 프록시 (web 컨테이너용)

**Files:**
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Produces: `vite preview`가 `/api`를 `OPS_API_TARGET`(컨테이너에선 `http://server:3001`)으로 프록시. Task 4에서 web 컨테이너가 server와 통신할 수 있게 됨.

- [ ] **Step 1: 현재 config 확인**

Run: `cat apps/web/vite.config.ts`
Expected: `const apiTarget = process.env.OPS_API_TARGET ?? "http://localhost:3001";` 와 `server: { proxy: { "/api": apiTarget } }` 존재 확인.

- [ ] **Step 2: preview 블록 추가**

`apps/web/vite.config.ts`의 `defineConfig({...})` 안에 `server` 블록과 같은 레벨로 `preview` 블록을 추가한다(기존 `apiTarget` 재사용):
```ts
  preview: {
    host: true,        // 컨테이너에서 0.0.0.0 바인드
    port: 5173,
    proxy: { "/api": apiTarget },
  },
```
(`server.proxy`는 그대로 둔다 — 로컬 dev용. `preview`는 컨테이너용.)

- [ ] **Step 3: 빌드·preview 기동 검증**

Run: `corepack pnpm --filter @opspilot/web build && corepack pnpm --filter @opspilot/web preview --port 5174 &`
그다음: `sleep 3 && curl -sI http://localhost:5173 2>/dev/null | head -1; curl -sI http://localhost:5174 2>/dev/null | head -1`
Expected: preview 서버가 떠서 200/HTML 응답(포트는 위 명령 기준). 확인 후 `kill %1`로 종료.
(주의: `--port 5174`로 기존 dev :5173와 충돌 회피. config의 `port:5173`은 기본값일 뿐 CLI override 가능.)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/vite.config.ts
git commit -m "feat(web): vite preview 프록시 추가 — 컨테이너 web→server /api 프록시"
```

---

## Task 2: Dockerfile + 엔트리포인트 + .dockerignore (단일 이미지)

**Files:**
- Create: `Dockerfile`
- Create: `docker/entrypoint.sh`
- Create: `.dockerignore`

**Interfaces:**
- Produces: 이미지 1개 — server/web/shared-types 빌드 산출물 + 컴파일된 better-sqlite3 + git 포함. server는 `/entrypoint.sh`로 기동(`db:migrate`→start). web은 compose에서 `vite preview` command로 같은 이미지 재사용.

- [ ] **Step 1: .dockerignore 작성**

`.dockerignore`:
```
node_modules
**/node_modules
**/dist
*.sqlite
*.sqlite-*
*.sqlite.bak*
.git
.playwright-mcp
.superpowers
.bootstrap-logs
docs
```

- [ ] **Step 2: 엔트리포인트 작성**

`docker/entrypoint.sh`:
```sh
#!/usr/bin/env sh
set -e
# 마운트된 호스트 레포에 호스트 UID로 커밋 시 dubious-ownership 회피
git config --global --add safe.directory '*'
# PR #8 ingest_trigger=pr_review 포함, 멱등. OPS_DB_PATH(=/data/opspilot.sqlite) 대상.
corepack pnpm --filter @opspilot/server db:migrate
exec node apps/server/dist/server.js
```

- [ ] **Step 3: Dockerfile 작성**

`Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-bookworm AS builder
RUN corepack enable
WORKDIR /app
# 의존성 레이어 캐시 — 매니페스트 먼저
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN corepack pnpm install --frozen-lockfile
# 소스 복사 후 전체 빌드(better-sqlite3 는 install 시 네이티브 컴파일됨)
COPY . .
RUN corepack pnpm -r build

FROM node:24-bookworm-slim AS runtime
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app /app
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3001 5173
ENTRYPOINT ["/entrypoint.sh"]
```
주의: builder/runtime 모두 node 24 메이저 → better-sqlite3 `.node` ABI 일치. runtime에 `git` 설치(apply→git 커밋용). `tsx`·`vite`는 node_modules(devDep)에 이미 있어 db:migrate·preview 동작.

- [ ] **Step 4: 이미지 빌드 검증**

Run: `docker build -t opspilot-local .`
Expected: 빌드 성공(better-sqlite3 컴파일 포함, 에러 없음). 실패 시 로그의 실패 스테이지 확인(흔한 원인: lockfile 불일치 → `--frozen-lockfile` 제거 후 재시도, 또는 네이티브 빌드툴 — node:24-bookworm은 빌드툴 포함).

- [ ] **Step 5: 이미지 단독 기동 스모크(서버만, 임시 DB)**

Run:
```bash
docker run --rm -e OPS_DB_PATH=/tmp/t.sqlite -p 3001:3001 --name ops-smoke opspilot-local &
sleep 8 && curl -sI http://localhost:3001/ 2>/dev/null | head -1
docker stop ops-smoke 2>/dev/null
```
Expected: 서버가 기동(db:migrate 통과 후 listen). `/`는 404여도 서버가 응답하면 OK(목표는 listen 확인). MCP/seam 검증은 Task 4.

- [ ] **Step 6: 커밋**

```bash
git add Dockerfile docker/entrypoint.sh .dockerignore
git commit -m "feat(docker): 멀티스테이지 Dockerfile + 엔트리포인트(migrate→start) + dockerignore"
```

---

## Task 3: docker-compose.yml + .env.example

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: Task 2 이미지(`opspilot-local`), Task 1 preview 프록시.
- Produces: `docker compose up -d`로 server(:3001)+web(:5173) 상시 기동. connectly rw 마운트, DB named volume.

- [ ] **Step 1: .env.example 작성**

`.env.example`:
```
# 호스트 절대경로 (각자 환경에 맞게)
CONNECTLY_PATH=/Users/ryu-qqq/Documents/ryu-qqq/connectly-services
AGENT_CREW_PATH=/Users/ryu-qqq/Documents/ryu-qqq/agent-crew
# 호스트 UID/GID (mac 기본 501:20) — 마운트 레포 커밋 권한 정합
HOST_UID=501
HOST_GID=20
```

- [ ] **Step 2: docker-compose.yml 작성**

`docker-compose.yml`:
```yaml
services:
  server:
    build: .
    image: opspilot-local
    user: "${HOST_UID:-501}:${HOST_GID:-20}"
    ports:
      - "3001:3001"
    environment:
      PORT: "3001"
      OPS_DB_PATH: /data/opspilot.sqlite
      OPS_AGENT_CREW_PATH: /srv/agent-crew
    volumes:
      - opspilot-data:/data
      - ${CONNECTLY_PATH}:/srv/connectly
      - ${AGENT_CREW_PATH}:/srv/agent-crew:ro
    restart: unless-stopped

  web:
    image: opspilot-local
    command: ["corepack","pnpm","--filter","@opspilot/web","preview","--host","0.0.0.0","--port","5173"]
    user: "${HOST_UID:-501}:${HOST_GID:-20}"
    ports:
      - "5173:5173"
    environment:
      OPS_API_TARGET: http://server:3001
    depends_on:
      - server
    restart: unless-stopped

volumes:
  opspilot-data:
```
주의: server가 `build`+`image: opspilot-local`로 이미지를 만들고, web은 같은 `image`를 재사용(별도 빌드 없음). `depends_on`은 기동 순서만 보장(헬스 아님). web의 `OPS_API_TARGET`이 compose 네트워크의 `server` 서비스를 가리킴.

- [ ] **Step 3: 기동 검증**

```bash
cp .env.example .env   # 경로/ UID 자기 환경 맞게 수정
# 기존 수동 ops-pilot 종료 (포트 충돌 방지)
lsof -ti:3001 -ti:5173 | xargs kill 2>/dev/null || true
docker compose up -d --build
sleep 10
docker compose ps                       # server·web 둘 다 Up
curl -sI http://localhost:3001/ | head -1   # 서버 응답(404 OK)
curl -sI http://localhost:5173/ | head -1   # web 200/HTML
```
Expected: 두 서비스 Up, 서버·web 응답.

- [ ] **Step 4: 커밋**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(docker): docker-compose(server+web) + .env.example — 상시 가동·connectly 마운트"
```

---

## Task 4: 풀 루프 e2e 검증 + 운영 문서

**Files:**
- Modify: `README.md`(또는 `docs/`) — Docker 기동 절차 추가(짧게).

**Interfaces:**
- Consumes: Task 3 compose 스택.
- Produces: 성공 기준 1~4 충족 증거 + 기동 문서.

- [ ] **Step 1: MCP·대시보드 검증 (성공기준 2)**

```bash
claude mcp list | grep opspilot     # http://localhost:3001/mcp 연결 확인
```
브라우저로 `http://localhost:5173` 열어 대시보드 로드 확인.
Expected: opspilot MCP Connected, 대시보드 정상.

- [ ] **Step 2: connectly 등록 + apply→git (성공기준 3)**

웹 UI(또는 등록 API)로 connectly를 **컨테이너 경로 `/srv/connectly`**, workspace_mode `linked`로 등록.
그다음 더미 review-proposal을 POST(Task: 직전 머지된 seam 엔드포인트):
```bash
curl -s -X POST http://localhost:3001/api/feedback/review-proposal \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<등록된 connectly id>","targetKind":"skill","targetPath":".claude/skills/connectly-archrules-fix/SKILL.md","rationale":"docker e2e","content":"<수정 초안>","review":{"prNumber":1,"repo":"o/r","commentUrl":"","reviewer":"e2e","mistakeType":"docker-test"}}'
```
대시보드 작업 인박스에 draft proposal 표시 → 수동 review → approve → apply.
Expected: `/srv/connectly`(=호스트 connectly 레포)에 `ops(feedback/...)` 커밋 생성. 호스트에서 `git -C ${CONNECTLY_PATH} log --oneline -1`로 확인.
(주의: connectly가 공유 워킹트리면 현재 체크아웃 브랜치에 커밋 떨어짐 — e2e 후 되돌리거나 격리 브랜치에서.)

- [ ] **Step 3: 상시성 검증 (성공기준 1·4)**

```bash
docker compose restart && sleep 8 && docker compose ps   # 재시작 후 Up, 데이터 유지
docker compose down && docker compose up -d && sleep 8    # 볼륨 유지 → 등록 데이터 유지
docker compose down -v && docker compose up -d && sleep 8  # 볼륨 삭제 → fresh 스키마로 기동(재등록 필요)
```
Expected: restart·down/up 후 데이터 유지, `down -v` 후 깨끗한 스키마로 정상 기동.

- [ ] **Step 4: 기동 문서 추가**

`README.md`에 짧은 "Docker로 띄우기" 섹션:
```md
## Docker 로 띄우기 (로컬 상시)
1. `cp .env.example .env` 후 경로·UID 수정
2. `docker compose up -d --build`
3. 서버 :3001 (MCP `http://localhost:3001/mcp`), 대시보드 :5173
4. 첫 기동 후 connectly 를 `/srv/connectly` (linked) 로 등록
재부팅 후에도 `restart: unless-stopped` 로 자동 가동. DB 초기화: `docker compose down -v`.
```

- [ ] **Step 5: 커밋**

```bash
git add README.md
git commit -m "docs: ops-pilot Docker 로컬 기동 절차"
```

---

## 최종 통합 검증
- [ ] `docker build -t opspilot-local .` 성공.
- [ ] `docker compose up -d` → server·web Up, :3001 MCP + :5173 대시보드.
- [ ] connectly `/srv/connectly` 등록 → review-proposal→approve→apply→git 커밋이 호스트 connectly 레포에 생성.
- [ ] `restart`·`down/up` 데이터 유지, `down -v` 후 fresh.

## Handoff
브랜치 `feat/local-docker-compose`. 루프 닫히면 push + PR. 선재 `sync.ts` 변경은 미포함. 후속(YAGNI): 단일이미지 정적서빙(@fastify/static), 다중 프로젝트 마운트, 실제 EC2 배포, MySQL 이행.
