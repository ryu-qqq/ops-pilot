# ops-pilot 로컬 Docker Compose (풀 데몬, connectly 단일) — 설계

- 날짜: 2026-06-28
- 상태: 설계 확정 (구현 대기)
- 출처: ops-pilot을 `npm run`으로 매번 띄우는 대신, prod처럼 **로컬 Docker로 상시 실행**하고 싶다는 요구. ADR-0012 "포터블 AI 하네스" 내러티브와 정합.

## 배경 — 왜

ops-pilot은 Fastify 서버(:3001, API+MCP+seam) + Vite 프론트(:5173) 웹 앱이다. 지금은 수동(`pnpm dev`)으로 띄운다. 이를 **Docker Compose로 컨테이너화해 상시 가동**(재부팅 생존)한다 — prod-on-EC2 패턴을 로컬에 그대로.

ops-pilot은 호스트 파일시스템에 의존(transcript·프로젝트 클론·git)하지만, **모든 경로가 env 변수로 빠져 있어**(OPS_DB_PATH·OPS_CLAUDE_PROJECTS_DIR·OPS_PROJECTS_DIR·OPS_AGENT_CREW_PATH 등) 컨테이너화에 유리하다. apply→git은 **commit-only + 인라인 author**(`-c user.email=opspilot@local`)라 호스트 gitconfig/SSH도 불필요.

**범위 단순화(사용자 결정):** DB 연속성·다중 프로젝트 불필요. **fresh DB + connectly-services 단일 프로젝트**만 다룬다. 기존 `opspilot.sqlite` 마운트·호스트 경로 미러링 전부 제거.

## 성공 기준

1. `docker compose up -d` 한 번으로 server(:3001) + web(:5173)이 뜨고, **재시작·재부팅 후 살아남는다**(`restart: unless-stopped` + named volume).
2. `http://localhost:3001/mcp`로 Claude Code의 `opspilot` MCP가 연결되고, 웹 대시보드(:5173)가 로드된다.
3. connectly-services를 컨테이너에 등록(linked)한 뒤, review-proposal POST → approve → **apply→git이 마운트된 connectly 레포에 커밋**된다.
4. DB를 날려도(`docker compose down -v`) 재기동 시 깨끗한 스키마로 다시 뜬다(connectly 재등록만 필요).

## 아키텍처

- **Dockerfile (멀티스테이지)**:
  - builder: `node:24`(또는 `node:22`) 풀 이미지 — pnpm@9.15.0 활성화, `pnpm install`, 서버 `build`(tsc + harness hooks .mjs 복사) + web `build`(vite build), `better-sqlite3` linux 네이티브 컴파일(빌드툴 포함).
  - runtime: `node:24-slim` — dist + 필요한 node_modules(컴파일된 better-sqlite3 포함) 복사. **호스트 UID로 실행**.
- **docker-compose.yml** — 2 서비스:
  - `server`: 서버 이미지, `:3001` 노출, 엔트리포인트 `db:migrate → node dist/server.js`, named volume(DB), connectly rw 마운트, env 주입, `restart: unless-stopped`, `user: "${UID}:${GID}"`.
  - `web`: 같은 이미지(또는 web 전용), `vite preview`로 빌드된 dist 서빙, `:5173` 노출, `OPS_API_TARGET=http://server:3001`, `restart: unless-stopped`.
- **named volume** `opspilot-data` → `/data`(DB). **bind mount** connectly 레포 → `/srv/connectly`(rw).

## 마운트·env (단순화)

| 호스트 | 컨테이너 | env | 모드 | 비고 |
|---|---|---|---|---|
| named volume `opspilot-data` | `/data` | `OPS_DB_PATH=/data/opspilot.sqlite` | rw | fresh DB, 날려도 됨 |
| `/Users/ryu-qqq/Documents/ryu-qqq/connectly-services` | `/srv/connectly` | (등록 시 clone_path) | **rw** | apply→git 대상. 단일 프로젝트 |
| `/Users/ryu-qqq/Documents/ryu-qqq/agent-crew` | `/srv/agent-crew` | `OPS_AGENT_CREW_PATH=/srv/agent-crew` | ro | sync 비교용(필요 시) |
| `~/.claude/projects` | `/host/claude-projects` | `OPS_CLAUDE_PROJECTS_DIR` | ro | **선택** — usage 측정 쓸 때만. 기본 생략 |

