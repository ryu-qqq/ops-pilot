# 0004. 자동 ingest 플라이휠 — Cursor 산출물 진입(ingest 트리거)의 자동화 깊이

- 상태: Accepted
- 날짜: 2026-06-03

## 맥락 (Context)

Cursor 작업 산출물을 OpsPilot 피드백 파이프라인(ingest → work-evaluator eval →
proposal-reviewer → apply)으로 흘리는 흐름은 이미 존재한다. 그런데 그 **진입점
(ingest 트리거)만 수동**이다. ingest 이후의 eval→review 연쇄는 **이미 자동**이고
(사람이 끼지 않는다), apply는 HITL 게이트(approved 강제)로 막혀 있다. 즉 플라이휠을
가로막는 단 한 곳은 *맨 앞의 수동 진입점*이다.

핵심 질문: **이 수동 진입점을 어디까지 자동화해 "Cursor에서 작업하면 알아서 개선안이
도는" 플라이휠로 만들 것인가 — 그러면서 ADR 0001 결정3·4(주기 스캔·수집/생성 분리),
ADR 0002·0003(새 러너 금지·점진 격하), 99-evaluation-framework §6.4(자가편향),
feedback-loop MVP §3·§5(HITL=apply 경계)를 위반하지 않을 수 있는가.**

맥락·제약(코드 실측):

- **진입점** = MCP `ingest_cursor_session`(server.ts:351) = `POST /api/feedback/ingest`.
  사람이 `gitRef`(commit SHA)를 직접 줘야 한다. `ingestFeedback`(service.ts:35)이
  `collectCommitDiff(clonePath, gitRef)`로 diff 번들을 만든다. transcript는 선택·발췌만.
- **ingest 이후 연쇄는 이미 자동** — `queueFeedbackEval`(eval-queue.ts:76) →
  `startRun(work-evaluator)` 비동기 → 완료훅 `handleFeedbackRunCompleted`(eval-queue.ts:133)
  가 proposal draft 저장 후 **자동으로** `queueProposalReview`로 연쇄. review 완료훅
  (review-queue.ts:220)이 reject/approve 적용. **eval→review는 사람이 안 낀다.**
- **HITL 게이트** = proposal→apply 경계. `applyProposal`(proposal-service.ts:72)은
  status≠approved면 거부. 저위험 자동 apply는 `shouldAutoApply`(review-policy.ts) 통과
  시만, `workflow_patch`는 `OPS_FEEDBACK_AUTO_APPLY_WORKFLOW=1` 없으면 차단.
- **status 머신**(domain.ts:315): ingest는 pending→evaluating→done→reviewing→reviewed
  (+failed). target_kind: cursor_rule·cursor_skill·workflow_patch·agent·skill·command.
  proposal status: draft·approved·rejected·applied.
- **자동 트리거 인프라가 이미 존재** — `plugins/work-metric-scan.ts`: 부팅 시
  setImmediate 1회 + setInterval(기본 30분, `OPS_WORK_METRIC_SCAN_INTERVAL_MS`,
  `timer.unref()`). "별도 잡 스케줄러 없이 setInterval 하나"는 ADR 0001 결정3(주기
  스캔)의 검증된 패턴 SSOT다. `scanWorkMetrics`·`scanTranscriptUsage`가
  `~/.claude/projects/**/*.jsonl`을 전수 멱등 재스캔(세션 단위, cwd→프로젝트 매핑).
- **커밋↔transcript 약한 고리** — ingest는 gitRef(SHA)가 필수인데 transcript JSONL은
  `gitBranch`만 갖고 SHA 직결이 미확인이다(ADR 0001 결정2). 즉 **세션 단위 스캔
  인프라**와 **커밋 단위 ingest API**는 *키가 다르다*.
- **ADR 0003 D1 source 의미 충돌 주의** — `run.source`·`scenario.source`(asset|baked)는
  **평가 설계 provenance**이고 `aggregateBenchmark.bySource`도 이 축이다. "자동 ingest
  vs 수동 ingest" provenance는 이와 **다른 차원**이다 → 같은 컬럼에 넣으면 ADR 0003의
  A/B 측정축이 오염된다. 별 차원(예: `ingestTrigger`)으로 분리할지가 결정거리다.

