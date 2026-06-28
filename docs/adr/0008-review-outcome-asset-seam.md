# 0008. PR 리뷰 결과물 → 자산개선 seam 잇기

- 상태: Accepted
- 날짜: 2026-06-28

## 맥락 (Context)

connectly ADR-0012 D3(ops-pilot 고도화)는 목표를 "계측 → 우선순위 → HITL"로 설정했다.
이후 실측 조사로 그림이 재구성됐다:

- **계측·HITL 루프는 이미 닫혀 있다.** Cursor 작업 채널
  (ingest → work-evaluator eval → proposal 자동생성 → reviewer → approve → apply → git)은
  거의 자동화돼 있으며 ADR-0004가 이 플라이휠을 Accepted로 확정했다.
- **World 1(자산별 diff·시나리오·점수 표면)은 이미 죽어 있다.** ADR-0006이 "격하 후
  시한부 정리"로 결정해 코드만 보존한 상태다. 과설계 의심 지점은 팀이 이미 NO로
  닫아 둔 것이다.
- **진짜 끊긴 곳은 PR 리뷰 채널이다.** agent-crew 스킬 `pr-review-triage` →
  `review-ledger` 흐름에서 `review-ledger`가 proposal 초안을 텍스트로 제시하는 데서
  멈추고, ops-pilot proposal 파이프라인으로 자동 진입시키지 못한다. 사람이 초안을
  손으로 옮겨야 하는 수동 이전 단계가 남아 있다.

PR 리뷰는 "실제로 틀린 것을 사람이 포착한" 최고신호 결과물이다. 이 신호가 자동으로
자산개선 proposal이 되지 못하는 한 군데의 seam이 현재 병목이다.

설계 정본: `docs/superpowers/specs/2026-06-28-review-outcome-asset-seam-design.md`

## 결정 동인 (Decision Drivers)

- **수동 이전 제거** — `review-ledger` 산출 초안을 복붙 없이 기존 파이프라인에
  자동 적립하는 것이 D3 고도화의 실질 가치다.
- **한 인박스 HITL** — PR 리뷰 출처 proposal도 Cursor 채널 proposal과 같은 ops-pilot
  작업 인박스에서 approve / reject가 가능해야 경험이 일관된다.
- **파이프라인 재사용** — reviewer → approve → apply → git 연쇄는 이미 검증돼 있다.
  신설이 아니라 재사용으로 seam을 이어야 한다.
- **HITL 불변식 유지** — ADR-0004 4A(proposal → apply 경계의 사람 승인)는 건드리지
  않는다. 자가편향 루프를 닫지 않는 핵심 안전장치다.
- **스키마 정합** — `improvement_proposal.ingest_id`는 NOT NULL(FK). 작업 인박스는
  `ingest_bundle` 단위로 렌더된다. PR 리뷰 출처 proposal도 bundle을 가져야 인박스에
  자연스럽게 뜬다.

## 검토한 옵션 (Considered Options)

### A. 합성 pr_review ingest_bundle (채택)

신규 `POST /api/feedback/review-proposal`이 단일 트랜잭션에서:

1. `ingest_bundle` 생성 — `ingest_trigger = 'pr_review'`, work-evaluator eval 건너뜀
   (사람이 이미 판단했으므로), `status = 'done'`(eval 후 상태와 동일 = proposal 준비·검토 대기).
2. `improvement_proposal` 생성 — `status = 'draft'`.

엔드포인트 자체는 결정적으로 두 row만 만들고 LLM/claude run을 스폰하지 않는다.
proposal-reviewer 검토는 기존 트리거(작업 상세의 수동 review 또는 `getAutoReview()`)에
맡긴다 — Cursor 채널의 eval-후 상태와 정확히 동일한 진입점이다. 이후
reviewer → approve → apply → git 파이프라인, 작업 인박스 렌더, HITL 게이트를
100% 재사용한다.

### B. FK nullable + 직삽입 (기각)

`improvement_proposal.ingest_id`를 nullable로 바꾸고 bundle 없이 proposal을 직삽입한다.
join/index/인박스 렌더에 파급이 생겨 "한 인박스" 목표가 깨진다.

### C. 시나리오로 재평가 (기각)

리뷰 지적을 bad-case 시나리오로 등록해 LLM이 proposal을 재도출한다. 사람이 이미 내린
판단을 LLM으로 간접 재생성 — 충실도↓, 비용 추가, World 1 격하(ADR-0006)와 충돌한다.

## 결정 (Decision Outcome)

**옵션 A — 합성 `pr_review` ingest_bundle** 을 채택한다.

신규 엔드포인트 `POST /api/feedback/review-proposal`(+ 서비스 `ingestReviewProposal`)이
리뷰 지적을 `ingest_bundle`(trigger=`pr_review`) + `improvement_proposal`(`draft`)으로
한 트랜잭션에 적립한다. 스키마 변경은 `ingest_bundle.ingest_trigger` CHECK를
`('auto','manual','pr_review')`로 확장하는 마이그레이션 1개뿐이다.

agent-crew `review-ledger` 스킬은 사람이 적립 선택한 항목에 대해 이 엔드포인트를
POST하도록 수정한다(텍스트 제시 → 자동 적립). 적립할 지적을 선택하는 HITL은 그대로
사람이 한다.

**HITL 보존**: proposal은 `draft`로만 진입하며, apply 승인은 사람이 한다(ADR-0004 4A
유지). proposal-reviewer가 dup/conflict를 자동 체크하나, `apply → git`은 사람 approve
없이 거부된다. 자가편향 루프(ADR-0004 3C)를 차단하는 경계를 그대로 유지한다.

**범위 밖(YAGNI):**
- 통합 우선순위 인박스(PR 리뷰·Cursor 채널 합류 + 빈도×마찰 랭킹)
- Linear 통합(webhook/API 트리거)
- 원래 D3의 telemetry/우선순위 랭킹 레이어
- MCP 도구화(REST로 충분)
- 한 명령 일괄(triage → ledger → ingest 자동 연쇄)

## 결과 (Consequences)

### 긍정

- PR 리뷰라는 최고신호 결과물이 수동 이전 없이 ops-pilot `draft` proposal로 자동
  적립된다. 사람은 ops-pilot 작업 인박스 한 곳에서 approve한다.
- 기존 reviewer → approve → apply → git 파이프라인·작업 인박스를 100% 재사용한다.
  신설은 엔드포인트 1개 + 마이그레이션 1개에 근접한다.
- HITL 경계(ADR-0004 4A)를 그대로 보존해 자가편향 루프를 닫지 않는다.

### 비용 / 위험

- `pr_review` bundle은 eval run이 없어 VerdictStrip·트레이스·diff·등급 패널이 빈 상태로
  뜬다. 의도된 것이며 인박스 UI에서 빈 상태를 견고하게 처리(빈 값/숨김)해야 한다.
- agent-crew `review-ledger` 스킬 수정이 별도 후속 Task다. 스킬이 엔드포인트 계약에
  의존하므로 **엔드포인트 먼저 → 스킬 후** 순서를 지킨다.

## 선례 (Related)

- ADR-0001 — 무상 신호 수집 원칙.
- ADR-0002 — 평가 설계 자산화.
- ADR-0004 — auto-ingest 플라이휠 · HITL 경계(4A). 본 ADR의 직접 선행.
- ADR-0006 — World 1 격하 후 시한부 정리. 옵션 C를 기각하는 근거.
- connectly ADR-0012 D3 — ops-pilot 고도화 원점 방향 결정.
- 설계 정본: `docs/superpowers/specs/2026-06-28-review-outcome-asset-seam-design.md`
