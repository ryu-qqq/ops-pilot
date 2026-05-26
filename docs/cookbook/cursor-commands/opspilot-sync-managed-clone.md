# OpsPilot managed clone → dev 동기화

**workspaceMode=managed** 일 때만 사용. OpsPilot apply가 **clonePath**에만 커밋했을 때, Cursor **devPath**에 반영한다.

`linked` 모드면 이 커맨드 대신 “이미 같은 폴더”라고 보고 `/opspilot-post-apply`만 안내.

## 이 레포 설정 (한 번만 수정)

- **workspaceMode:** `managed`
- **devPath:** `REPLACE_WITH_CURSOR_DEV_REPO` (예: `~/Documents/ryu-qqq/Infrastructure`)
- **clonePath:** `REPLACE_WITH_OPSPILOT_CLONE` (예: `~/Documents/ryu-qqq/ryu-qqq__Infrastructure`)
- **defaultBranch:** `main`
- **syncStrategy:** `push-pull` | `cherry-pick` (아래에서 사용자에게 확인)

## 워크플로

1. **상태 비교**
   ```bash
   git -C "<clonePath>" log -3 --oneline
   git -C "<devPath>" log -3 --oneline
   git -C "<clonePath>" status -sb
   git -C "<devPath>" status -sb
   ```
   - clone에만 있는 apply 커밋 SHA 목록

2. **전략 선택** (사용자 확인 필수)

   **A. push-pull** (origin이 SSOT, 팀 workflow)
   ```bash
   git -C "<clonePath>" push origin <defaultBranch>
   git -C "<devPath>" pull --ff-only origin <defaultBranch>
   ```

   **B. cherry-pick** (dev만 앞서 있거나 부분 반영)
   ```bash
   git -C "<devPath>" cherry-pick <APPLY_COMMIT_SHA>
   # conflict 시 중단하고 보고 — 임의 merge 금지
   ```

3. **검증**
   ```bash
   git -C "<devPath>" log -1 --oneline
   # apply 대상 파일 diff 요약 (예: .claude/agents/, .cursor/rules/)
   ```

4. **origin push**는 사용자 명시 요청 있을 때만

## 출력

- 선택한 syncStrategy
- 반영된 commit SHA
- devPath에서 변경된 파일 목록
- 실패·conflict 시 정확한 에러와 다음 수동 조치

## 관련

- [project-registration-two-mode-spec.md](../../project-registration-two-mode-spec.md) §5
- REG-04 구현 후 UI 배너와 동일 문구 유지
