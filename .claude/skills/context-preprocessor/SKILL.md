---
name: context-preprocessor
description: 무거운 코드 탐색·메타데이터 추출을 전처리 단계로 분리. agent가 LLM 컨텍스트에 원본 코드를 통째로 넣지 않고, 정제된 JSON 메타데이터만 받게 한다. 우아한형제들 하네스 엔지니어링 글의 96.5% 토큰 절감 패턴 직접 구현. feedback-loop·work-evaluator·proposal-reviewer 같은 무거운 탐색 자산이 호출. 입력 = 추출 의도 + 대상 디렉토리, 출력 = 스택별 메타데이터 JSON.
---

# Context Preprocessor Skill

> agent-crew 공유 자산. 프로젝트 고유 값은 `.claude/project.yaml`에서 읽는다.

## 작업 전 — 프로젝트 설정 로드 (필수)

`.claude/project.yaml`을 Read하여:

- `project.stack` — 어떤 references/<stack>/preprocessor/ 가이드를 쓸지 결정 (예: `java-spring`)
- `project.name` — 출력 JSON에 프로젝트 식별자 포함
- 스택 미설정·해당 팩 없으면 **스택 무관 fallback** (정규식 기반 일반 추출)

## 동기 — 왜 이 skill이 필요한가

agent(특히 평가·리뷰·feedback-loop)가 코드베이스를 *자율 탐색*하면:
- import·logger·에러처리·헬퍼 같은 *목적 무관* 코드가 컨텍스트에 들어감
- 환각·tool call 과다·응답 지연·토큰 비용 모두 증가
- Anthropic Context Engineering 원칙 1·3 위반 (right tokens · verifiable artifacts)

우아한형제들 *하네스 엔지니어링* 글의 측정: 자율 탐색 → 전처리 스크립트 패턴 변경 시 **5개 도메인 평균 96.5% 데이터 절감 (1회당 ~6,800 토큰)**.

→ 이 skill이 그 패턴을 agent-crew 자산으로 구현. 호출자 agent가 코드를 직접 읽지 않고 *"이 도메인의 API 훅 메타데이터 줘"* 같은 의도를 넘기면, skill이 스택 가이드 따라 메타데이터만 추출.

## 실행 패턴

### AS-IS (이 skill 없을 때)

```
agent 요청 → Read·Glob·Grep으로 자율 탐색 (반복 tool call)
            → import 문·내부 로직·헬퍼까지 컨텍스트
            → LLM이 무관 코드까지 보며 환각 위험
```

### TO-BE (이 skill 사용)

```
agent 요청 → context-preprocessor 호출 (의도 + 디렉토리)
            → skill이 references/<stack>/preprocessor/ 가이드 적용
            → 정제 JSON 메타데이터만 반환
            → agent는 메타데이터로만 작업
```

## 입력 명세

```yaml
intent: "api-endpoints" | "domain-classes" | "test-patterns" | "custom"
target:
  directory: "src/main/java/..."   # 또는 glob
  scope: "single-module" | "full-repo"
extractFields:                      # custom 시 명시
  - className
  - methods
  - annotations
```

**기본 intent** (스택별 references/preprocessor 가이드 참조):

| intent | java-spring 예시 출력 |
|---|---|
| `api-endpoints` | `[{method, path, controller, dto}]` |
| `domain-classes` | `[{className, fields, methods, annotations}]` |
| `test-patterns` | `[{testClass, targetClass, fixtureType}]` |

## 출력 명세

```json
{
  "intent": "api-endpoints",
  "stack": "java-spring",
  "scope": {
    "directory": "src/main/java/com/example/order",
    "filesScanned": 24
  },
  "extracted": [
    {
      "endpoint": "POST /orders",
      "controller": "OrderController.createOrder",
      "requestDto": "OrderCreateRequest",
      "responseDto": "OrderResponse"
    }
  ],
  "metadata": {
    "rubricVersion": "v1.0",
    "preprocessorVersion": "v0.9.0",
    "skipReason": null
  }
}
```

크기 비교: 원본 파일들 (~42KB) → 정제 JSON (~1.8KB). 우아한 측정 96.5% 절감과 정합.

## 절차

