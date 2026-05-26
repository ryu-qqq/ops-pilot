# OpsPilot sync cursor harness

`.claude/` SSOT → `.cursor/` derived mirror (skills · commands · `opspilot-agent-*` rules).

## 로컬 설정

- **projectId:** `REPLACE_WITH_OPSPILOT_PROJECT_UUID`
- **opsPilotApi:** `http://localhost:3001`

## 사전조건

- `/opspilot-preflight` 통과
- `.claude/` 존재 (agent-crew sync 또는 apply 완료)
- **linked** 권장 — apply 후 자동 sync도 동일 경로

## 워크플로

1. dry-run:
   ```bash
   curl -s -X POST "$opsPilotApi/api/projects/<projectId>/sync-cursor-harness" \
     -H 'Content-Type: application/json' \
     -d '{"dryRun":true}'
   ```
2. 적용 + 커밋:
   ```bash
   curl -s -X POST "$opsPilotApi/api/projects/<projectId>/sync-cursor-harness" \
     -H 'Content-Type: application/json' \
     -d '{"dryRun":false,"commit":true}'
   ```
3. Cursor에서 `.cursor/skills/`, `.cursor/rules/opspilot-agent-*` 확인

## MCP

`sync_cursor_harness` — `{ projectId, dryRun?, commit? }`

## 제외

eval-only agents (`work-evaluator`, `proposal-reviewer`, `proposal-applier`)는 mirror 안 함.

hand-authored `.cursor/rules/*.mdc` (예: `pr-scope-cohesion.mdc`)는 덮어쓰지 않음.
