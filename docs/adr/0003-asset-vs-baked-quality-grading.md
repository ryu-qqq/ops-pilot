# 0003. 평가 설계 산출의 A/B 품질 측정 방법 — 자산 vs baked 산출의 grade

- 상태: Accepted
- 날짜: 2026-06-02

## 맥락 (Context)

ADR 0002로 평가 **"설계(생성)"** 로직을 agent-crew 자산 호출(1B 본문 주입)로 전환하고,
실패 시 baked 프롬프트로 fallback(4B)하기로 정했다. 산출 메타에 `meta.source`를 두어
`asset`(자산 경로)인지 `baked`(fallback)인지 식별하고, TASK-47로 그 **비율**(asset vs
baked)을 로그에 쌓는 관측성을 붙였다.

그런데 ADR 0002의 결정4·결과는 **"자산 산출 vs baked의 A/B 비교로 자가편향을 외부
검증한다(99-evaluation-framework §6.4)"** 를 못박았으나, 그 *측정 방법* 자체는 TBD로
열어두었다. 지금 측정되는 것은 **source 비율뿐**이고, "asset 산출이 baked보다 *품질*이
좋은가"는 **빈 곳**이다. 비율만으로는 fallback이 줄었다는 것만 알 뿐, 자산 경로가
*더 나은 입력*을 만드는지를 판정할 수 없다 — 졸업조건(무fallback 안정 산출 → baked
데드코드 제거) 판단과 자가편향 방어의 핵심 신호가 비어 있다.

핵심 질문: **`source=='asset'` 산출 vs `source=='baked'` 산출의 *품질*을 무엇으로·
어떻게 점수화해 비교할 것인가(§6.4 자가편향 외부검증의 정식화).**

활용 가능한 기존 자산(코드 확인):

- **`score/llm-grade.ts` `gradeAssertions`** — assertions를 LLM이 PASS/FAIL +
  표면준수 + critique로 채점(`scorer=llm_judge`). 다운스트림 채점 골격.
- **`score/auto-evaluate.ts`** — `scorer=assertion`(트레이스 substring 매칭). 결정적
  이나 약함.
- **`assist/judge-runs.ts` `judgeRuns`** — 같은 `asset_version × scenario`의 N run을
  LLM이 best/fine/worse로 **상대 비교**(`winnerRunId`, best=1.0/fine=0.5/worse=0.0).
  A/B 상대채점에 가장 가깝다 — 단 입력 가정이 "같은 자산의 N 버전"이라 비교축을
  "asset vs baked 산출"로 바꾸는 의미 변경이 필요하다.
- **`run/benchmark.ts` `aggregateBenchmark`** — passRate·assertion·judge의
  mean/stdDev/min/max 분포 집계. 분포·시점 보정 골격.
- **`compare_runs`(MCP)** — run 비교 뷰.
- **Scorer enum = `[schema, assertion, llm_judge, human]`. `machine`은 미구현.**

선행 공백(코드 확인): 현재 `meta.source`는 **로그 전용·DB 미영속**이다.
`TriggerDesignMeta{source, fallbackReason, formatDrift}`·`SourceCounts{asset,baked}`·
`SuggestScenarioMeta{source, fallbackReason}`가 있으나, routes는 meta를 `fastify.log`로만
흘리고 `sourceCounts`는 `ImproveResult`에 미포함이다. 즉 **source가 `score`/`run`
테이블에 없다.** A/B를 사후 집계하려면 source 영속화가 선행되어야 한다.

이 ADR은 위 비교의 *결정·근거*까지를 다룬다. Decision Outcome·Consequences는 사람의
결정(Accepted) 후 채운다 — 지금은 TBD(ADR 0002 초안과 동일한 방식).

## 결정 동인 (Decision Drivers)

- **결정성·재현성** — 99-evaluation-framework §3 차원7은 "결정적 verifier 우선,
  LLM-judge 차선"을 둔다. ADR 0002의 측정 불변 원칙과도 정렬한다. 채점 자체가
  비결정적이면 A/B 비교 신호가 오염된다.
