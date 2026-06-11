---
name: review-ledger
description: 리뷰된 PR에서 수용(타당) 판정된 리뷰 지적을 실수 원장에 적립하는 스킬. 같은 실수가 재발하지 않도록 ① OpsPilot 시나리오(베드케이스 라벨) 생성 ② vault 시드 기록 ③ 반복 패턴이면 자산 개선 proposal 초안까지 만든다. 리뷰 수집·타당성 판단은 pr-review-triage가 선행하고, 이 스킬은 그 결과의 적립만 전담한다. "이 리뷰 원장에 적립해줘", "이 지적 재발 안 하게 등록해", "리뷰에서 나온 실수 시나리오로 만들어", "방금 리뷰 학습시켜", "같은 실수 또 하지 않게 해줘", "리뷰 레저", "review ledger" 같은 요청에 트리거 — pr-review-triage 직후 "이 결과 적립해" 맥락이면 적극 제안한다. 단 "PR 리뷰 봐줘/분류해줘"(triage), "리뷰 남겨줘"(리뷰 작성), "proposal 검토"(proposal-reviewer), 일반 회고 기록(journal)이나 평가용 시나리오 제작(scenario-designer)은 이 스킬이 아니다. 어떤 지적을 적립할지 선별은 사람이 승인한다(HITL).
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Write
---

# Review Ledger Skill — 수용된 리뷰 지적을 실수 원장에 적립

> agent-crew 공유 자산. 프로젝트 고유 값은 `.claude/project.yaml`에서 읽는다.

## 작업 전 — 프로젝트 설정 로드 (필수)

**작업 시작 전 반드시 `.claude/project.yaml`을 Read**하여 다음을 얻는다:

- `project.name` — 프로젝트 식별자
- `knowledge.vault.path` — 지식 vault 레포의 절대 경로 (시드 기록 위치)
- `knowledge.vault.rawPrefix` — raw 시드 파일명 prefix

OpsPilot `projectId`는 project.yaml에 없으면 `list_projects`(MCP) 결과 또는 사용자 확인으로
얻는다 — 추측해서 다른 프로젝트의 자산을 고르지 않는다. projectId는 **자산 식별(2단계
`list_assets`)에만** 쓴다 — 시나리오 생성(`POST /api/scenarios`) 계약에는 없는 필드다
(`assetId`가 프로젝트를 이미 가린다).
아래 본문에서 vault 경로는 `{vault.path}`, prefix는 `{rawPrefix}`로 표기한다.

## 역할

PR 리뷰에서 **수용된(타당하다고 판단된) 지적**은 사람이 직접 단 라벨이다 — "이 작업은
이렇게 하면 틀린다"는 가장 비싼 신호인데, 리뷰가 닫히면 그대로 증발한다. 이 스킬은 그
신호를 **실수 원장(ledger)에 적립**해 같은 실수의 재발을 구조적으로 막는다. 적립은 세 갈래:

1. **OpsPilot 시나리오** — 실수가 나온 입력을 재현하는 베드케이스 시나리오를 책임 자산에 등록.
   이후 자산이 바뀔 때마다 "이 실수를 다시 하나"가 자동 평가된다.
2. **vault raw 시드** — 어떤 지적이 언제 어떤 자산 때문에 나왔는지 append-only 기록.
3. **자산 개선 proposal 초안** — 같은 유형이 반복되면 자산 본문을 고치자는 초안까지 제시
   (적용은 사람 승인 후 별도).

이 스킬은 **적립만** 한다. 리뷰 수집·판단·분류는 pr-review-triage 몫이고, 코드 수정·proposal
적용은 범위 밖이다.

## 입력 — triage 결과가 먼저다

이 스킬의 입력은 **수용된 지적 목록**이다. 출처는 둘 중 하나:

- 대화에 **pr-review-triage 결과**(✅ 수용 항목)가 있으면 그것을 쓴다.
- 사용자가 직접 지적 목록을 주면 그대로 받는다.

둘 다 없으면 적립할 재료가 없다 — **pr-review-triage를 먼저 돌리라고 안내하고 멈춘다**
(리뷰를 이 스킬이 직접 수집·판단하지 않는다).

각 지적에 대해 세 가지가 확보돼야 한다. 빠진 것은 사용자에게 묻는다:

- 무엇이 잘못됐나 (실수 내용)
- 올바른 기대는 무엇인가 (어떻게 했어야 하나)
- 어느 파일·어떤 작업 맥락에서 나왔나

## 흐름

### 1. 입력 확정

위 입력 규칙대로 수용된 지적 목록을 확정한다. 지적마다 실수·기대·맥락 3요소를 채운다.

### 2. 책임 자산 식별

각 지적에 대해 *그 작업을 만든 자산*(agent/skill)이 무엇인지 식별한다 — 시나리오를 달
곳이 자산이기 때문이다.

- OpsPilot `list_assets`(MCP)로 자산 목록을 보거나, 소비 프로젝트 `.claude/` 아래
  agents·skills 이름으로 추정한다.
- 어느 자산의 산출인지 모호하면 **사용자에게 묻는다** (가정 금지). 자산이 만든 작업이
  아니면(사람 수작업 실수 등) 시나리오는 건너뛰고 시드만 기록한다.

### 3. 적립 대상 선별 (HITL)

지적 목록을 표로 제시하고, **어떤 지적을 시나리오로 만들지 사람이 고른다**:

| # | 지적 요약 | 책임 자산 | 적립 권장 | 이유 |
|---|---|---|---|---|
| 1 | null 가드 누락 | builder-x | ⭕ 시나리오 | 일반화 가능한 실수 패턴 |
| 2 | 이 PR 한정 네이밍 | - | ✖ 시드만 | 일회성·맥락 한정 |

