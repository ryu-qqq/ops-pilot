# OpsPilot apply 후 마무리

피드백 탭에서 proposal **승인 → clone에 반영(apply)** 직후 실행한다.

## 이 레포 설정 (한 번만 수정)

- **projectId:** `REPLACE_WITH_OPSPILOT_PROJECT_UUID`
- **workspaceMode:** `linked` | `managed`
- **devPath:** `REPLACE_WITH_DEV_REPO_PATH`
- **clonePath:** `REPLACE_WITH_OPSPILOT_CLONE_PATH`
- **opsPilotApi:** `http://localhost:3001`

## 워크플로

1. **apply 커밋 확인**
   - `workspaceMode=linked` → `devPath`에서 `git log -1 --oneline`
   - `workspaceMode=managed` → `clonePath`에서 `git log -1 --oneline`

2. **linked 모드**
   - `POST /api/projects/{projectId}/scan` 실행 (또는 UI 스캔)
   - Cursor에서 변경된 harness 파일 경로 나열 (`.claude/`, `.cursor/rules/` 등)
   - **sync 불필요** — 다음 Cursor 세션에서 바로 사용

3. **managed 모드**
   - dev와 clone commit diverge 여부 확인
   - **`/opspilot-sync-managed-clone` 실행** (또는 동일 단계 인라인)
   - sync 완료 후 devPath `git log -1` 재확인

4. **(선택) Engineering OS**
   - 연결된 Notion Task가 있으면 `Commit` url·1줄 코멘트 갱신 제안

## 출력

| 항목 | linked | managed |
|---|---|---|
| apply commit | SHA | SHA (clone) |
| dev 반영 | 즉시 | sync 후 SHA |
| scan | 실행함 | clone 기준 scan |
| 다음 작업 | Cursor 계속 | origin push 여부 (사용자 선택) |

## 실패 시

- apply 안 됨 → 피드백 탭 proposal status 확인
- managed sync conflict → cherry-pick 중단, 파일별 conflict 보고