이 ADR은 위 자동화의 *결정·근거*까지를 다룬다. Decision Outcome·Consequences는 사람의
결정(Accepted) 후 채운다 — 지금은 TBD(ADR 0002·0003 초안과 동일한 방식).

## 결정 동인 (Decision Drivers)

- **누락 복원력 vs 즉시성** — ADR 0001 결정3은 "주기 스캔 우선, 즉시성 포기,
  post-commit 비채택"을 못박았다. 진입 자동화도 이 트레이드오프를 상속할지가 갈린다.
- **LLM 비용** — eval·review run은 유상이다(트리거당 work-evaluator + proposal-reviewer
  = 2 run). 무상인 work-metric 스캔과 성격이 다르다. 트리거가 자동으로 늘면 비용이
  선형으로 증가한다.
- **자가편향 환류(§6.4)** — 자동 ingest → 같은 하네스가 평가 → 개선안 → 자동 apply →
  다음 작업에서 그 자산 재사용, 이 루프가 닫히면 자가편향이 누적된다. §6.4는 "자가+외부
  둘 다일 때만 비교"·"단순 가산 아님·양방향"을 요구한다.
- **HITL 게이트 불변** — feedback-loop MVP §3·§5은 apply 경계의 사람 승인을 직역한다.
  진입·평가가 자동이어도 *쓰기(apply)* 경계는 사람이 지킬지가 핵심.
- **수집/생성 분리** — ADR 0001 결정4는 완전 자동 환류를 범위 밖으로 두고 수집과 생성을
  분리했다. 진입 자동화가 이 경계를 넘는지 본다.
- **새 러너 금지** — ADR 0002·0003은 새 러너·새 스코어러를 만들지 않는다. 자동 ingest도
  새 스케줄러를 신설하지 않고 기존 트리거 인프라를 재사용해야 한다.
- **트리거↔단위 키 정합** — 자동 트리거의 단위(세션 vs 커밋)가 ingest API의 키(커밋
  SHA)와 맞아야 한다. 세션 단위 스캔 인프라와 커밋 단위 ingest는 키가 다르다.

## 검토한 옵션 (Considered Options)

결정포인트별로 대안을 나눈다. 권고 후보는 "(연구 권고: …)"로 표기하되,
**최종 채택은 Decision Outcome에서 사람이 정한다(현재 TBD)**.

### 1. 무엇을 자동화하나 — 자동화 깊이

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **1A 트리거만 자동** | ingest 진입만 자동, eval·review·apply는 현행 유지 | 비용 최소, 수집/생성 분리(결정4) 직역, 가장 점진 | 사람이 eval 명시 트리거를 따로 해야 하면 플라이휠이 약함 |
| **1B 트리거+eval+proposal 생성까지 자동** | review·apply는 HITL, draft까지 자동 생성(연쇄는 이미 코드에 있음) | draft가 쌓여 검토 대기열로, 신설 0 근접 | 트리거당 work-evaluator run 비용, 노이즈 draft 누적 |
| **1C eval+review+저위험 auto-apply까지** | `shouldAutoApply` 통과 건은 자동 적용 | 완전 플라이휠에 근접 | §6.4 자가편향 루프가 닫힘, ADR 0001 결정4 충돌 소지 |
| **1D 전부 수동(현행)** | 현행 유지 | 0 리스크 | 플라이휠 미성립(기준 옵션) |

축: 비용 ↔ 즉시성 ↔ 자가편향. (연구 권고: **1A 또는 1B가 결정4와 정합**. 1C는
§6.4·결정4 위반 소지가 있어 신중.)

### 2. 트리거 시점·범위

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **2A 주기 스캔(work-metric-scan 확장)** | 기존 setImmediate+setInterval/unref 패턴 재사용 | ADR 0001 결정3 직역, 검증된 패턴 재사용, 누락 복원, 탐지 자체는 무상 | 즉시성 없음, 신규 커밋·세션 탐지 로직 필요 |
| **2B post-commit 훅** | 커밋 직후 즉시 트리거 | 즉시성 | ADR 0001 결정3 비채택 사유(데몬 죽음·매핑 약함)와 정면충돌 |
| **2C 데몬 watch** | 파일 watcher로 준즉시 | 준즉시 | watcher가 죽으면 누락 |
| **2D 단위 = 세션** | 세션 JSONL 단위로 트리거 | 스캔 인프라와 키 정합 | diff 출처가 불명(ingest는 SHA를 요구) |
| **2E 단위 = 커밋** | 커밋 SHA 단위로 트리거 | 현 ingest API와 키 정합 | 자동 스캔이 "어느 SHA를 ingest할지" 선택 규칙 필요 |