모든 지적을 기계적으로 적립하지 않는다 — 일회성·맥락 한정 지적은 시나리오로 만들어도
평가 노이즈만 늘린다. 권장과 이유를 붙이되 최종 선택은 사람이 한다.

### 4. 시나리오 적립

선택된 지적마다 OpsPilot 데이몬(`:3001`) REST로 시나리오를 만든다.

먼저 중복 확인 — 같은 자산에 유사 시나리오가 이미 있으면 **생성하지 말고 사용자에게 알린다**:

```bash
curl -s "http://localhost:3001/api/scenarios?assetId=<assetId>"
```

생성:

```bash
curl -s -X POST http://localhost:3001/api/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "<책임 자산 id>",
    "name": "review-ledger: <실수 유형 한 줄>",
    "description": "<어느 PR 리뷰에서 왔는지 + 실수 요약>",
    "input": "<실수가 나온 작업 요청을 재현하는 입력>",
    "expectation": {
      "judge": "<리뷰 지적을 일반화한 채점 기준 — 이 실수를 하지 않아야 한다>",
      "assertions": ["<결정적으로 확인 가능한 단언 — 있을 때만>"]
    }
  }'
```

- `name`은 `review-ledger: ` prefix 고정 — 원장에서 온 베드케이스임을 식별하기 위해.
- `input`은 특정 PR이 아니라 **실수를 유발한 작업 유형**을 재현하게 쓴다 (재발 검증이 목적).
- `judge`는 지적 원문 복사가 아니라 일반화한 기준으로 — "X 파일 42번 줄에 가드를 넣어라"가
  아니라 "외부 입력을 검증 없이 사용하지 않아야 한다"처럼.
- `assertions`는 결정적으로 확인 가능한 것만. 억지로 만들지 않는다.

### 5. 시드 기록 + 반복 감지

**시드 기록** — vault raw에 ledger 시드를 append 한다 (journal-recorder와 같은
append-only 규율 — 기존 시드는 수정하지 않고, git에도 손대지 않는다):

```
{vault.path}/raw/{rawPrefix}-<YYYY-MM-DD>-review-ledger.md
```

```markdown
## Ledger N: {실수 유형 한 줄}
- **출처**: {PR/리뷰 — 어디서 온 지적인지}
- **실수**: {무엇이 잘못됐나}
- **기대**: {올바른 동작}
- **책임 자산**: {agent/skill 이름 — 없으면 "사람 수작업"}
- **적립**: {시나리오 생성 여부 + 시나리오 name / 시드만}
```

**반복 감지** — 기록 전에 기존 ledger 시드(`{vault.path}/raw/{rawPrefix}-*-review-ledger.md`
— 쓰기와 같은 패턴. vault를 공유하는 다른 프로젝트의 ledger가 섞이지 않게)와 해당
자산의 기존 시나리오를 Grep/조회해, **같은 유형 지적이 2회 이상**이면 자산 개선 proposal
초안을 본문에 제시한다 (work-evaluator proposal 포맷):

```json
{
  "targetKind": "cursor_rule | agent | skill | command | workflow_patch",
  "targetPath": "<고칠 자산 경로>",
  "rationale": "<같은 지적 N회 반복 — 근거가 된 ledger 항목·시나리오 나열>",
  "content": "<자산에 추가/수정할 본문 초안>"
}
```

초안은 **제시까지**다. 적용은 사람 승인 후 proposal-reviewer/proposal-applier 경로 또는
직접 수정으로 — 이 스킬이 자산을 고치지 않는다.

## HITL 경계

- **에이전트가 직접**: triage 결과 정리 · 책임 자산 추정 · 선별 표 제시 · (선택된 것의)
  시나리오 생성 · 시드 append · 반복 감지 · proposal 초안 작성
- **사람 승인 후 (이 스킬 밖)**: 적립 대상 최종 선별 · proposal 적용 · 코드 수정 · vault 커밋

## 산출물

- 지적별 적립 결과 표 — 시나리오 생성됨(name·assetId) / 시드만 / 건너뜀(이유)
- ledger 시드 파일 경로 + 항목 번호
- (반복 패턴 발견 시) 자산 개선 proposal 초안 JSON

## 경계 — 이웃 자산과의 분업

- **pr-review-triage**: 리뷰 수집·코드 대조·수용/반론/보류 분류까지. 이 스킬은 그 *결과*를
  받아 적립만 한다.
- **journal-recorder / wiki-curator**: 일반 시드·wiki 합성. ledger 시드는 같은 raw 명명
  규칙·append-only 규율을 따르는 별도 유형이다.
- **proposal-reviewer / proposal-applier**: proposal의 검토·적용. 이 스킬은 초안 산출까지.
- ops-pilot의 cursor-feedback-review(proposal 검토 시나리오)와는 **무관**하다 — 이름이
  비슷하다고 혼동하지 않는다.

## 주의

- **재료 없이 시작하지 않는다** — triage 결과도 사용자 목록도 없으면 pr-review-triage 안내 후 멈춤.
- **전부 적립하지 않는다** — 일회성 지적까지 시나리오로 만들면 평가가 노이즈로 무뎌진다.
- **중복 시나리오 금지** — 생성 전 기존 시나리오 조회, 유사하면 알리고 멈춘다.
- **judge는 일반화** — 특정 파일·라인이 아니라 실수 *유형*을 채점하게 쓴다.
- **시드는 append-only, git 금지** — 기록만 하고 커밋·push는 사람 몫.