- **자가편향(§6.4)** — 같은 하네스가 만든 입력을 같은 계열 LLM이 채점하면 편향이
  중첩된다. §6.4는 단순 가산 부정·양방향 편향·"자가와 외부 둘 다일 때만 신뢰"·
  누적분포·시점 보정을 요구한다. 채점 방법이 이 경고를 흡수해야 한다.
- **portability** — 99-evaluation-framework §4.1.b/§6.5의 "rubric=보편, 자동실행=
  Claude Code 종속" 분리. 다운스트림 실행 채점은 Claude Code 종속을 키운다 — 정직히
  떠안을지, portable 채점 비중을 늘릴지가 갈린다.
- **스코프 함정** — Scorer enum의 `machine`은 미구현이다. 새 머신 스코어러를 신설하면
  ADR 0002의 **"새 러너 금지"·"폐기 아닌 격하"** 패턴과 충돌할 소지가 있다.
- **다운스트림 변별력** — 40-benchmarks(SWE-bench·Tau-bench Pass^k·GAIA)는 결정
  신호의 최고점을 "다운스트림 실행 결과"에 둔다. 설계 산출의 품질을 그 산출이 만든
  다운스트림 결과로 측정하면 변별력이 가장 높다.

## 검토한 옵션 (Considered Options)

결정포인트별로 대안을 나눈다. 권고 후보는 "(연구 권고: …)"로 표기하되,
**최종 채택은 Decision Outcome에서 사람이 정한다(현재 TBD)**.

### A. 무엇으로 점수화 — 품질의 측정 신호

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A1 LLM-judge 직접** | `gradeAssertions`/`judgeRuns`로 asset vs baked 산출을 LLM이 직접 채점 | 즉시 가능, 기존 자산 그대로 | 비결정(차원7=0점 자인), 자가편향 중첩 |
| **A2 다운스트림 변별력** | 산출을 실제로 써본 결과로 채점 — 생성 시나리오→실행→assertion·judge 갈림, 생성 쿼리→probe 정확도, 개선 desc→bestTestAccuracy(이미 산출) | 결정적, 인프라 이미 존재, 편향 약함 | 시나리오 ground truth 부재, run 비용 |
| **A3 사람** | 사람이 두 산출을 직접 비교·채점 | 외부 신호·신뢰 | 표본 적음·느림, 환류 미구현 |
| **A4 혼합(우아한 A1식)** | LLM judge 라벨 → 결정적 보정(우아한형제들 A1 패턴) | 균형 | 복잡 |

축: 결정성 ↔ 즉시성 ↔ 편향. (연구 권고: **A2 우세 + A4식**으로 A1을 A3 소표본
검증. A1 단독은 차원7=0점·편향 중첩이라 §6.4 위반.)

### B. 자가편향 방어 — 편향을 어디서 끊나

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **B1 결정적 verifier로 끊기** | 채점 신호를 결정적 다운스트림 결과로 → §6.4·차원7 정렬, 편향 원천 차단 | 원천 차단, 차원7 정렬 | A2에 종속, 시나리오 설계 품질엔 직접 verifier 없음 |
| **B2 다른 모델 judge** | 산출 모델과 다른 모델로 채점 | 자기 호의 일부 차단 | 여전히 LLM이라 양방향 편향 잔존 |
| **B3 사람 표본 둘 다(§6.4)** | 자가 + 외부(사람) 둘 다일 때만 신뢰(§6.4 그대로) | §6.4 직역, 안전 | 수집 부담·커버리지 |
| **B4 누적분포·시점 보정** | 분포·시점으로 보정(§6.4 직접·직교) | §6.4 직접, 다른 축과 직교 | 보정일 뿐 원천을 안 끊음 |

(연구 권고: **B1 + B4 핵심, B3 병행, B2 단독 경계**. 결정적 차단을 핵심으로,
분포 보정을 직교로 얹고, 사람 표본을 병행. 다른 모델 judge 단독은 경계.)

