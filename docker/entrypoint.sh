#!/usr/bin/env sh
set -e
# 마운트된 호스트 레포(connectly)에 apply→git 커밋 시 dubious-ownership 회피.
# 커밋 대상은 /srv/connectly 뿐이므로 그 경로만 허용(광범위한 '*' 대신).
git config --global --add safe.directory /srv/connectly
cd apps/server
# PR #8 ingest_trigger=pr_review 포함, 멱등. OPS_DB_PATH(=/data/opspilot.sqlite) 대상.
# node --import tsx 로 직접 실행(서버 기동과 일관, pnpm 래퍼 오버헤드 제거).
node --import tsx src/db/migrate.ts
exec node --import tsx src/server.ts