(연구 권고: **2A 우세**. 단위는 **2E 커밋이 현 API와 맞으나** "어느 커밋을 자동
선택하나"가 열린 질문이다. 2B/2C는 ADR 0001에서 이미 비채택.)

### 3. 자동화 위험 방어

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **3A 노이즈 필터** | ingest 후보 필터(잡 커밋·머지·docs-only 제외, `assertCommitSubjectForIngest`·diff 크기/경로) | 무의미 트리거 차단 | 과하면 누락 |
| **3B 비용 레이트 제한** | eval 레이트 제한(트리거당 1회·배치 상한) | 비용 폭주 차단 | 상한이 낮으면 백로그 |
| **3C 자가편향 차단** | 자동 apply 금지(HITL 유지) + 사람 소표본(ADR 0003 B3) | §6.4 외부 신호 확보, 루프 닫힘 방지 | 완전 자동화 포기(의도된 비용) |
| **3D source 차원 분리** | 자동/수동 provenance를 `run.source`(asset|baked)와 **별 컬럼**으로 | ADR 0003 A/B 측정축 오염 회피 | 스키마 1겹 추가 |

(연구 권고: **3A+3B+3C 동시**. 3C가 핵심. 3D는 ADR 0003 충돌 회피용.)

### 4. HITL 게이트 위치

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **4A proposal→apply 경계 유지(현행)** | MVP §3·§5 직역, 코드 그대로 | ingest·eval이 자동이어도 draft 노이즈는 사람이 흡수 | (자동화 효과는 draft까지만) |
| **4B ingest 진입에도 게이트** | 진입에 사람 승인 추가 | 비용·노이즈를 원천 차단 | 자동화 효과 반감 |
| **4C 저위험만 게이트 면제** | `shouldAutoApply` 통과 건 면제 | 사람 부하↓ | §6.4 자가편향에 가까움(=1C) |

(연구 권고: **4A 기본**. 4C는 경계 — 사람 결정.)

### 5. 스코프

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **5A 최소(트리거 자동화만+기존 연쇄)** | 진입 자동화 + 이미 있는 eval→review 연쇄 | 점진·격하 패턴 정렬, 신설 0 근접 | 플라이휠 일부만 |
| **5B 풀 자동 환류(자동 apply+거절 학습)** | 완전 자동 적용·거절을 학습 신호로 | 완전 플라이휠 | 환류 미구현·§6.4·결정4 충돌, 머신 스코어러까지 끌림 |

(연구 권고: **5A 시작 → 점진**. 5B는 미구현 영역을 끌어와 정직성과 충돌.)

## 선례 정합·충돌

- **ADR 0001 결정3(주기 스캔, post-commit 비채택)** — **2A 정렬**, 2B/2C 충돌.
- **ADR 0001 결정4(수집/생성 분리, 완전 자동 환류 범위 밖)** — **1A/1B·5A 정렬**,
  1C/5B 충돌.
- **ADR 0002·0003(새 러너 금지·점진 격하)** — 기존 자산 재사용(2A·5A) 정렬, 새
  스케줄러/스코어러 신설은 충돌.
- **ADR 0003 D1 source(asset|baked)** — 자동 ingest provenance를 같은 컬럼에 넣으면
  A/B 측정축이 오염된다 → **3D 별 차원으로 회피**.
- **99-evaluation-framework §6.4(자가편향)** — 1C/4C/5B는 경계. **3C(HITL 유지 +
  사람 소표본 B3)** 로 외부 신호를 확보해야 §6.4를 만족.
- **feedback-loop MVP §3·§5(HITL=apply, approved 없으면 쓰기 거부)** — **4A 정렬**,
  4C 경계.
- **feedback-loop 스킬 한계(환류 미구현·거절 학습 안 함)** — 5B가 미구현 영역을
  끌어오므로 정직성과 충돌.

## 열린 질문 (사람이 결정)

1. **자동화 깊이** — 1A / 1B / 1C 중 무엇인가. 1C는 §6.4·결정4 경계를 넘는데
   수용하나.
2. **트리거 단위** — 세션(2D) vs 커밋(2E). 커밋↔transcript 약한 고리를 어떻게 잇나.
   미ingest 신규 커밋의 큐잉 규칙(어떤 diff·어떤 SHA를 자동 선택하나)은 무엇인가.
3. **즉시성 포기 재확인** — ADR 0001 결정3을 ingest에도 상속하나, 아니면 ingest만
   즉시성을 가지나.
4. **자동 apply 허용 여부** — 4A 절대 유지 vs 4C 저위험 면제. §6.4 자가편향 루프를
   *어디서* 끊나.
5. **source 차원 분리** — ADR 0003 충돌 회피를 위해 별 컬럼을 두나. 둔다면 위치는
   어디인가(`ingest_bundle` vs `run`).
6. **노이즈 필터 기준** — 어떤 커밋/세션을 거르나(잡 커밋·머지·docs-only·diff 크기·
   경로 등).
7. **외부 신호 확보(§6.4)** — ADR 0003 B3(`scorer=human`) 소표본을 자동 플라이휠에
   어떻게 끼우나.

## 재사용 가능 자산 (신설 최소)

- `plugins/work-metric-scan.ts` — 자동 트리거의 검증된 패턴(setImmediate+setInterval/
  `unref()`/onClose). ADR 0001 결정3 주기 스캔의 SSOT.
- `usage/scan-work-metric.ts`·`usage/scan-usage.ts` — 전수 멱등 스캔(세션 단위,
  cwd→프로젝트 매핑).
- `feedback/service.ts:ingestFeedback` + MCP `ingest_cursor_session` — ingest 본체.
- `feedback/eval-queue.ts`·`feedback/review-queue.ts` — ingest→eval→review 자동 연쇄가
  이미 구현돼 있다.
- `feedback/proposal-service.ts:applyProposal` + `review-policy.ts:shouldAutoApply` —
  HITL 게이트·저위험 안전망.
- `feedback/commit-format.ts:assertCommitSubjectForIngest`·`diff.ts` — 노이즈 필터의
  토대.
- `run.source`/`aggregateBenchmark.bySource` — ADR 0003 D1 provenance 집계 골격(단,
  자동/수동은 **별 컬럼**으로).
- **신설 금지** — 새 스케줄러·새 러너·새 스코어러·`machine` enum. 자동 ingest는 트리거
  1겹 + (옵션) source 컬럼 1겹으로 족하다.

## 결정 (Decision Outcome)

수동 진입점(ingest 트리거)을 **새 스케줄러·새 러너 없이** 기존 자동 트리거 인프라
(`plugins/work-metric-scan.ts`)를 확장해 자동화하고, 이미 자동인 eval→review 연쇄까지
흐르게 한다. 이로써 "Cursor에서 작업하면 알아서 개선안 후보(draft)가 쌓이는" 플라이휠을
세우되, **쓰기(apply) 경계의 사람 승인(HITL)은 절대 유지**해 99-evaluation-framework
§6.4 자가편향 루프를 닫지 않는다. 결정포인트별 채택은 다음과 같다.

1. **자동화 깊이 = 1B(트리거+eval+proposal 생성까지 자동, review·apply는 현행 유지).**
   ingest 트리거를 자동화하면 이미 구현된 자동 연쇄(ingest → work-evaluator eval →
   draft proposal → proposal-reviewer review)가 그대로 흐른다 — "작업하면 개선안
   후보(draft)가 쌓인다"가 성립한다. 신설은 트리거 1겹에 근접한다(연쇄는 이미 코드에
   존재). 트레이드오프 — **트리거당 work-evaluator·reviewer run = LLM 비용**이 발생하고
   노이즈 draft가 누적되므로, 이를 3A(노이즈 필터)·3B(레이트 제한)로 방어한다. **1A
   (트리거만 자동)는 플라이휠 효과가 약해** 불채택, **1C(저위험 auto-apply)는 §6.4
   자가편향 루프가 닫히고 ADR 0001 결정4(수집/생성 분리·완전 자동 환류 범위 밖)와
   충돌**하므로 불채택했다.

