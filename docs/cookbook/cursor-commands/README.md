# OpsPilot Cursor Commands — 템플릿

피드백 루프에서 **수동으로 반복하던 단계**를 `/opspilot-*` 슬래시 커맨드로 고정합니다.

## 설치

```bash
# 소비 레포 루트에서
mkdir -p .cursor/commands
cp /path/to/ops-pilot/docs/cookbook/cursor-commands/opspilot-*.md .cursor/commands/
```

Cursor 채팅에서 `/` → `opspilot-preflight` 등 선택.

## 로컬 설정 (필수)

각 `.md` 상단 **「이 레포 설정」** 블록을 한 번 수정하세요.

| 변수 | 예시 |
|---|---|
| `projectId` | OpsPilot UI 또는 `GET /api/projects` |
| `workspaceMode` | `linked` (dev = clonePath) 또는 `managed` |
| `devPath` | Cursor에서 여는 폴더 |
| `clonePath` | OpsPilot `clone_path` (managed일 때) |
| `runbook` | 레포 내 `docs/opspilot-feedback-loop.md` 등 |

## 커맨드 목록

| 파일 | 슬래시 | 용도 |
|---|---|---|
| `opspilot-preflight.md` | `/opspilot-preflight` | 서버·스캔·work-evaluator 사전조건 |
| `opspilot-ingest-fixture.md` | `/opspilot-ingest-fixture` | fixture ingest (~5초 smoke) |
| `opspilot-ingest-session.md` | `/opspilot-ingest-session` | local-claude ingest + 폴링 |
| `opspilot-sync-managed-clone.md` | `/opspilot-sync-managed-clone` | **managed** — clone→dev sync |
| `opspilot-post-apply.md` | `/opspilot-post-apply` | UI apply 후 linked=scan / managed=sync |

## 모드별 루프

**linked** (REG-02 구현 후 권장)

```text
Cursor 작업 → commit → /opspilot-ingest-* → UI HITL apply → /opspilot-post-apply (scan)
```

**managed** (현 v1)

```text
dev commit/push → OpsPilot scan → ingest → apply(clone) → /opspilot-sync-managed-clone → /opspilot-post-apply
```

## 관련 문서

- [examples.md](./examples.md) — spring-platform / Infrastructure 설정 예시
- [project-registration-two-mode-spec.md](../../project-registration-two-mode-spec.md)
- Engineering OS Epic: [프로젝트 등록 2모드](https://www.notion.so/36ce8135530581378d4cefd6cdb37cfb)
- REG-07 (Notion Tasks)
