# Asset Quality Rubric — 8차원 × 1~5점

agent-crew 자산(agents·skills·references·cursor rules·hooks)의 **구조 품질** 채점표. agent-evaluator가 이 rubric을 실행한다.

- **근거**: [ryu-qqq-wiki/wiki/research/agent-engineering/99-evaluation-framework.md](https://github.com/ryu-qqq/ryu-qqq-wiki/blob/main/wiki/research/agent-engineering/99-evaluation-framework.md) — 모든 채점 항목의 *왜*는 여기로 추적
- **버전**: v1.0 (2026-05-27, 99번 정정 6건 반영)

---

## ⚠️ 먼저 — rubric의 한계

이 rubric은 **"하한선 보장 도구"**이지 **"품질 종합 점수"**가 아니다.

- 점수 낮음 = *"이건 확실히 문제 있음"* (참)
- 점수 높음 = *"기본은 갖췄음"* (실효는 별개)

evaluator가 **못하는 것**: 자산의 실제 효용 · 실측 토큰량 · 런타임 conflict · 도메인 정합성. → **사람 검토와 결합**해야 의미.

---

## 8차원 정의 (요약)

| # | 차원 | 한 줄 정의 |
|---|---|---|
| 1 | Context Efficiency | LLM 기본지식 X + 위치·캐시·격리 친화 |
| 2 | Activation Scope | 언제·어디서 활성화되는가 명시적인가 |
| 3 | Invocation Guarantee | 실제 호출 보장 강도 (Level 1~3) |
| 4 | Determinism | 같은 입력 같은 출력 보장 + verifier |
| 5 | Portability | 프로젝트·스택·IDE 종속 깨졌나 |
| 6 | Composability | 다른 자산과 안전한 조합 (역할·종료·격리) |
| 7 | Verifiability | ops-pilot이 결정적 채점 가능한가 |
| 8 | Asset Type Fitness | 올바른 자산 유형으로 만들어졌나 |

상세 정의·근거: 99번 §2.

---

## 자산 유형 매트릭스 (먼저 분류!)

| 자산 유형 | 위치 | 차원 2 적용 | 차원 3 책임 | 차원 6 (c) 책임 |
|---|---|---|---|---|
| Cursor rule (`.mdc`) | 소비 프로젝트 | `globs`·`alwaysApply` 직접 | 호출자 | 호출자 가이드 |
| Claude Code agent (`agents/*.md`) | agent-crew | description 트리거로 대체 | 피호출자 | description 힌트 |
| Claude Code skill (`skills/<n>/SKILL.md`) | agent-crew | description progressive로 대체 | 피호출자 | description 힌트 |
| CLAUDE.md (소비 프로젝트) | 소비 프로젝트 | "항상 로드" = alwaysApply | 호출자 (Level 2) | 호출자 가이드 |
| references/conventions/ | agent-crew | "조건부 참조" 명시 | 피호출자 | description 없음 |
| Hook (settings.json) | 소비 프로젝트 | 이벤트 조건 자체 | 호출자 (Level 3) | N/A |

→ 채점 시 자산 유형 먼저 → 매트릭스 해당 행만으로 채점. 적용 불가 항목은 `—` (감점 X).

---

## 차원별 채점

### [1] Context Efficiency — 1~5점

- (a) LLM 기본지식 중복 없음 (LLM이 아는 것은 빼라)
- (b) 중요 정보 시작·끝 위치 (Lost in the Middle)
- (c) 1024+ 토큰 안정 prefix (prompt caching 친화)
- (d) sub-agent 위임 권장 명시 (해당 자산 유형에 한해)

척도: 5(전부 충족) / 4(1~2 누락) / 3(절반) / 2(일부) / 1(거의 미충족)

### [2] Activation Scope — 1~5점

자산 유형 매트릭스 따라:
- Cursor rule: `globs`·`alwaysApply` 명시
- Claude Code agent/skill: description 트리거 키워드 정확도
- references: "조건부 참조" 명시

### [3] Invocation Guarantee — 1~5점

**자산 분류 먼저** — 호출자 vs 피호출자.

**호출자 Level 채점**:
- Level 1 (권고만) → 1점
- Level 2 (always-injected MUST) → 3점
- Level 2.5 (Level 2 + 부분 hook) → 4점
- Level 3 (PreToolUse hook 완전 차단) → 5점

**피호출자 채점**:
- 호출자가 Level 2+ 보장 + description 트리거 정확 → 5점
- 호출자 Level 1 + description 정확 → 3점
- 둘 다 약함 → 1~2점

### [4] Determinism — 1~5점

**Step 1 — 자산 분류**:
- LLM 호출 0회 (순수 스크립트) → **5점 자동**
- LLM 호출 + temp=0 + 외부 의존 X → **5점 자동**
- LLM 호출 + temp>0, 또는 외부 API → **Step 2로**

**Step 2A — 정성 (사람·LLM 공통)**:
- 비결정 단계 명시 / 결정성 강화 설계 / LLM-as-Judge 대체

**Step 2B — 정량 (LLM evaluator만)**: Pass^3 통과율
- 5: 100% / 4: 90%+ / 3: 70-89% / 2: 50-69% / 1: <50%

**⚠️ 결정적 자산은 Pass^k 돌리지 말 것** (토큰 낭비).

### [5] Portability — 1~5점

- (a) 절대경로·프로젝트명·도메인 수치 하드코딩 없음
- (b) 다중 IDE 호환 (Claude Code · Cursor · MCP)
- (c) project.yaml 의존만 명시
- (d) 스택 특화는 references/<stack>/ 팩으로

### [6] Composability — 1~5점

- (a) 역할(role) 명시 (이 자산이 무엇을 하고 무엇을 안 하나)
- (b) 종료조건(termination criteria) 명시
- (c) 격리 컨텍스트:
  - 호출자: sub-agent 위임 가이드 명시
  - 피호출자: description에 "isolated 호출 권장" 힌트
- (d) Decision avoidance 회피 (결정 강제 문구)

### [7] Verifiability — 0/2/3/4/5점

verifier 부재 강도별:
- **0** (Hard zero): verifier·schema·매니페스트 모두 없음
- **2**: 부분 — schema·포맷은 있으나 정합·정답 검증 없음
- **3**: executable verifier 일부 (파일 존재·grep 등)
- **4**: schema validation + 부분 정답 매칭
- **5**: 결정적 정답 검증 (테스트 통과·정확 매칭)

**차원 7 = 0점이면 영역 무관하게 "재평가" 이상으로 종합 강등.**

### [8] Asset Type Fitness — 1~5점

- (a) 자산 유형 선택이 역할에 맞음
- (b) 다른 유형 자산과 역할 중복 없음
- (c) description이 트리거 키워드 충분히 포함
- (d) 유형의 표준 컨벤션 준수 (frontmatter 등)

---

## 종합 점수 임계값

| 점수 영역 | verdict | 처리 |
|---|---|---|
| **32~40 (80%+)** | `release-pass` | release 통과 |
| **24~31 (60~79%)** | `improve-recommended-release` | release 가능, 개선 포인트 본문 기록 |
| **16~23 (40~59%)** | `reevaluate-required` | release 보류, 개선안 작성 |
| **<16 (40% 미만)** | `redesign-recommended` | 자산 재설계 |

**차원 7 = 0점**이면 점수 무관 `reevaluate-required` 이상으로 강등.

## 자가 호의 보정 — 단순 가산식 X (v0.9.1)

자가검증 점수와 외부 검증 점수 차이는 **양방향**으로 발생한다:

- 자가 *과대* — 자기 자산에 후하게 (가설)
- 자가 *과소* — 작성 직후 신중함이 점수 낮춤 (context-preprocessor v0.9.0 실측)

→ **agent-evaluator의 verdict 산출에 자가 점수 단순 가산 적용 X**. 자가·외부 점수가 모두 있을 때만 비교 활용. 후속 누적 데이터로 자산 유형별·시점별 분포 분석 → 보정 계수 도출 후 도입 검토.

근거: [ryu-qqq-wiki/wiki/research/agent-engineering/99-evaluation-framework.md §6.4](https://github.com/ryu-qqq/ryu-qqq-wiki/blob/main/wiki/research/agent-engineering/99-evaluation-framework.md)

---

## 사용

agent-evaluator 자산이 이 rubric을 실행. 직접 호출 예:

```
/agent-evaluator agents/work-evaluator.md
```

결과: JSON (agents/agent-evaluator.md "출력 JSON 스키마" 참조).

## 변경 이력

- v1.0 (2026-05-27) — 신설. 99번 정정 6건 반영 + work-evaluator dogfooding 결과 통합.