호스트 절대경로는 compose의 `.env`(또는 변수)로 빼 이식성 확보(`CONNECTLY_PATH`·`AGENT_CREW_PATH`·`UID`·`GID`).

## 컴포넌트 상세

### 1. Dockerfile
멀티스테이지. builder에서 모노레포 전체 빌드(pnpm workspace), runtime은 slim + 컴파일된 산출물. `corepack enable` + `pnpm@9.15.0`. better-sqlite3는 builder에서 컴파일돼 runtime으로 복사(runtime에 빌드툴 불필요).

### 2. docker-compose.yml
server·web 2서비스. server `depends_on` 없음(web이 런타임에 server로 프록시). 볼륨·마운트·env·`restart`·`user`. 호스트 경로는 `.env` 참조.

### 3. 엔트리포인트 스크립트 (server)
```
git config --global --add safe.directory '*'   # 마운트된 호스트 레포 dubious-ownership 회피
corepack pnpm --filter @opspilot/server db:migrate   # PR #8 pr_review 컬럼 포함, 멱등
exec node apps/server/dist/server.js
```

### 4. vite preview 프록시 보강 (작은 코드 변경)
`apps/web/vite.config.ts`에 현재 `server.proxy`만 있다. `vite preview`는 이를 안 쓰므로 **`preview: { proxy: { "/api": apiTarget } }` 추가**(기존 `apiTarget` 재사용). 이래야 web 컨테이너가 `/api`를 `server` 서비스로 프록시한다.

### 5. .dockerignore
node_modules·dist·*.sqlite·.git·.playwright-mcp 등 제외(이미지 슬림·빌드 캐시).

## 등록 절차 (fresh DB라 1회)
첫 `up` 후 connectly를 **컨테이너가 보는 경로 `/srv/connectly`**로 등록(linked). 웹 UI의 프로젝트 등록 또는 등록 API/`scan_project`. clone_path가 `/srv/connectly`면 apply→git이 그 마운트(=호스트 connectly)에 커밋한다. (호스트 경로 미러링 불필요 — 등록을 컨테이너 경로로 하므로.)

## 운영 주의
- 기동 전 **수동 실행 중인 ops-pilot(:3001/:5173) 종료** — 포트 충돌.
- `user: "${UID}:${GID}"`로 호스트 UID 실행 → 마운트된 connectly 레포에 호스트 소유로 커밋(권한 충돌 회피).
- connectly가 **공유 워킹트리**(멀티세션)인 경우 apply→git 커밋이 그 브랜치에 떨어짐 — Docker와 무관한 워크스페이스 위생 이슈(인지만).

## 범위 밖 (YAGNI)
- MySQL 이행(better-sqlite3 동기 API 전면 async 리라이트 — 큰 비용, 불필요)
- 단일 이미지 정적 서빙(`@fastify/static`) — vite preview 2서비스로 충분, 후속 가능
- 실제 EC2/원격 배포·이미지 레지스트리 푸시
- 다중 프로젝트 마운트(connectly 하나만)
- transcript 기반 usage 측정(기본 생략, env로 켤 수 있음)
- prebuilt better-sqlite3 npm 배포(OPSP 별도 백로그)

## 테스트·검증
- `docker compose up -d --build` → `docker compose ps` 두 서비스 healthy.
- `curl localhost:3001/<health 또는 /api/...>` 200, `claude mcp list`에 opspilot 연결, 브라우저 :5173 대시보드 로드.
- connectly 등록 → 더미 review-proposal POST → 작업 인박스 표시 → approve → `/srv/connectly`(=호스트 레포)에 커밋 생성 확인.
- `docker compose restart` 후 데이터 유지, `down -v` 후 재기동 시 깨끗한 스키마.

## 위치
산출물: ops-pilot 레포 `Dockerfile`·`docker-compose.yml`·`.dockerignore`·`docker/entrypoint.sh`·`apps/web/vite.config.ts`(preview proxy). spec/plan은 `docs/superpowers/`.

## 미해결 리스크
- runtime 이미지에 better-sqlite3 .node ABI가 node 버전과 일치해야 함(builder/runtime 동일 node 메이저 사용으로 회피).
- pnpm workspace를 컨테이너에서 빌드 시 모노레포 전체 install 비용(빌드 캐시 레이어로 완화).
- 헬스체크 엔드포인트 유무 확인(없으면 compose healthcheck는 포트 오픈으로 갈음).
