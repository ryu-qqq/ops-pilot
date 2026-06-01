#!/usr/bin/env bash
# OpsPilot 부트스트랩 — 제3자가 명령 하나로 dev 환경을 세팅한다.
#
#   ./scripts/bootstrap.sh [옵션]
#
# 하는 일 (순서·멱등):
#   1. 전제조건 점검  — Node ≥ 20 · corepack · 로컬 claude CLI
#   2. corepack pnpm install
#   3. apps/server db:migrate  (영속 DB면 먼저 백업)
#   4. (옵션) agent-crew 공통 자산(agents/skills/references) 가져오기
#   5. 데몬(:3001) + 프론트(:5173) 기동  (이미 떠있으면 건너뜀)
#   6. claude mcp add  (이미 등록돼 있으면 건너뜀)
#
# 옵션:
#   --with-agent-crew[=PATH]  공통 자산을 가져온다.
#                               값 없으면 agent-crew repo 존재만 보장(없으면 clone).
#                               =PATH 면 그 프로젝트 .claude/ 로 sync 까지 한다.
#   --no-serve                데몬·프론트 기동을 건너뛴다 (셋업만).
#   --isolated                임시 OPS_DB_PATH 로 데몬을 띄운다 (실데이터 격리).
#   -h, --help                도움말.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREW_REPO="${OPS_AGENT_CREW_PATH:-$HOME/Documents/ryu-qqq/agent-crew}"
CREW_GIT="git@github.com:ryu-qqq/agent-crew.git"
PROJECTS_DIR="${OPS_PROJECTS_DIR:-$HOME/Documents/ryu-qqq}"
LOG_DIR="$ROOT/.bootstrap-logs"

WITH_CREW=0          # 0=안함 1=존재보장 2=특정경로 sync
CREW_TARGET=""
SERVE=1
ISOLATED=0

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --with-agent-crew)    WITH_CREW=1 ;;
    --with-agent-crew=*)  WITH_CREW=2; CREW_TARGET="${arg#*=}" ;;
    --no-serve)           SERVE=0 ;;
    --isolated)           ISOLATED=1 ;;
    -h|--help)
      awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"
      exit 0 ;;
    *) die "알 수 없는 옵션: $arg  (--help 참고)" ;;
  esac
done

# ── 1. 전제조건 ──────────────────────────────────────────────
say "전제조건 점검"
command -v node >/dev/null || die "Node 가 없다. Node ≥ 20 설치 필요."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node $(node -v) — 20 이상 필요."
ok "Node $(node -v)"
command -v corepack >/dev/null || die "corepack 이 없다. (Node 20+ 에 포함)"
ok "corepack $(corepack --version)"
if command -v claude >/dev/null; then
  ok "claude CLI $(claude --version 2>/dev/null | head -1)"
else
  warn "로컬 claude CLI 없음 — 러너(local-claude)·MCP 등록·초안 자동생성이 동작 안 함."
fi

# ── 2. 의존성 ────────────────────────────────────────────────
say "의존성 설치 (corepack pnpm install)"
( cd "$ROOT" && corepack pnpm install )
ok "install 완료"

# ── 3. DB 마이그레이션 ───────────────────────────────────────
say "DB 마이그레이션"
if [[ "$ISOLATED" -eq 1 ]]; then
  export OPS_DB_PATH="${OPS_DB_PATH:-/tmp/opspilot-bootstrap.sqlite}"
  warn "격리 모드 — OPS_DB_PATH=$OPS_DB_PATH"
else
  DB="$ROOT/apps/server/opspilot.sqlite"
  if [[ -f "$DB" ]]; then
    BAK="$DB.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$DB" "$BAK"
    ok "기존 DB 백업: $(basename "$BAK")"
  fi
fi
( cd "$ROOT/apps/server" && corepack pnpm db:migrate >/dev/null )
ok "마이그레이션 완료 (멱등)"

