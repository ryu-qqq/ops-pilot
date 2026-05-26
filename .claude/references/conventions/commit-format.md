# Git 커밋·PR 제목 convention

agent-crew를 sync한 소비 프로젝트에서 **Cursor·Claude Code·사람**이 같은 규칙으로 커밋하도록 하는 SSOT.
프로젝트별 티켓 prefix는 `.claude/project.yaml`의 `git.commit`에서 읽는다 — 본문에 하드코딩하지 않는다.

## Subject (한 줄 — 필수)

```
<type>(<scope>): <TICKET> <한 줄 요약>
```

| 필드 | 규칙 |
|---|---|
| `type` | `feat` · `fix` · `docs` · `refactor` · `test` · `chore` · `ops` |
| `scope` | 선택. 소문자·숫자·`_` · `-` · `.` (예: `platform`, `harness`, `docs`) |
| `TICKET` | `project.yaml` → `git.commit.ticketSource` / `ticketPrefix` (아래) |
| 요약 | 한국어 또는 팀 합의 언어. 72자 이내 권장. 마침표 생략 |

### type 가이드

| type | 언제 |
|---|---|
| `feat` | 사용자·API 동작 추가 |
| `fix` | 버그 수정 |
| `docs` | 코드 동작 변경 없는 문서 |
| `refactor` | 동작 동일, 구조만 |
| `test` | 테스트만 |
| `chore` | 빌드·deps·잡일 |
| `ops` | Harness·`.claude`·`.cursor`·CI 워크플로 (앱 도메인과 구분) |

### TICKET — project.yaml

```yaml
git:
  commit:
    requireTicket: true
    ticketSource: notion-task-id   # notion-task-id | jira-key | literal
    ticketPrefix: ""               # ticketSource: literal 일 때만 (예: SPC)
    requireOnIngest: false         # true면 OpsPilot ingest 전 subject 검증
```

| ticketSource | TICKET 형식 | 예 |
|---|---|---|
| `notion-task-id` | 활성 Task의 `Task ID` | `TASK-42` |
| `jira-key` | Jira 이슈 키 | `OPSP-14` |
| `literal` | `ticketPrefix` + 숫자 | `SPC-1234` (`ticketPrefix: SPC`) |

작업 시작(`eo-start`) 시 Task를 고르고, 커밋·PR 제목에 **그 Task ID**를 넣는다.

## Body (선택)

```
why: <2줄 이내 — 왜 이 변경인가>
```

Engineering OS 완료(`eo-done`) 시 Notion Task `Commit` 필드에는 **해시 URL 또는 원격 commit 링크**를 넣고, subject는 위 규칙과 일치해야 한다.

## PR 제목

Squash merge를 쓰면 PR 제목 = 최종 커밋 subject. **커밋과 동일한 한 줄**을 쓴다.  
상세: [pr-title.md](./pr-title.md)

## OpsPilot Harness 전용 (앱 커밋과 별도)

OpsPilot이 `.claude` 자산·apply·bridge sync로 **직접 만드는 커밋**은 서버가 아래 형식을 강제한다. ingest subject 검증 대상에서 `ops(...)` 로 시작하는 Harness 커밋은 예외로 둘 수 있다.

```
ops(<kind>/<name>): <요약>

why: <이유>

[opspilot authored]
```

## 예시

```
docs(platform): SPC-120 Atlantis gap 문서 보강

why: pending 마커 제거 전 convention 정리
```

```
feat(harness): TASK-7 engineering-os 커밋 convention reference 추가

why: ingest·Notion Commit·에이전트 메시지 통일
```

```
ops(cursor_rule/feedback-loop): eval 후 ingest 안내 문구 추가

why: work-evaluator 회귀 후 HITL 경로 명확화
[opspilot authored]
```

## 에이전트 체크리스트

커밋·PR 직전:

1. `.claude/project.yaml` → `git.commit` 확인
2. 활성 Task/Jira 키가 subject에 있는지
3. type·scope가 변경 성격과 맞는지
4. `eo-done`이면 Notion `Commit`·`Wiki ADR` 갱신

## 관련

- Engineering OS 필드: `references/notion/engineering-os.md`
- 작업 루프: `skills/engineering-os/SKILL.md`
- OpsPilot ingest 검증: `git.commit.requireOnIngest` (선택)
