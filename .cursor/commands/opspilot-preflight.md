# OpsPilot 사전조건 점검

OpsPilot 피드백 루프를 돌리기 **전**에 환경·자산·프로젝트 등록 상태를 확인하고, 문제가 있으면 고친 뒤 짧게 보고한다.

## 이 레포 설정 (한 번만 수정)

- **projectId:** `REPLACE_WITH_OPSPILOT_PROJECT_UUID`
- **projectName:** `REPLACE_WITH_PROJECT_NAME`
- **workspaceMode:** `linked` | `managed`
- **devPath:** `REPLACE_WITH_DEV_REPO_PATH`
- **clonePath:** `REPLACE_WITH_OPSPILOT_CLONE_PATH`
- **opsPilotApi:** `http://localhost:3001`
- **runbook:** `@docs/opspilot-feedback-loop.md` (있으면 Read)

## 워크플로

1. **OpsPilot 서버**
   - `curl -s http://localhost:3001/api/runs` → JSON 200 확인
   - 실패 시: `lsof -ti:3001` 스테일 프로세스 확인, server는 `cd apps/server && OPS_DB_PATH=... OPS_PROJECTS_DIR=... pnpm dev` (루트 `pnpm dev` 금지)

2. **작업 경로**
   - `workspaceMode=linked` → `devPath`가 git repo인지, `git status` 요약
   - `workspaceMode=managed` → `clonePath` 존재·`git fetch` 가능 여부
   - dev와 clone이 다르면 **managed**임을 명시하고 sync 커맨드 안내

3. **Harness 자산**
   - `.claude/agents/work-evaluator.md` 존재
   - `.claude/`가 **committed**인지 (untracked면 eval run 실패 가능)
   - `work-evaluator`·`proposal-reviewer` agent 파일 존재

4. **OpsPilot 레지스트리**
   - `GET /api/projects`에서 projectId 확인
   - `POST /api/projects/{id}/scan` 필요 시 제안 (pull + .claude 적재)

5. **agent-crew drift** (선택)
   - UI 또는 API로 agent-crew sync 필요 여부 확인

## 출력

체크리스트 표:

| 항목 | OK / FAIL | 조치 |
|---|---|---|

마지막에 **다음 추천 커맨드** 한 줄 (`/opspilot-ingest-fixture` 또는 `/opspilot-ingest-session`).