# ── 4. agent-crew 공통 자산 ──────────────────────────────────
if [[ "$WITH_CREW" -ge 1 ]]; then
  say "agent-crew 공통 자산"
  if [[ ! -d "$CREW_REPO/.git" ]]; then
    warn "agent-crew repo 없음 — clone: $CREW_GIT → $CREW_REPO"
    git clone "$CREW_GIT" "$CREW_REPO" || die "agent-crew clone 실패 (SSH 권한 확인)"
  fi
  ok "agent-crew repo: $CREW_REPO ($(git -C "$CREW_REPO" describe --tags --abbrev=0 2>/dev/null || echo '태그 없음'))"
  if [[ "$WITH_CREW" -eq 2 ]]; then
    [[ -d "$CREW_TARGET" ]] || die "sync 대상 경로 없음: $CREW_TARGET"
    say "공통 자산 sync → $CREW_TARGET"
    ( cd "$ROOT/apps/server" && OPS_AGENT_CREW_PATH="$CREW_REPO" corepack pnpm sync:agent-crew "$CREW_TARGET" )
    ok "sync 완료 (agents·skills·references + must-reference)"
  else
    warn "공통 자산을 특정 프로젝트로 가져오려면: --with-agent-crew=/내/프로젝트/경로"
  fi
fi

# ── 5. 데몬 + 프론트 ─────────────────────────────────────────
port_up() { lsof -ti:"$1" >/dev/null 2>&1; }
wait_up() { for _ in $(seq 1 30); do curl -s -m 2 "$1" >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }

if [[ "$SERVE" -eq 1 ]]; then
  mkdir -p "$LOG_DIR"
  say "데몬 + 프론트 기동"
  if port_up 3001; then
    warn ":3001 이미 떠있음 — 데몬 기동 건너뜀"
  else
    ( cd "$ROOT/apps/server" && \
      OPS_PROJECTS_DIR="$PROJECTS_DIR" \
      GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
      OPS_TERM_LOG=off \
      ${OPS_DB_PATH:+OPS_DB_PATH="$OPS_DB_PATH"} \
      nohup corepack pnpm dev >"$LOG_DIR/server.log" 2>&1 & )
    wait_up "http://localhost:3001/api/projects" && ok "데몬 :3001 (log: .bootstrap-logs/server.log)" \
      || warn "데몬이 30초 내 안 떴다 — .bootstrap-logs/server.log 확인"
  fi
  if port_up 5173; then
    warn ":5173 이미 떠있음 — 프론트 기동 건너뜀"
  else
    ( cd "$ROOT/apps/web" && nohup corepack pnpm dev >"$LOG_DIR/web.log" 2>&1 & )
    wait_up "http://localhost:5173" && ok "프론트 :5173 (log: .bootstrap-logs/web.log)" \
      || warn "프론트가 30초 내 안 떴다 — .bootstrap-logs/web.log 확인"
  fi
else
  warn "--no-serve — 데몬·프론트 기동 생략"
fi

# ── 6. MCP 등록 ──────────────────────────────────────────────
if command -v claude >/dev/null; then
  say "Claude Code MCP 등록"
  if claude mcp list 2>/dev/null | grep -q "opspilot"; then
    ok "opspilot MCP 이미 등록됨"
  else
    claude mcp add --transport http opspilot http://localhost:3001/mcp >/dev/null 2>&1 \
      && ok "opspilot MCP 등록" || warn "MCP 등록 실패 (데몬 미기동?)"
  fi
fi

echo
ok "부트스트랩 완료."
echo "  대시보드 : http://localhost:5173"
echo "  데몬 API : http://localhost:3001/api/projects"
[[ "$SERVE" -eq 1 ]] && echo "  중지     : lsof -ti:3001,5173 | xargs kill"
echo "  내 프로젝트에 하네스 입히기 → README '소비자 온보딩' 참고"