2. **트리거 = 2A(주기 스캔) / 단위 = 2E(커밋).** 기존 `work-metric-scan` 의 검증된
   패턴(setImmediate 부팅 1회 + setInterval + `timer.unref()`)을 확장해 "미ingest 신규
   커밋"을 탐지·큐잉한다 — **새 스케줄러를 신설하지 않는다**(ADR 0002·0003 정렬). 단위는
   **커밋(2E)** 으로 둔다 — 현 ingest API(`gitRef`·`collectCommitDiff` diff 기반)와
   키가 정합한다. 미ingest 신규 커밋 큐잉 규칙은 **등록 프로젝트 clone의 git log에서
   `ingest_bundle`에 아직 없는 커밋의 차집합**을 후보로 삼는다 — ADR 0001 결정3의 직역
   (주기 스캔으로 누락 복원, 즉시성은 포기). **세션 단위(2D)는 diff 출처가 불명확**
   (세션→커밋 매핑이 약한 고리, ingest는 SHA를 요구)이라 불채택, **post-commit 훅(2B)·
   데몬 watch(2C)는 ADR 0001이 이미 비채택**(데몬 죽음·매핑 약함)한 경로라 채택하지
   않았다. 즉시성 포기는 ADR 0001 결정3을 ingest 진입에도 상속하는 의도된 결정이다.

