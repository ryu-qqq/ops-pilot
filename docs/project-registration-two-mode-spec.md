# 프로젝트 등록 2모드 — 제품 스펙

> **상태:** 스펙 확정 (구현 전)  
> **추적:** Engineering OS Epic 「프로젝트 등록 2모드」·Tasks REG-01 ~ REG-07  
> **허브:** [Engineering OS](https://www.notion.so/36be81355305810ab090d786d4384140)

---

## 1. 문제

v1 등록 = **Git URL → 무조건 `git clone`** → `OPS_PROJECTS_DIR/<slug>`.

| 증상 | 원인 |
|---|---|
| Cursor dev와 harness가 다른 폴더 | clone slug ≠ 일상 checkout 이름 (`ryu-qqq__Infrastructure` vs `Infrastructure`) |
| apply 후 Cursor에 안 보임 | apply는 `project.clonePath`에만 커밋 |
| 수동 cherry-pick / push·pull | dev ↔ clone sync 제품화 없음 |
| UI 툴팁 `file://` | **미구현** 약속 |

**North Star:** Cursor-first 사용자는 **한 폴더**에서 ingest → apply → 다음 Cursor 세션이 이어져야 한다.

---

## 2. 해결 — 두 등록 모드

| | **`linked`** (기본 권장) | **`managed`** (현 v1) |
|---|---|---|
| **누가** | Cursor로 매일 그 레포에서 작업 | 원격-only · 격리 실험 · 팀 push 전 sandbox |
| **등록 입력** | 로컬 git 경로 + (권장) remote URL | Git URL |
| **`clonePath`** | 사용자 지정 경로 | `OPS_PROJECTS_DIR/<slugFromUrl>` |
| **scan / ingest / apply** | 그 경로 | clone 경로 |
| **시나리오 run** | worktree 격리 (변경 없음) | 동일 |
| **apply 후 Cursor** | 즉시 반영 | **sync 필요** (§5) |

### 2.1 왜 클론이 있었나 (managed의 정당성)

- OpsPilot = IDE와 분리된 **컨트롤 플레인**
- 로컬 checkout 없이 URL만으로 등록·평가
- pull / apply / scan이 **dirty working tree**와 분리
- git commit = harness 버전 SSOT

`linked`는 “Cursor dev = SSOT”일 때의 모드. `managed`는 “OpsPilot sandbox = SSOT”일 때의 모드.

---

## 3. 데이터 모델

### 3.1 `project` 테이블 (REG-01)

```ts
workspaceMode: z.enum(["linked", "managed"]).default("managed") // v1 호환
// clonePath: linked → 사용자 경로, managed → clone 경로 (필드명 유지)
remoteVerified: z.boolean().default(false) // linked 등록 시 origin ↔ gitUrl 검증
```

마이그레이션: 기존 row 전부 `workspaceMode = 'managed'`.

### 3.2 API — `POST /api/projects` (REG-02)

**linked**

```json
{
  "mode": "linked",
  "localPath": "/Users/me/Documents/my-repo",
  "gitUrl": "https://github.com/org/repo.git",
  "name": "my-repo"
}
```

**managed** (기존)

```json
{
  "mode": "managed",
  "gitUrl": "https://github.com/org/repo.git",
  "name": "optional"
}
```

**하위 호환:** `mode` 생략 → `managed`. `gitUrl`만 있는 body → managed.

### 3.3 `linkLocalProject` 검증

1. `localPath` 존재
2. `.git` 존재 (git repo)
3. (권장) `git remote get-url origin` normalize ↔ `gitUrl` 일치 → `remoteVerified=true`
4. dirty working tree → **경고** (등록 차단 X; scan/apply UI에서 재경고)
5. 동일 `localPath` / `gitUrl` 중복 → 400

`cloneProject()`는 **managed 전용** 유지.

---

## 4. UI / UX

### 4.1 등록 (REG-03)

`ProjectBar` 2탭:

1. **로컬 경로 연결 (권장)** — path input + optional gitUrl
2. **OpsPilot 관리 클론** — git URL (현행)

프로젝트 선택 시 badge: `로컬 연결` | `관리 클론`.

거짓 `file://` 툴팁 **삭제**.

### 4.2 피드백 · sync (REG-04)

| 모드 | apply 성공 후 |
|---|---|
| `linked` | “스캔 권장” (선택) |
| `managed` | 배너: clone ≠ dev → push/pull 또는 `/opspilot-sync-managed-clone` |

README 「5분 시작」에 모드별 흐름 diagram 추가.

---

## 5. managed 모드 sync (운영 · REG-06)

제품 v1은 **자동 dev mirror 미구현**. 표준 루틴:

```text
Cursor(dev) → commit → push origin
OpsPilot scan (pull clone) → ingest → apply (clone)
clone → push origin → dev pull
```

또는 dev에서 `git cherry-pick <apply-commit>`.

**Infrastructure 당장:** linked 재등록(`~/Documents/ryu-qqq/Infrastructure`) 또는 Cursor를 clone만 열기.

---

## 6. MCP (REG-05)

- `register_project` 또는 `scan_project` 문서 확장: `mode`, `localPath`
- `list_projects` 응답: `workspaceMode`, `clonePath`

---

## 7. Cursor Commands (REG-07)

템플릿: `docs/cookbook/cursor-commands/`

| 커맨드 | 용도 |
|---|---|
| `/opspilot-preflight` | 서버·스캔·work-evaluator 사전조건 |
| `/opspilot-ingest-fixture` | fixture ingest smoke |
| `/opspilot-ingest-session` | local-claude ingest |
| `/opspilot-sync-managed-clone` | managed 전용 dev↔clone sync |
| `/opspilot-post-apply` | apply 후 linked=scan / managed=sync |

소비 레포: 템플릿 복사 → `.cursor/commands/` + 상단 **로컬 설정** 블록 수정.

---

## 8. 구현 순서

```text
REG-01 → REG-02 → REG-03
              ├→ REG-05 (MCP)
              ├→ REG-04 (UX)
              └→ REG-06 (runbook)
REG-07 — REG-04 문구와 동기화 (템플릿은 선행 가능)
```

---

## 9. 검증 (Epic Done)

1. **linked:** `Infrastructure` 경로 등록 → ingest → apply → Cursor에서 `.claude` 변경 즉시 확인
2. **managed:** 기존 `ryu-qqq__Infrastructure` 회귀 — scan / run / apply 동작 유지
3. **sync:** managed apply 후 배너 + 커맨드로 dev sync 1회 성공
4. `corepack pnpm -r typecheck` · `lint` · `cd apps/web && build`

---

## 10. 정직한 한계 (v1 이후)

- linked + dirty tree 동시 apply 충돌 → v1은 경고만
- apply 후 origin auto-push → 미구현 (REG-04 배너 + 커맨드)
- Jira `OPSP-*` 키 → Engineering OS `TASK-n` / REG-xx 로 대체

---

*작성: 2026-05-26 · ops-pilot feat/project-registration-two-mode-spec*
