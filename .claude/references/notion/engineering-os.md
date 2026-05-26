# Engineering OS — Notion 작업 추적 convention

agent-crew `notion-manager`·`engineering-os` 스킬이 **선택적으로** 참조하는 필드·상태 매핑.
소비 프로젝트 DB가 이 convention과 다르면 DB fetch 결과를 우선한다.

## 구조 (3 DB + 허브)

| 리소스 | project.yaml 키 | 용도 |
|---|---|---|
| 허브 페이지 | `tracking.notion.hubPageUrl` | Engineering OS 대시보드 (linked view) |
| Tasks | `tracking.notion.tasksDatabaseId` | 일상 백로그 — **기본 작업 DB** |
| Projects | `tracking.notion.projectsDatabaseId` | 프로젝트 레지스트리 (relation) |
| Epics | `tracking.notion.epicsDatabaseId` | 큰 단위 목표 (relation) |

`notion-manager`의 기본 범위는 **Tasks DB**다. Projects/Epics는 relation·조회 시에만 쓴다.

## Tasks DB — 권장 속성

| 속성명 | 타입 | 용도 |
|---|---|---|
| `작업` | title | 작업 제목 |
| `Task ID` | auto_increment_id | `TASK-n` — Jira 키 대체 |
| `상태` | status | `시작 전` · `진행 중` · `완료` |
| `우선순위` | select | P0 · P1 · P2 · P3 |
| `프로젝트` | relation → Projects | 소속 프로젝트 |
| `Epic` | relation → Epics | 상위 Epic |
| `Phase` | select | 문서 · MVP · 피보팅 · 운영 · 코드 |
| `Wiki ADR` | url | wiki raw/ 또는 ADR 링크 (완료 시 필수) |
| `Commit` | url | git commit URL 또는 hash (코드·문서 커밋 시) |
| `Repo Impact` | select | 없음 · 문서만 · 코드 |
| `마감일` | date | 선택 |
| `설명` · `메모` | text | 요약·메모 |

속성명이 다르면 `tracking.notion.fieldNames`로 override (project.yaml).

## status 전이 (Engineering OS)

| 시점 | `상태` 전이 |
|---|---|
| 작업 시작 | `시작 전` → `진행 중` |
| 작업 완료 | `진행 중` → `완료` |
| 사용자·외부 대기 | → `시작 전` 유지 + 코멘트 (BLOCKED 옵션이 없으면 status 변경 없음) |

Jira-style `TODO` / `IN PROGRESS` / `DONE` DB는 notion-manager 본문의 일반 매핑表를 따른다.

## 완료 시 필수 갱신

1. `상태` = `완료`
2. `Wiki ADR` — vault `raw/` 또는 in-repo ADR URL
3. `Commit` — 해당 작업의 git commit (문서-only도 wiki 커밋 hash 가능)
4. 페이지 코멘트 1–2줄 + vault raw 경로 (과정 dump 금지)

**커밋 subject·PR 제목**은 `references/conventions/commit-format.md` 와 `.claude/project.yaml`의 `git.commit`을 따른다.
완료 커밋을 만들기 전에 convention을 Glob·Read한다.

## 지식 vault와의 관계

| 레이어 | 담당 | 경로 |
|---|---|---|
| Notion Tasks | *지금 뭘 하는지* | Engineering OS |
| wiki `raw/` | *과정·결정 시드* | `{vault.path}/raw/{rawPrefix}-*.md` |
| wiki `wiki/projects/` | *합성 overview·ADR* | wiki-curator |

Pivot·아키텍처 ADR은 **wiki raw**에 두고 Tasks `Wiki ADR` 필드로 링크한다.
in-repo `docs/adr/`는 코드와 함께 버전되는 결정용 — `adr-author`가 담당.

## North Star (Engineering OS 맥락)

- **Cursor** = 일상 작업 런타임
- **Claude Code** = 백그라운드 평가·지침 개선 (`work-evaluator` 등)
- **OpsPilot** = agent-crew 버전 핀·적용·(향후) sync
- **Engineering OS** = 멀티 프로젝트 백로그 단일 창구