3. **위험 방어 = 3A + 3B + 3C + 3D 동시.**
   - **3A 노이즈 필터** — `commit-format.ts:assertCommitSubjectForIngest` + diff 크기·
     경로 기준으로 잡 커밋·머지·docs-only를 ingest 후보에서 제외한다. 무의미 트리거를
     원천에서 막아 비용·노이즈를 줄인다(과하면 누락이 트레이드오프).
   - **3B 비용 레이트 제한** — 트리거당 1회·배치 상한으로 eval run 폭주를 차단한다.
     1B가 떠안는 LLM 비용의 1차 방어선이다(상한이 낮으면 백로그가 트레이드오프).
   - **3C 자가편향 차단(§6.4)** — 자동 apply를 금지(HITL 유지, 4A)해 "자동 ingest →
     같은 하네스 평가 → 자동 환류"로 루프를 닫지 않으며, **ADR 0003 B3(사람 소표본
     `scorer=human`)을 병행**해 §6.4의 "자가+외부 둘 다일 때만 비교"의 외부 신호를
     확보한다. 자동화가 자가편향을 *증폭*하지 않게 하는 핵심 안전장치다.
   - **3D source 차원 분리** — 자동/수동 ingest provenance를 ADR 0003 D1의
     `run.source`(asset|baked)와 **별개 컬럼**(예: `ingest_bundle.trigger` 또는
     `ingestTrigger` 차원)으로 둔다. 같은 컬럼에 끼얹으면 ADR 0003의 A/B(asset vs
     baked) 측정축이 오염되므로 차원을 분리한다(스키마 1겹 추가가 트레이드오프).

4. **HITL 게이트 = 4A(proposal→apply 경계 유지).** apply 직전 사람 승인을 필수로
   한다 — `approved` 전이가 없으면 `applyProposal`이 거부한다. feedback-loop MVP §3·§5
   불변식의 직역이며 `proposal-service.ts:applyProposal` 코드를 그대로 둔다. **자동
   ingest·eval로 쌓인 draft 노이즈는 사람이 apply 게이트에서 흡수**한다(자동화 효과는
   draft까지). **4C(저위험 면제)는 §6.4 자가편향 경계선**(=1C에 수렴)이라 불채택했다.

5. **스코프 = 5A(최소 — 트리거 자동화 1겹 + source 별 컬럼).** 자동 트리거 1겹
   (`work-metric-scan` 확장) + 자동/수동 provenance 1 컬럼만 신설한다 — **새 러너·새
   스코어러·`machine` enum은 신설하지 않는다**(ADR 0002·0003). ADR 0001~0003의 점진·
   "폐기 아닌 격하" 패턴과 정렬한다. **5B(풀 자동 환류 — 자동 apply + reviewer 거절
   학습)는 환류 미구현·§6.4·결정4와 정면 충돌**하고 미구현 머신 스코어러까지 끌어오므로
   이번 범위가 아니다. 졸업 판단 이후 점진적으로 검토한다.

## 결과 (Consequences)

### 긍정

- **수동 ingest 진입점이 제거**되어 플라이휠이 자동으로 돈다 — eval→review는 이미
  자동이므로 신설은 트리거 1겹 + provenance 1 컬럼으로 최소화된다.
