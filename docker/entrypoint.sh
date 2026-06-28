#!/usr/bin/env sh
set -e
# 마운트된 호스트 레포에 호스트 UID로 커밋 시 dubious-ownership 회피
git config --global --add safe.directory '*'
# PR #8 ingest_trigger=pr_review 포함, 멱등. OPS_DB_PATH(=/data/opspilot.sqlite) 대상.
corepack pnpm --filter @opspilot/server db:migrate
exec corepack pnpm --filter @opspilot/server exec tsx src/server.ts