### C. 인프라 위치 — 채점을 어디에 둘 것인가

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **C1 machine 스코어러 신설** | Scorer enum `machine` 구현·신설 | 자산화·확장성 | 스코프 함정, ADR 0002 "새 러너 금지" 충돌 |
| **C2 judge-runs 재사용(의미축 변경)** | `judgeRuns`의 비교축을 "asset vs baked 산출"로 변경 재사용 | 검증된 코드·최소 신설 | 호출부 영향, LLM이라 B 방어 필요 |
| **C3 compare 골격 확장(source 차원)** | `aggregateBenchmark`·`compare_runs`에 source 차원 추가 | 통계·뷰 재사용, B4 자연스러움 | source 영속화 선행 |
| **C4 다운스트림 재사용(신설 0)** | 기존 다운스트림 채점(assertion·judge·bestTestAccuracy)을 그대로 source별로 집계 | ADR 0002 측정 불변 정렬, portability 최소 변동 | source 영속 필요, 간접 |

(연구 권고: **C4 + C3, C1 신중**. 신설 0의 다운스트림 재사용을 기본으로, source
차원을 compare 골격에 얹는다. machine 신설은 ADR 0002 충돌이라 신중. **선행 =
source DB 영속화.**)

### D. 스코프 — 어디까지 만들 것인가

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **D1 최소 측정부터** | 소표본 A/B + 사람 확인 | 점진·격하 패턴 정렬, 졸업조건 판단에 충분 | 통계력 약 |
| **D2 자동 스코어러 풀구현** | 완전 자동·멀티 확장 | 완전 자동·확장 | 대규모 신설, 환류까지 끌림 |

(연구 권고: **D1 시작 → 점진 D2**. ADR 0002의 "폐기 아닌 격하"·점진 전환과 정렬.
졸업조건 판단에는 소표본 A/B + 사람 확인으로 충분.)

## 선례 정합·충돌

- **§6.4(자가편향)** — **B3 + B4와 정렬**. A1 단독은 §6.4 위반(자가 단독 신뢰).
- **§3 차원7(결정적 우선)** — **A2/B1과 정렬**. A1은 비결정으로 차원7=0점을 자인.
- **§4.1.b/§6.5(portability)** — **A2/C4는 Claude Code 종속을 상속**(정직 표기 필요).
- **40-benchmarks(다운스트림 결정 신호)** — **A2 지지**.
- **우아한형제들 A1 패턴** — **A4의 원전**(judge 라벨 → 결정적 보정).
- **ADR 0001/0002** — **C1·D2는 충돌 소지**(새 러너 신설·풀구현이 "격하·새 러너 금지"
  와 부딪힘), **C4/D1은 정렬**(측정 불변·점진).
- **machine 미구현** — **C1·D2는 스코프 함정**(미구현 enum 신설·풀구현이 비대화).

## 열린 질문 (사람이 결정)

1. **품질의 정의** — 다운스트림 변별력(A2) vs LLM judge(A1) vs 사람(A3) 중 무엇을
   "품질"의 일차 정의로 삼나. 특히 **시나리오 설계 품질**은 ground truth가 없는데,
   다운스트림 실행 결과를 그 대용으로 받아들일 것인가.
2. **편향 끊는 강도** — B1(결정적 차단) / B3(사람 표본) / B4(분포 보정) 중 어디까지
   강제하나. §6.4의 "자가+외부 둘 다일 때만 신뢰"를 어느 수준에서 만족시키나.
3. **source 영속화 범위(선행 과제)** — `score`/`run` 테이블에 source를 어떻게
   영속화하나(스키마). C·D의 선행 조건이다. 어느 테이블·어느 컬럼까지 확장하나.
4. **스코프** — D1(최소) vs D2(풀구현). **Scorer enum에 `machine`을 추가**하나
   (C1), 아니면 기존 스코어러 재사용(C4)으로 신설 0을 지키나.
5. **portability 수용** — 다운스트림 실행 채점(A2/C4)으로 Claude Code 종속을 키울지
   vs portable 채점 비중을 늘릴지. §6.5의 정직 표기 수준을 어디에 둘지.

## 재사용 가능 자산 (명시)

- `score/llm-grade.ts` — `gradeAssertions`(assertions LLM 채점, `scorer=llm_judge`).
- `assist/judge-runs.ts` — `judgeRuns`(N run 상대 비교, best/fine/worse → 1.0/0.5/0.0).
- `run/benchmark.ts` — `aggregateBenchmark`(분포 집계 mean/stdDev/min/max).
- `compare_runs`(MCP) — run 비교 뷰.
- Scorer enum = `[schema, assertion, llm_judge, human]`, **`machine` 미구현**.

