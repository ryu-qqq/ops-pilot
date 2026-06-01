---
name: harness-creator
description: Claude Code 하네스 자산(skill·agent)을 저작하는 메타 스킬. 의도 포착 → 선례 조회 → 종류·위치 판단 → 본문·트리거 저작 위임 → 구조화 커밋까지 오케스트레이션한다. 평가는 하지 않고 ops-pilot에 위임. "스킬 만들어", "에이전트 만들어", "하네스 자산 저작", "agent-crew에 스킬·에이전트 추가", "이 작업을 스킬로", "커스텀 에이전트 작성" 같은 요청에 트리거. 새 하네스 자산이 필요하거나 기존 자산을 제대로 다시 쓰려 할 때 적극 제안한다.
---

# Harness Creator Skill

> agent-crew 공유 자산. 프로젝트 고유 값은 `.claude/project.yaml`에서 읽는다.

skill·agent 같은 Claude Code 하네스 자산을 **제대로 엔지니어링해 저작**하는 오케스트레이터.
저작·커밋까지만 한다 — **트리거 정확도·표면준수·baseline 등 평가는 ops-pilot 몫**이다
(VERSIONING.md: "agent-crew는 평가를 실행하지 않는다"). 역할 분리를 지킨다.

## 작업 전 — 프로젝트 설정 로드 (필수)

시작 전 `.claude/project.yaml`을 Read하여:

- `project.name` — 프로젝트 식별자
- `project.stack` — 스택을 알면 스택 관용구에 맞춘다 (없어도 진행)
- `knowledge.vault.*` — 선례·평가 기록 저장소 (있으면 선례 조회에 사용)

## 작업 원칙 4줄 (저작에도 적용)

1. **가정하지 마라** — 무엇을·언제 트리거·산출형식이 불명하면 묻는다.
2. **최소만 만들어라** — 문제를 푸는 최소 자산. 추측성 섹션·MUST 남발 금지.
3. **범위를 지켜라** — 요청한 자산만. 곁다리 자산 양산 금지.
4. **성공 기준을 정하고 검증하라** — 검증은 ops-pilot에 넘긴다(아래 핸드오프).

## 파이프라인

```
의도 포착 → 선례 조회 → 종류·위치 판단
  → 저작 위임 (harness-author + harness-trigger-designer)
  → 조립·릴리스 기록 → 구조화 커밋 → ops-pilot 평가로 핸드오프
```

1. **의도 포착** — 무엇을 가능하게 하나 / 언제 트리거되나(사용자 발화·맥락) / 산출형식은. 현재 대화에 이미 담긴 워크플로(예: "이 작업을 스킬로")가 있으면 거기서 추출하고 빈틈만 사용자에게 확인.

2. **선례 조회** — vault 설정이 있으면 `wiki-lookup`으로 유사 자산·결정 선례를 찾고, agent-crew `agents/`·`skills/`에 비슷한 자산이 있는지 Glob/Grep으로 본다. **새 패턴을 만들기 전에 기존 것을 따른다** (CLAUDE.md "기존 자산 일관성").

3. **종류·위치 판단** (HITL) —
   - **종류**: skill(사용자 진입점·워크플로) vs agent(서브 역할·위임 단위). 둘 다면 skill이 agent를 조율.
   - **위치**: *이 자산을 프로젝트 안 가리고 쓸 수 있나?*
     - 예 → **agent-crew** 공통 (`skills/<name>/SKILL.md` 또는 `agents/<name>.md`) → 릴리스·태그 대상
     - 아니오(특정 코드베이스 전용) → 그 프로젝트의 **`.claude/`** 에 직접
   - 판단이 갈리면 사용자에게 확인한다.

4. **저작 위임** — 병렬로:
   - `harness-author` — 본문 초안 (agent-crew 컨벤션·프로젝트 비종속 강제)
   - `harness-trigger-designer` — `description`·트리거 키워드 설계 + 트리거/비트리거 예시 쿼리(이후 ops-pilot trigger-eval 입력 후보)

5. **조립·기록** — author 본문 + trigger-designer의 description을 합쳐 파일로 쓴다.
   agent-crew 공통 자산이면 다음 릴리스 `releases/vX.Y.Z.md`에 자산 블록을 추가하고(자산 추가 = MINOR), `CHANGELOG.md` 한 줄. **검증 상태는 "미검증"** — 태그는 ops-pilot 검증 후(VERSIONING.md).

6. **구조화 커밋** — `references/conventions/commit-format.md` + 소비 프로젝트 `project.yaml`의 `git.commit`. agent-crew 자체 커밋이면 type 생략 가능(CLAUDE.md "커밋 메시지").

7. **ops-pilot 평가로 핸드오프** — 커밋하면 끝이 아니다. 사용자에게 다음을 안내:
   - 자동 scan(post-commit 훅)이 있으면 등록됨, 없으면 ops-pilot `scan_project`
   - 트리거 정확도 → ops-pilot **trigger-eval** (trigger-designer가 만든 예시 쿼리 사용)
   - 시나리오 기반 산출 품질 → ops-pilot **시나리오 + grade**(표면준수 FAIL)
   - 가치 측정 → ops-pilot **baseline delta**
   - 평가가 좋으면 그 커밋에 `git tag`로 버전 확정.

## 경계 (지킬 것)

- **평가·벤치마크를 실행하지 않는다.** trigger 정확도·grade·baseline은 전부 ops-pilot. creator가 자체 채점하면 역할 분리가 무너진다.
- **프로젝트 비종속.** 본문에 절대경로·특정 프로젝트명·고유 수치 금지. 프로젝트 값은 `{placeholder}`로 두고 "project.yaml에서 읽는다"고 명시 (CLAUDE.md 절대 규칙).
- **최소.** 자산 하나를 깔끔히. 안 물어본 자산을 곁들이지 않는다.

## 호출 경로

- **사용자 직접** — "이거 스킬로 만들어줘", "이 코드리뷰 흐름을 에이전트로 작성해줘"
- **오케스트레이터/파이프라인** — 하네스를 늘리는 흐름의 저작 단계

## 산출물

- `skills/<name>/SKILL.md` 또는 `agents/<name>.md` (agent-crew 공통) — 또는 프로젝트 `.claude/` 전용
- agent-crew 공통이면 `releases/vX.Y.Z.md` 자산 블록(미검증) + `CHANGELOG.md` 한 줄
- 핸드오프 메모 — ops-pilot에서 무엇을 평가할지 (trigger 예시 쿼리 포함)
