---
name: engineering-os
description: Engineering OS(Notion) 작업 루프 — Task 시작·진행·완료와 wiki·Commit 기록을 한 흐름으로 묶는 스킬. "Engineering OS", "TASK 시작", "작업 시작", "Notion 태스크", "eo-start", "eo-done", "작업 완료 처리", "Wiki ADR 링크" 같은 요청에 트리거. Notion으로 백로그를 쓰는 프로젝트에서 기능·문서 작업 착수·마무리 시 제안한다.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Engineering OS Skill — 작업 루프 오케스트레이터

> agent-crew 공유 자산. 프로젝트 고유 값은 `.claude/project.yaml`에서 읽는다.

## 작업 전 — 프로젝트 설정 로드 (필수)

시작 전 `.claude/project.yaml`을 Read하여 확인한다:

- `tracking.notion.enabled` — true 아니면 멈추고 보고
- `tracking.notion.tasksDatabaseId` — Tasks DB (collection URI 또는 ID)
- `knowledge.vault.path` · `knowledge.vault.rawPrefix` — wiki raw 시드
- `tracking.notion.convention` — `engineering-os` 이면 `references/notion/engineering-os.md` Glob 후 Read
- `git.commit` — 커밋·PR subject (`references/conventions/commit-format.md` Glob 후 Read)

`tracking.jira.enabled`만 true이면 이 스킬 대신 Jira 워크플로를 안내한다.

## 역할

Engineering OS(Notion Tasks)와 wiki·git을 **같은 작업 단위**로 묶는 Controller다.
실제 Notion 갱신은 `notion-manager`, vault 기록은 `journal-recorder`·`wiki-curator`, ADR은 `adr` 스킬·`adr-author`에 위임한다.

## 모드

### A. 시작 (`eo-start`)

입력: Notion Task 페이지 URL 또는 Task ID(`TASK-n`).

1. Task 페이지 fetch — 스키마·현재 `상태` 확인
2. `notion-manager`에 위임 — `시작 전` → `진행 중` (convention 또는 DB 실제 옵션)
3. `wiki-lookup` — 관련 wiki 선례가 있으면 요약해 사용자에게 전달
4. `references/conventions/commit-format.md` Read — 이번 Task의 TICKET 형식 확인
5. 작업 범위·성공 기준을 1–3줄로 확인 (모호하면 질문)

### B. 완료 (`eo-done`)

입력: 동일 Task + 산출물 요약 + (선택) git commit hash/URL + wiki raw 경로.

0. 커밋을 만든 경우 subject가 `references/conventions/commit-format.md` + `git.commit`과 일치하는지 확인. 불일치면 사용자에게 수정 제안 (강제 amend는 HITL).
1. wiki raw·ADR·overview 갱신이 필요하면 `journal-recorder` 또는 `wiki-curator`·`adr` 스킬에 위임
2. `notion-manager`에 위임:
   - `상태` → `완료`
   - `Wiki ADR` url 속성
   - `Commit` url 속성
   - 코멘트 1–2줄 (vault raw 링크)
3. (선택) 사용자가 요청 시 `work-evaluator`에 작업 품질 채점 위임 — 백그라운드 Claude Code 세션용

### C. 조회

Engineering OS 허브·P0·진행 중 뷰 안내 — `hubPageUrl`이 있으면 링크 제공.
Notion MCP `search` / `fetch`로 Task 목록 조회.

## HITL

- Task 선택·완료 승인·ADR 결론은 **사용자**가 한다.
- 에이전트가 Task를 임의로 완료 처리하지 않는다.

## 산출물

- Notion Task — status · Wiki ADR · Commit 갱신
- vault `raw/` 시드 (과정·결정)
- (선택) wiki 합성 페이지 · in-repo ADR

## 다른 자산과의 관계

| 자산 | 관계 |
|---|---|
| `notion-manager` | Notion Tasks DB CRUD·status |
| `journal-recorder` | vault raw 시드 |
| `wiki-curator` | raw → wiki/projects 합성 |
| `adr` skill | in-repo 또는 wiki pivot ADR 파이프라인 |
| `work-evaluator` | 완료 후 4원칙 채점 (선택) |
| `jira-manager` | **사용 안 함** — Engineering OS 프로젝트 |

## 참고

- convention 상세: agent-crew `references/notion/engineering-os.md`
- 커밋·PR subject: `references/conventions/commit-format.md`
- Cursor 일상 작업은 IDE에서, Claude Code는 평가·지침 개선에 집중