1. **설정 로드** — `project.yaml`에서 stack 결정
2. **스택 가이드 Read** — `references/{stack}/preprocessor/{intent}.md` (없으면 fallback)
3. **추출 실행** — 가이드가 명시한 Grep/Glob 패턴, 정규식, AST 추출 규칙 적용
4. **JSON 조립** — 위 출력 명세
5. **반환** — 호출자에게 JSON. 원본 파일 내용은 *결코* 반환하지 않는다 (skill의 핵심 가치)

## 스택별 가이드 위치

```
references/<stack>/preprocessor/
├── api-endpoints.md      # 의도별 추출 가이드 (정규식·Grep 패턴)
├── domain-classes.md
├── test-patterns.md
└── _fallback.md          # 의도가 매칭되지 않을 때
```

스택 가이드가 없으면 본 skill은:
1. 디렉토리 구조 + 파일명·확장자 + 주석 첫 줄만 추출 (스택 무관)
2. `metadata.skipReason: "stack pack not found, using generic fallback"` 명시

## 호출자 가이드 (다른 자산이 이 skill을 부를 때)

### feedback-loop / work-evaluator

작업 대상 코드를 *전체 Read* 하기 전:
```
1. context-preprocessor 호출 (intent: 작업 도메인, target: 변경된 디렉토리)
2. 반환 JSON을 컨텍스트로 작업 시작
3. 정제 데이터로 부족할 때만 원본 파일 일부 Read
```

### proposal-reviewer

clone의 기존 자산을 비교할 때 *통째 Read 대신*:
```
1. context-preprocessor 호출 (intent: 비교 대상 메타데이터, target: .cursor/rules)
2. JSON으로 충돌·중복 1차 판정
3. 정확 비교 필요할 때만 원본 Read
```

## 한계 (의도된)

- **정확도 vs 효율 트레이드오프** — 메타데이터 추출이 패턴 기반이라 *코너 케이스*는 놓침. 정확 비교 필요 시 원본 Read 폴백 권장
- **스택 가이드 의존** — 스택 팩이 없으면 fallback은 약함. java-spring 외 스택은 점진 추가 필요
- **AST 미사용 (v0.9.0)** — 현재는 정규식·Grep 기반. AST 기반(예: Java Parser)은 후속 버전
- **결정성** — Grep·정규식은 결정적이나, *"intent를 어떻게 해석할지"*는 호출자 LLM이 판단 (intent custom 시 비결정성 발생)

## 다른 자산과의 관계

- **← feedback-loop / work-evaluator / proposal-reviewer** — 무거운 탐색 시 우선 호출
- **→ references/<stack>/preprocessor/** — 스택별 추출 가이드. SSOT
- **work-evaluator·agent-evaluator와 직교** — 본 skill은 *입력 데이터* 정제, 평가 자산은 *결과* 평가. 다른 층

## rubric 자기 평가 (자가 dogfooding 가설)

이 skill의 8차원 예상 점수 (구현 후 실측):

| 차원 | 예상 |
|---|---|
| 1. Context Efficiency | 5 (이 skill의 존재 자체가 차원 1 최적화) |
| 2. Activation Scope | 4 (description 트리거 명확, 의도 명시) |
| 3. Invocation Guarantee | 3 (피호출자, 호출자 보장 의존) |
| 4. Determinism | 4 (Grep/정규식 결정적, intent 해석은 LLM) |
| 5. Portability | 4 (스택 무관 코어 + 팩 분리) |
| 6. Composability | 4 (호출자·스택 가이드 분리 명확) |
| 7. Verifiability | 4 (JSON schema 명확 + filesScanned 같은 검증 가능 필드) |
| 8. Asset Type Fitness | 5 (skill에 적합한 워크플로 패턴) |
| **예상 종합** | **33/40** (release-pass 영역) |

실측은 v0.9.0 release 직전 사람 채점 + agent-evaluator로 확인.

## 핵심 원칙

1. **원본 코드를 반환하지 않는다** — 메타데이터만. 호출자가 통째 Read하려면 본 skill을 우회
2. **스택 가이드가 SSOT** — skill 본문에 스택별 정규식 하드코딩 X
3. **fallback은 약함을 인정** — 스택 가이드 없으면 정직하게 skipReason 명시
4. **호출자가 정확 비교 필요 시 원본 Read 폴백** — 100% 신뢰 도구가 아님 (rubric 한계 정신)