## 결정 (Decision Outcome)

`source=='asset'` 산출 vs `source=='baked'` 산출의 **품질**을 새 러너·새 스코어러
없이 **기존 다운스트림 측정을 source별로 재사용**해 비교한다. 이로써 ADR 0002 결정4의
"자산 vs baked A/B 외부검증(99-evaluation-framework §6.4)"의 *측정 방법*을 정식화한다.
결정포인트별 채택은 다음과 같다.

1. **측정 대상 = A2(다운스트림 변별력).** 자산 산출과 baked 산출을 *실제 측정에
   투입*해 품질을 비교한다 — 생성 시나리오를 실행해 assertion/judge가 PASS/FAIL로
   갈리는 정도, 생성 트리거 쿼리의 probe 정확도, 개선 description의 `bestTestAccuracy`
   (이미 산출됨)를 source별로 본다. 다운스트림 실행 결과는 40-benchmarks가 결정 신호의
   최고점으로 두는 신호이고(차원7·결정성 정렬), probe·run·auto-evaluate·llm-grade의
   측정 인프라가 이미 존재한다는 점을 우선했다. 트레이드오프 — **시나리오 "설계
   품질" 자체는 직접 ground truth가 없어 다운스트림 결과로 *간접* 측정**되며, 이
   한계는 B(사람 소표본)로 보완한다. A1(LLM-judge 직접 단독)은 차원7=0점(비결정)·
   자가편향 중첩으로 §6.4 위반이라 일차 정의로 채택하지 않았다.

2. **자가편향 방어 = B1 + B4 + B3 혼합(B2 단독 불채택).**
   - **B1(결정적 verifier로 끊기)** 으로 grade 신호의 핵심을 LLM 의견이 아닌 실행
     결과로 끊는다 — 편향을 원천에서 차단한다(§6.4·차원7).
   - **B4(누적분포·시점 보정)** 로 source별 점수를 **단순 가산하지 않고** 누적분포로
     정규화하며 측정 시점을 함께 기록한다(§6.4 보정 정책 직역).
   - **B3(사람 소표본 병행)** 으로 "자가·외부 둘 다 있을 때만 비교"(§6.4)를 만족시켜,
     LLM judge를 쓰는 영역(A의 간접 측정 부분)의 외부 검증을 댄다.
   - **B2(다른 모델 judge) 단독은 불채택** — §6.4의 양방향 편향 실측 경고대로, 다른
     모델이어도 LLM이면 편향이 잔존하므로 단독 방어선으로 신뢰하지 않는다.

3. **인프라 위치 = C4 + C3 재사용(C1 신설 불채택).** 새 측정 러너·새 스코어러를
   만들지 않고(ADR 0002 "새 러너 금지"·측정 불변 정렬) 기존 다운스트림 측정(probe·
   run·auto-evaluate·llm-grade)에 **source 라벨을 동반**(C4)하고, `aggregateBenchmark`·
   `compare_runs` 골격에 **source 차원을 더해** source별 분포를 비교한다(C3 — B4의
   누적분포가 여기서 자연스럽게 구현된다). **C1(Scorer enum `machine` 신설)은 스코프
   함정·ADR 0002 충돌로 불채택.** **선행 과제 명시** — 현재 `meta.source`는 로그
   전용·DB 미영속이므로, A/B를 사후 집계하려면 **source를 score/run 측정 시점에
   영속화**하는 것이 C·D의 선결 조건이다(Follow-ups 최상단).

4. **스코프 = D1(최소 측정부터).** 같은 입력으로 asset·baked 둘 다 산출한 소표본
   A/B(다운스트림 1축 + 사람 확인)로 시작한다. ADR 0001·0002의 점진·"폐기 아닌 격하"
   패턴과 정렬한다. 이 최소 측정이 **ADR 0002 fallback 졸업조건(무fallback 안정 산출
   확인)** 판단의 데이터 기반이 된다. **D2(자동 스코어러 풀구현·`machine` enum 추가·
   사람 점수 환류)는 졸업조건 판단 이후 점진**하며, 이번 범위가 아니다.

## 결과 (Consequences)

### 긍정

