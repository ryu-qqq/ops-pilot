# 리뷰 결과물 → 자산개선 seam 잇기 — 설계

- 날짜: 2026-06-28
- 상태: 설계 확정 (구현 대기)
- 출처: connectly-services ADR-0012 D3(ops-pilot 고도화) 후속 브레인스토밍. 조사로 갭 재구성됨.
- 관련: ops-pilot ADR-0001(무상 신호)·0002(평가 설계 자산화)·0004(auto-ingest 플라이휠·HITL 경계)·0006(World1 격하). agent-crew 스킬 `pr-review-triage`·`review-ledger`·`feedback-loop`.

## 배경 — 갭 재구성

ADR-0012 D3는 ops-pilot 고도화를 "계측 → 우선순위 → HITL"로 봤으나, 실측 조사 결과 그림이 달랐다:

- **계측·HITL 루프는 이미 있음.** Cursor 작업 채널(ingest → work-evaluator → proposal 자동생성 → reviewer → approve → apply→git)은 거의 자동화돼 있다.
- **자산별 diff·버전 타임라인·시나리오·점수(World 1) 표면은 이미 죽어 있음.** ADR-0006이 "격하 후 시한부 정리"로 숨겨둠(코드만 보존). → 과설계 의심 지점은 팀이 이미 NO로 결정해 둔 것.
- **진짜 끊긴 곳은 따로 있다.** PR 리뷰 채널(`pr-review-triage` → `review-ledger`)에서 `review-ledger`가 proposal **초안을 텍스트로 제시까지만** 하고 ops-pilot proposal 파이프라인으로 흘려보내지 못한다. 사람이 손으로 옮겨야 한다.

즉 가장 고신호 "결과물"인 **PR 리뷰 지적이 자동으로 자산개선 proposal이 되지 못하는 한 군데의 seam**이 병목이다. 이 문서는 그 seam을 잇는다.

## 성공 기준

PR 리뷰의 검증된 지적이 ops-pilot `draft` proposal로 **자동 적립** → 기존 proposal-reviewer 검토 → 사람이 ops-pilot **한 인박스(작업 탭)**에서 approve → 기존 `apply→git`. **사람이 초안을 손으로 옮기는 단계가 사라진다.** apply 승인(HITL)은 그대로 유지(ADR-0004 4A).

검증 가능한 완료 조건:
1. `review-ledger`가 적립 선택한 지적이 ops-pilot에 `draft` proposal로 들어가고, 같은 작업 인박스에서 보인다.
2. 그 proposal은 기존 reviewer 큐 → approve → `apply→git` 경로를 그대로 탄다.
3. approve 없이 apply가 거부된다(HITL 경계 회귀 테스트).

## 데이터 흐름

```
PR 리뷰 코멘트
  → pr-review-triage (기존: gh CLI, 코드 대조·타당성 판단)
  → review-ledger (사람이 적립할 지적 선택 — HITL)
      ├─ POST /api/scenarios                 (기존) → 회귀 시나리오(bad-case)
      └─ POST /api/feedback/review-proposal   (신규) → ingest_bundle(pr_review) + proposal(draft)
  → proposal-reviewer (기존: 클론에서 dup/conflict 자동 체크)
  → [사람] ops-pilot 인박스에서 approve        ← HITL 경계
  → applyProposal → apply→git                (기존)
  → harness-bridge .claude→.cursor sync       (기존)
```

## 설계 — Approach A: 합성 "review ingest_bundle"

스키마 사실: `improvement_proposal.ingest_id`는 NOT NULL(ingest_bundle FK), 작업 인박스는 ingest_bundle 단위로 렌더된다. → 리뷰 출처 proposal도 ingest_bundle을 가져야 인박스에 자연스럽게 뜨고 기존 파이프라인을 100% 재사용한다. (대안 B "FK nullable + 직삽입"은 join/index/인박스 렌더에 파급돼 "한 인박스" 목표가 깨지고, 대안 C "시나리오로 재평가"는 사람이 이미 내린 판단을 LLM으로 재도출 = 간접·비용·충실도↓ → 모두 기각.)

### 컴포넌트 1 — ops-pilot 신규 엔드포인트

`POST /api/feedback/review-proposal` (+ MCP 도구 `ingest_review_proposal`)

요청 payload:
```jsonc
{
  "projectId":  "<uuid>",          // 대상 프로젝트
  "targetKind": "cursor_rule | cursor_skill | agent | skill | command | workflow_patch",
  "targetPath": "<책임 자산 경로>",  // review-ledger가 list_assets로 식별한 결과
  "rationale":  "<리뷰 지적 요약 / 반복 근거>",
  "content":    "<수정 초안>",
  "review": {                       // provenance
    "prNumber":   123,
    "repo":       "owner/repo",
    "commentUrl": "https://github.com/.../pull/123#discussion_r...",
    "reviewer":   "<리뷰어>",
    "mistakeType":"<실수 유형>"
  },
  "scenarioId": "<선택: review-ledger가 만든 회귀 시나리오 링크>"
}
```

