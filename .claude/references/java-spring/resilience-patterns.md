# Java/Spring Resilience 패턴 — references 팩

> 스택 특화 references 팩. Resilience4j·Micrometer를 쓰는 Java 프로젝트에서
> `resilience-reviewer`·구현 에이전트가 `.claude/references/` 또는 agent-crew sync 경로에서 Read한다.

## Circuit Breaker

| 원칙 | 지침 |
|------|------|
| 실패 기록 | 5xx·네트워크·타임아웃만 CB failure로 기록. 4xx(특히 400)는 기록하지 않는다. |
| OPEN 동작 | OPEN 시 즉시 `CircuitOpenException` — retry와 중복 시도 금지. |
| 설정 | `failureRateThreshold`, `waitDurationInOpenState`, `slowCallDurationThreshold` 명시. |

## Retry

| 원칙 | 지침 |
|------|------|
| 대상 | idempotent 또는 안전하게 재시도 가능한 호출만. |
| 백오프 | `initialBackoff` + multiplier. maxAttempts 상한 명시. |
| CB와 관계 | OPEN 상태에서는 retry하지 않는다. |

## 메트릭 (Micrometer)

| 메트릭 | 태그 | 비고 |
|--------|------|------|
| duration Timer | name, outcome, method | outcome = success/failure |
| total Counter | name, outcome, method | |
| errors Counter | name, exception, method | |
| circuit_breaker_state Gauge | name | 0=CLOSED, 1=OPEN, 2=HALF_OPEN |
| retry Counter | name, result | |

이름·태그는 **프로젝트 references**의 SDK 규격과 일치해야 한다.

## 예외 계층 (HTTP 클라이언트)

```
ExternalCallException
├── ServerException       (5xx — CB O, Retry O)
├── NetworkException      (타임아웃/연결 — CB O, Retry O)
├── BadRequestException   (400 — CB X, Retry X)
├── ClientException       (기타 4xx — CB X, Retry X)
└── CircuitOpenException  (OPEN — Retry X)
```

## Spring Boot Starter

- `@AutoConfiguration` + `AutoConfiguration.imports` (Boot 3)
- `@ConfigurationProperties` prefix 일관 (`resilient.client.*` 등 프로젝트 convention 따름)
- `MeterRegistry` 주입 시 metrics 모듈 자동 바인딩

## 테스트

- **단위**: classifier·builder·예외 매핑 — Spring 없이 JUnit5
- **슬라이스**: `@SpringBootTest` 최소화 — auto-config 단위는 `@Import` + mock `RequestSender`
- Resilience4j 동작 검증: mock sender가 5xx 연속 반환 → OPEN 전이 assert

## 안티패턴

- CB 없이 raw HTTP 클라이언트 노출
- 400을 CB failure로 기록
- 메트릭 name/tag 프로젝트마다 제각각
- 모든 통합 테스트를 `@SpringBootTest` full context로