- ADR 0002 결정4 **"A/B 외부검증으로 자가편향 방어"의 *측정 방법*이 구체화**된다 —
  무엇으로(A2 다운스트림), 어떻게 편향을 끊고(B1+B4+B3), 어디에 두는지(C4+C3)가
  정해져 §6.4가 코드 수준으로 정식화된다.
- **새 러너·새 스코어러 없이 기존 측정을 재사용**한다 — ADR 0001·0002의 측정 불변
  원칙을 유지하고, portability 변동을 최소화한다.
- §6.4 정책(자가+외부 둘 다일 때만 비교·단순 가산 금지·누적분포·시점 기록)과
  코드 차원에서 정렬한다.
- 최소 측정이 ADR 0002 **fallback 졸업조건 판단의 데이터 근거**를 제공한다.

### 부정 / 위험

- **source DB 영속화 선행 부담** — `meta.source`가 로그 전용·DB 미영속이라, A/B
  사후 집계 전에 source를 score/run에 영속화해야 한다(Follow-ups 최상단).
- **시나리오 설계 품질의 간접 측정 한계** — 시나리오 "설계 품질"은 직접 ground
  truth가 없어 다운스트림 결과로 간접 측정된다. B3(사람 소표본)으로 보완하나 완전한
  대체는 아니다.
- **Claude Code 종속 상속** — 다운스트림 측정(probe·run)이 Claude Code에 종속되므로
  A/B 측정도 그 종속을 상속한다(ADR 0002와 동일하게 정직히 표기).
- **소표본 통계력 약함** — D1 최소 측정의 한계이며, 졸업조건 판단 후 D2로 점진한다.

### ADR 0001·0002와의 관계

- **측정 불변·점진·"폐기 아닌 격하" 패턴을 차용**한다(0001·0002 정렬). C1·D2를
  미루는 근거가 이 패턴이다.
- **ADR 0002 결정4(A/B 외부검증)를 정식화**한다 — 0002가 TBD로 열어둔 *측정 방법*을
  본 ADR이 채운다. 본 ADR의 최소 A/B 측정은 0002의 fallback 졸업조건 판단으로 환류된다.

## 후속 작업 (Follow-ups)

> **구현 상태(2026-06-03)**: #1~#3 구현 완료. #1 source DB 영속화(D1, merge `e817b78`) —
> `scenario.source`→`run.source` 상속 + `aggregateBenchmark.bySource`. #2 A/B 파이프라인
> (merge `6a3003f`/`3f0f429`) — `POST /assist/scenario-ab`(asset·baked 강제 산출) +
> `/assist/scenario-ab-run`(생성→둘 다 실행→비교 자동 오케스트레이션). #3 사람 소표본
> (merge `c5574ed`) — bySource에 human(외부 신호)·humanSampleCount + §6.4 신뢰 게이트
> (자가+외부 둘 다일 때만 "외부 검증됨", 아니면 "비교 신뢰 보류"). **#4(D2·졸업조건)은
> 미착수** — local-claude로 실제 A/B 데이터를 쌓아 asset>baked가 확인돼야 ADR 0002 fallback
> 졸업(baked 데드코드 제거) 판단 가능(데이터·운영 의존, 코드 아님).

1. **선행: source DB 영속화** ✅ — `meta.source`를 로그 전용에서 `score`/`run` 테이블로
   영속화(`TriggerDesignMeta.source`·`SuggestScenarioMeta.source`를 측정 시점에 기록).
   C·D 옵션의 선결 조건이다(열린 질문 3).
2. **소표본 A/B 측정 파이프라인(C4 + C3)** ✅ — 같은 입력으로 asset·baked 둘 다 산출 →
   다운스트림 측정을 source별로 집계. `aggregateBenchmark`·`compare_runs`에 source
   차원을 추가(B4 누적분포 자연 구현).
3. **사람 소표본 채점 경로(B3)** ✅ — `scorer=human` 병행으로 자가+외부 둘 다 있는
   비교를 성립시킨다(§6.4).
4. **졸업조건 판단 후 D2 검토** — 자동 스코어러 풀구현·`machine` enum 추가·사람 점수
   환류는 ADR 0002 fallback 졸업조건 판단 이후 점진적으로 검토한다(이번 범위 아님).