동작(단일 트랜잭션):
1. `ingest_bundle` 생성 — `project_id`, `git_ref` = PR head SHA(없으면 PR ref 문자열), `diff_summary` = `PR #<n>: <mistakeType>`, `context_json` = JSON(review + scenarioId), `ingest_trigger = 'pr_review'`. **work-evaluator eval 단계는 건너뛴다**(사람이 이미 판단함). status는 기존 reviewer 큐가 진입을 기대하는 값에 맞춘다(구현 계획에서 기존 `queueProposalReview`의 전제 status 확인 후 확정 — 후보: eval을 건너뛰고 `done`으로 두거나 `reviewing`으로 직행).
2. `improvement_proposal` 생성 — `ingest_id` = 위 bundle, `run_id` = null, `target_kind`/`target_path`/`rationale`/`content`, `status = 'draft'`.
3. 기존 `queueProposalReview`로 proposal-reviewer 큐잉.

응답: `{ ingestId, proposalId }`.

식별 책임: 책임 자산은 스킬이 이미 `list_assets`로 식별하므로 `targetKind`/`targetPath`를 그대로 보낸다. 엔드포인트는 자산 해석을 하지 않는다(단순 유지).

### 컴포넌트 2 — 스키마 마이그레이션 (1개)

`ingest_bundle.ingest_trigger` CHECK를 `('auto','manual')` → `('auto','manual','pr_review')`로 확장. `improvement_proposal` 테이블은 무변경.

SQLite는 CHECK 제약 변경에 테이블 재생성(create new → copy → drop → rename)이 필요하다. ops-pilot 기존 마이그레이션 관행을 따른다(WAL 주의).

### 컴포넌트 3 — agent-crew `review-ledger` 스킬 수정

현재 2-5단계 "proposal 초안을 텍스트로 제시"를, 사람이 적립 선택한 항목에 대해 **신규 엔드포인트 POST**로 교체한다.
- 2-3단계(`POST /api/scenarios`)에서 받은 `scenarioId`를 proposal payload에 링크.
- 어떤 지적을 적립할지의 HITL 선택은 그대로 사람이 한다(변경 없음).
- 결과: 초안이 자동으로 ops-pilot `draft`로 안착하고, 사람은 ops-pilot 인박스에서 본다(텍스트 복붙 제거).

### 컴포넌트 4 — 인박스 UI 최소 보강

eval run이 없는 `pr_review` bundle도 작업 탭에서 깨지지 않게 처리한다.
- run 의존 패널(VerdictStrip·트레이스·diff·등급)은 빈 상태를 견고하게(빈 값/숨김).
- "PR 리뷰 출처" 배지 + provenance(PR 링크·리뷰어·mistakeType) 표시.
- proposal 카드는 정상 표시(approve/reject 동작 동일).

## HITL 보존 (ADR-0004 4A)

review proposal은 `draft`로만 진입한다. auto-apply 하지 않는다. proposal-reviewer가 dup/conflict를 자동 체크하되(high-risk는 autoApply=false 정책), **사람 approve가 있어야 `apply→git`**. → "한 인박스 HITL" 성공 기준을 충족하면서 자가편향 루프(ADR-0004 3C)를 차단한다.

## 범위 밖 (YAGNI — 전부 후속)

- 통합 우선순위 인박스(PR 리뷰·Cursor 작업 채널 합류 + `빈도×마찰` 랭킹)
- Linear 통합(webhook/API를 트리거·인박스 소스로 — ADR-0010 D6, 미구현)
- 원래 D3의 telemetry/우선순위 랭킹 레이어 — seam이 더 큰 병목이라 우선순위 낮춤
- 한 명령 일괄(triage → ledger → ingest 자동 연쇄)

## 테스트

- ops-pilot 단위/통합: 신규 엔드포인트가 bundle+proposal을 만들고 reviewer 큐에 진입하는지. **approve 없이 apply가 거부되는지(HITL 경계 회귀)**. 격리 스택(임시 `OPS_DB_PATH`+포트)으로 검증.
- review-ledger: 임시 ops-pilot 인스턴스에 POST하는 흐름 시연(스킬은 지침이므로 수동 시연).

## 실행 위치·순서

- ops-pilot 레포: 엔드포인트·마이그레이션·UI 보강(자체 CLAUDE.md 루프·Jira OPSP·ADR).
- agent-crew 레포: `review-ledger` 스킬 수정·버전 태그.
- 스킬이 엔드포인트 계약에 의존하므로 **엔드포인트 먼저 → 스킬 후**.
- 방향 결정이므로 ops-pilot **ADR-0008** 한 장으로 확정할 값어치가 있다.

## 미해결 리스크

- SQLite CHECK 변경 마이그레이션 방식(ops-pilot 관행 확인 후 적용).
- run 없는 ingest_bundle에 대한 인박스 UI 견고성(빈 패널 처리 범위).
- PR head SHA를 스킬이 보낼지(`gh` 보유) 엔드포인트가 조회할지 — 스킬이 보내는 게 단순(엔드포인트 외부 호출 회피).