- **ADR 0001 결정3(주기 스캔)·결정4(수집/생성 분리), feedback-loop MVP HITL 불변식,
  ADR 0003 측정축을 모두 보존**한다 — 자동화가 선례 경계를 넘지 않는다.
- §6.4 정책(자가+외부 둘 다일 때만 비교)을 **자동 apply 금지(4A) + 사람 소표본
  (ADR 0003 B3)** 으로 코드 차원에서 만족시킨다.
- 새 스케줄러·새 러너·새 스코어러 없이 **검증된 인프라(work-metric-scan 패턴)를
  재사용**한다 — ADR 0002·0003의 "새 러너 금지"·점진 패턴 유지.

### 부정 / 위험

- **트리거당 LLM 비용** — 트리거당 work-evaluator + proposal-reviewer = 2 run이
  유상이며 트리거가 늘면 비용이 선형 증가한다(3B 레이트 제한으로 완화).
- **draft 노이즈를 사람이 흡수** — 자동 ingest·eval로 쌓인 draft 노이즈를 사람이
  apply 게이트(4A)에서 걸러야 한다 — 자동화 효과가 draft까지로 제한된다.
- **즉시성 포기** — 주기 스캔(2A)이라 커밋 직후 즉시 트리거되지 않는다(ADR 0001 결정3
  상속, 의도된 트레이드오프).
- **커밋↔transcript 약한 고리** — transcript JSONL은 `gitBranch`만 갖고 SHA 직결이
  미확인이라, 커밋 단위(2E) 채택으로 우회하나 **transcript 연계는 발췌 수준에 머문다.**
- **§6.4 자가편향** — 자동 ingest→같은 하네스 평가→자동 환류로 루프가 닫히면 자가편향이
  누적된다. 본 결정은 **자동 apply를 막아(4A) 자가 루프를 끊고, 사람 소표본(ADR 0003
  B3)으로 외부 신호를 대는 것**을 자동화가 자가편향을 증폭하지 않게 하는 핵심 안전장치로
  둔다.

### ADR 0001·0002·0003과의 관계

- **ADR 0001 결정3(주기 스캔·post-commit 비채택)** — **2A로 정렬**하고 2B/2C를 따르지
  않으며, 즉시성 포기를 ingest 진입에도 상속한다.
- **ADR 0001 결정4(수집/생성 분리·완전 자동 환류 범위 밖)** — **1B/5A로 정렬**하고
  1C/5B(자동 apply·풀 자동 환류)를 미룬다.
- **ADR 0002·0003(새 러너·새 스코어러 금지, 점진 격하)** — 기존 자산(work-metric-scan)
  재사용으로 정렬하고, 새 스케줄러/스코어러 신설을 하지 않는다.
- **ADR 0003 D1 source(asset|baked)** — 자동/수동 ingest provenance를 **별 컬럼(3D)** 으로
  분리해 ADR 0003의 A/B 측정축 오염을 회피한다. ADR 0003 B3(`scorer=human` 소표본)을
  자동 플라이휠의 외부 신호로 재사용한다(3C).

## 후속 작업 (Follow-ups)

1. **자동 트리거(2A·2E)** — `work-metric-scan` 플러그인에 "미ingest 신규 커밋" 탐지·
   큐잉을 추가한다(등록 프로젝트 clone git log ↔ `ingest_bundle` 차집합). 자동 트리거가
   `feedback/service.ts:ingestFeedback`을 재사용한다.
2. **노이즈 필터(3A)** — `assertCommitSubjectForIngest` + diff 크기·경로 기준으로
   ingest 후보 게이트를 둔다(잡 커밋·머지·docs-only 제외).
3. **비용 레이트 제한(3B)** — 트리거당 1회·배치 상한으로 eval run 폭주를 차단한다.
4. **source 차원 분리(3D)** — ingest provenance(auto|manual) 컬럼을 신설한다
   (`run.source` asset|baked와 **별개**). 위치는 `ingest_bundle` 우선 검토.
5. **외부 신호(§6.4·3C)** — ADR 0003 B3(`scorer=human` 소표본)을 자동 플라이휠에
   주기적으로 끼우는 경로를 만든다.
6. **점진(1C/5B)** — 자동 apply·reviewer 거절 학습 환류는 졸업 판단 이후 점진적으로
   검토한다(이번 범위 아님).
