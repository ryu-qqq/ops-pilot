#!/usr/bin/env bash
# REG-06: 기존 opspilot.sqlite 프로젝트를 linked 경로로 맞춤 (로컬 전용).
# 사용 전 opspilot.sqlite 백업 권장.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${OPS_DB_PATH:-$ROOT/apps/server/opspilot.sqlite}"

if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB" >&2
  exit 1
fi

sqlite3 "$DB" <<'SQL'
UPDATE project SET workspace_mode = 'linked', remote_verified = 1
WHERE id = '9f83dd39-85e2-4fb2-807c-b565c27d82b3';

UPDATE project
SET clone_path = '/Users/ryu-qqq/Documents/ryu-qqq/Infrastructure',
    workspace_mode = 'linked',
    remote_verified = 1
WHERE id = 'd7ee3efd-67da-44d3-bd8c-0cdea1f42baf';
SQL

echo "Migration applied. Current projects:"
sqlite3 "$DB" "SELECT name, workspace_mode, clone_path FROM project;"
