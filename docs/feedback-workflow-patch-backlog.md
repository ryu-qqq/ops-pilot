# Feedback loop — `workflow_patch` 갭 백로그

> **발견일:** 2026-05-25  
> **재현:** spring-platform-commons CI Task — `local-claude` ingest  
> **ingest id:** `a9bb380a-41b9-4e5e-9742-8bdec0c3dec7`  
> **eval run id:** `9f9ff43f-166d-46e1-a61f-e2280581bcd9` (succeeded)  
> **ingest status:** `failed` — `contextJson.evalError`: `proposal JSON parse failed`

## 증상

1. `local-claude` eval run은 **succeeded** (work-evaluator가 4원칙 채점 + JSON proposals 출력).
2. ingest는 **failed** — proposal이 DB에 저장되지 않음.
3. OpsPilot **피드백** 탭에 draft proposal 없음 → HITL apply 불가.

## 근본 원인

work-evaluator가 아래 형태로 proposal을 냈으나, 파서/스키마/apply가 **`workflow_patch`를 모름**.

```json
{
  "proposals": [
    {
      "targetKind": "workflow_patch",
      "targetPath": ".github/workflows/ci.yml",
      "rationale": "...",
      "content": "      - name: Upload test reports\n        ..."
    }
  ]
}
```

현재 허용 kind (`packages/shared-types/src/domain.ts`):

```ts
z.enum(["cursor_rule", "agent", "skill", "command"])
```

→ Zod `safeParse` 실패 → `parseProposalsFromRun` returns `null` → ingest `failed`.

---

## 수정 우선순위

### P0 — ingest 파이프라인 (반드시)

| # | 파일 | 작업 |
|---|------|------|
| 1 | `packages/shared-types/src/domain.ts` | `improvementTargetKindSchema`에 **`workflow_patch`** 추가 |
| 2 | `apps/server/src/domains/feedback/parser.ts` | parse 실패 시 Zod error message를 `evalError`에 기록 (디버깅) |
| 3 | `apps/server/src/domains/feedback/scenario-template.ts` | eval 프롬프트 JSON 예시·허용 `targetKind` 목록에 `workflow_patch` 명시 |
| 4 | `apps/server/src/domains/feedback/apply.ts` | **`applyWorkflowPatch()`** 구현 — `.github/workflows/*` 대상, `content`(YAML step fragment)를 job steps에 merge/append 후 구조화 커밋 |

#### apply `workflow_patch` 설계 초안

- `targetPath`: `.github/workflows/ci.yml` (`.github/workflows/` 하위만 허용)
- `content`: YAML **fragment** (보통 `steps` 항목 1개 이상)
- apply 동작 (v1 최소):
  1. 기존 파일 Read
  2. `jobs.<first-job>.steps` 끝에 fragment append (또는 named step 뒤 insert — v2)
  3. `git add` + OpsPilot 구조화 커밋
- `content`가 전체 파일 교체인 경우와 fragment인 경우 구분 필요 → v1은 **append-only**로 시작 권장

### P1 — eval 일관성

| # | 파일 | 작업 |
|---|------|------|
| 5 | feedback eval 시나리오 (run launcher / scenario builder) | trace상 `workflow_patch` 허용 문구와 `scenario-template.ts` **단일 소스화** |
| 6 | agent-crew `work-evaluator.md` | JSON 출력 스키마 + 허용 `targetKind`를 agent 본문에 명시 (OpsPilot만 알고 agent는 모르는 상태 방지) |
| 7 | `apps/server/src/domains/feedback/fixture.ts` | fixture에 `workflow_patch` proposal 1건 추가 (CI 없이 parser/apply 단위 검증) |

### P2 — UX / 운영

| # | 작업 |
|---|------|
| 8 | `apps/web/.../feedback-view.tsx` — `workflow_patch` preview (YAML diff) |
| 9 | ingest `failed` + eval run `succeeded` → **재파싱** 또는 수동 proposal import API |
| 10 | `proposals: []` 빈 배열 = ingest `done` (개선안 없음 valid) |

---

## 검증 시나리오 (Done 정의)

spring-platform-commons clone 기준:

1. CI commit SHA로 `local-claude` ingest
2. ingest `status: done`, proposals ≥ 1
3. `workflow_patch` proposal **승인 → apply** → `.github/workflows/ci.yml` 변경 + git commit
4. (회귀) `cursor_rule` proposal도 기존처럼 apply 가능

재현 curl (OpsPilot `:3001` 기동 후):

```bash
curl -s -X POST http://localhost:3001/api/feedback/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "9f83dd39-85e2-4fb2-807c-b565c27d82b3",
    "gitRef": "<spring-platform-commons SHA>",
    "evalSource": "local-claude",
    "notionTaskUrl": "https://www.notion.so/36be813553058127902bf2509e08202a",
    "retro": "CI workflow — workflow_patch ingest 회귀"
  }'
```

---

## 관련 문서 (소비 레포)

- spring-platform-commons: `docs/opspilot-feedback-loop.md`
- spring-platform-commons: `docs/engineering-os-runbook.md`

## North Star

CI·SDK·Harness 변경도 feedback loop 대상이 되려면, **코드 산출물 종류별 targetKind** (cursor_rule, workflow_patch, …)가 parser → apply까지 end-to-end여야 한다.
