# OpsPilot fixture ingest (smoke)

Claude 없이 **~5초** fixture eval로 ingest → proposal 파이프라인·UI HITL 흐름만 확인한다.

## 이 레포 설정 (한 번만 수정)

- **projectId:** `REPLACE_WITH_OPSPILOT_PROJECT_UUID`
- **workspaceMode:** `linked` | `managed`
- **workPath:** `REPLACE_WITH_GIT_REPO_PATH` (`linked` → devPath, `managed` → clonePath)
- **opsPilotApi:** `http://localhost:3001`
- **retro (기본):** `fixture smoke — UI HITL 확인`

## 사전조건

- `/opspilot-preflight` 통과 권장
- `workPath`에서 **커밋 1개 이상** (HEAD SHA 사용)

## 워크플로

1. `workPath`에서:
   ```bash
   git rev-parse HEAD
   git log -1 --oneline
   ```
2. ingest POST:
   ```bash
   curl -s -X POST http://localhost:3001/api/feedback/ingest \
     -H 'Content-Type: application/json' \
     -d '{
       "projectId": "<projectId>",
       "gitRef": "<HEAD_SHA>",
       "evalSource": "fixture",
       "retro": "<retro>"
     }'
   ```
3. 응답 `id`·`status` 기록
4. `status=done`까지 폴링 (필요 시):
   ```bash
   curl -s http://localhost:3001/api/feedback/ingest/<INGEST_ID>
   ```
5. proposals ≥ 1이면 성공 — http://localhost:5173 **피드백** 탭에서 확인 안내

## 출력

- ingest id
- final status
- proposal count·targetKind 목록
- 실패 시 `contextJson.evalError` 전문

## 다음

UI에서 승인·apply 후 → `/opspilot-post-apply`
