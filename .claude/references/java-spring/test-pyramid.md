# Java/Spring 테스트 피라미드 — references 팩

> 스택 특화 references 팩. `test-strategist` 등 제네릭 에이전트가 `project.stack: java-spring`일 때
> 런타임에 Read한다. 자산 본문이 아니라 여기에 스택 specifics를 둔다.

## 피라미드 레이어 ↔ Java/Spring 매핑

| 레이어 | 비중 | 핵심 도구 | 대상 |
|---|---|---|---|
| **단위 (Unit)** | 가장 두껍게 | JUnit5 · Mockito · AssertJ (Spring 컨텍스트 없음) | 순수 로직 — 도메인 규칙, 서비스 계산·분기, 검증기 |
| **슬라이스 (Slice)** | 중간 | `@WebMvcTest`+MockMvc, `@DataJpaTest`, `@JsonTest`, `@RestClientTest` | 한 계층만 — 컨트롤러 직렬화·검증, 리포지토리 쿼리·매핑 |
| **통합 (Integration)** | 얇게 | `@SpringBootTest` + Testcontainers | 여러 컴포넌트 협업, 실제 DB, 트랜잭션 경계 |
| **E2E / 인수** | 가장 얇게 | `@SpringBootTest(webEnvironment=RANDOM_PORT)` + `TestRestTemplate`·`WebTestClient` | 사용자 관점 핵심 흐름 (전체 스택) |

## 레이어 선택 — "피라미드를 누른다"

- **기본은 단위.** 계산·분기·검증 로직은 Spring 없이 POJO로 검증한다.
- 컨트롤러의 직렬화·요청 검증·상태코드만 보면 → `@WebMvcTest` 슬라이스 (서비스는 `@MockBean`).
- 리포지토리의 쿼리·매핑·제약만 보면 → `@DataJpaTest` 슬라이스.
- 여러 빈의 협업, 실제 DB 방언·트랜잭션·이벤트가 핵심이면 → `@SpringBootTest` 통합.
- 사용자 시나리오 1~2개(예: 주문 생성 happy path)만 → e2e.
- **같은 케이스를 두 레이어에서 중복 검증하지 않는다.**

## 도구별 지침

- **Mockito** — 협력 객체(다른 빈·외부 포트)를 mock. *값 객체·도메인 엔티티는 mock하지 않는다* (진짜로 쓴다).
- **`@WebMvcTest`** — 컨트롤러·필터·`@ControllerAdvice`·검증을 로드. 서비스 계층은 `@MockBean`. 빠르다.
- **`@DataJpaTest`** — 기본 임베디드 DB. 단 *DB 방언에 의존하는 쿼리*(네이티브 쿼리·윈도우 함수 등)는 Testcontainers 실 DB로.
- **`@SpringBootTest`** — 전체 컨텍스트 → 느리다. 통합·e2e에만. 슬라이스로 가능하면 슬라이스.
- **Testcontainers** — 실제 PostgreSQL·Kafka·Redis. Spring Boot 3.1+는 `@ServiceConnection`으로 자동 연결. 컨테이너는 클래스 단위 재사용.
- **트랜잭션** — `@Transactional` 테스트는 끝나면 롤백된다. *커밋 이후 동작*(`@TransactionalEventListener(AFTER_COMMIT)` 등)은 롤백 테스트로 못 잡는다 — 별도 처리.
- **테스트 데이터** — 빌더 / Object Mother 패턴으로 픽스처. `@Sql`로 시드. 매직값 금지.
- **시간·랜덤** — `Clock`·`Random`을 주입 가능하게 두고 테스트에서 고정.

## 안티패턴 (피라미드 역전)

- 모든 걸 `@SpringBootTest`로 — 느리고 깨지기 쉬운 역삼각형
- 단위로 충분한 로직을 통합 테스트로
- 엣지 케이스를 e2e에 몰아넣기 — e2e는 핵심 흐름만
- mock 과다 — 실제 검증이 사라지고 "mock이 mock을 검증"
- 슬라이스로 될 것을 풀 컨텍스트로
