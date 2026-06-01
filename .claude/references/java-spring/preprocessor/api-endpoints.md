# java-spring · API Endpoints 메타데이터 추출

context-preprocessor skill이 `intent: api-endpoints`로 호출될 때 이 가이드를 따른다.

## 추출 목표

Spring Web 컨트롤러의 HTTP 매핑을 1줄 메타데이터로:
```json
{
  "endpoint": "POST /orders/{id}",
  "controller": "OrderController.createOrder",
  "requestDto": "OrderCreateRequest",
  "responseDto": "OrderResponse",
  "annotations": ["@PreAuthorize", "@Transactional"]
}
```

## Grep·정규식 패턴

### 1. 컨트롤러 클래스 찾기

```
glob:  **/*Controller.java
grep:  "^@RestController|^@Controller"
```

### 2. 클래스 단위 매핑 (base path)

```
regex per file:
  @RequestMapping\s*\(\s*"?([^")]+)"?\s*\)
  → captures: classBasePath
```

### 3. 메서드 매핑

```
regex per class body:
  @(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*"?([^")]+)?"?\s*\)
  → captures: httpMethod, methodPath

  public\s+\S+\s+(\w+)\s*\(([^)]*)\)
  → captures: methodName, paramSignature
```

### 4. Request/Response DTO

```
paramSignature 내:
  @RequestBody\s+(\w+)\s+
  → captures: requestDto

메서드 반환 타입 (정규식 또는 다음 줄 검사):
  public\s+(?:ResponseEntity<)?(\w+)>?\s+methodName
  → captures: responseDto
```

### 5. 보조 어노테이션 수집

```
메서드 위 라인들에서:
  @(\w+)(?:\([^)]*\))?
  → 단, @GetMapping/@PostMapping 등 매핑 어노테이션은 이미 처리했으므로 제외
```

## 최종 endpoint 조합

```
endpoint = httpMethod + " " + (classBasePath || "") + methodPath
```

## 출력 JSON 예시

원본 (~3KB, 70줄):
```java
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;
    private final Logger log = LoggerFactory.getLogger(OrderController.class);

    @PostMapping("/{id}/items")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<OrderResponse> addItem(
        @PathVariable Long id,
        @RequestBody OrderItemRequest request
    ) {
        log.info("Adding item to order {}", id);
        try {
            return ResponseEntity.ok(orderService.addItem(id, request));
        } catch (Exception e) {
            log.error("Failed", e);
            throw new ApiException(e);
        }
    }
    // ... 다른 메서드들
}
```

정제 (~250 bytes, 약 92% 절감):
```json
{
  "endpoint": "POST /orders/{id}/items",
  "controller": "OrderController.addItem",
  "requestDto": "OrderItemRequest",
  "responseDto": "OrderResponse",
  "annotations": ["@PreAuthorize"]
}
```

## 주의·코너 케이스

- **base path 다중**: `@RequestMapping({"/a", "/b"})` → 첫 번째만 추출. 호출자가 정확 비교 필요 시 원본 Read 폴백
- **상속 컨트롤러**: 부모 클래스의 `@RequestMapping`은 이 가이드 범위 밖. metadata.skipReason에 명시
- **WebFlux**: `Mono<X>`/`Flux<X>` 반환은 정규식이 X만 추출 — 호출자가 X에서 reactive 여부 추측해야
- **Kotlin Spring**: 본 가이드는 Java 기준. Kotlin은 `references/kotlin-spring/preprocessor/` 별도 (없으면 fallback)

## 검증 (생략 X)

스킬이 이 가이드를 적용 후, 호출자가 원하면 다음 검증 명령으로 정합 확인:
```bash
# 추출된 endpoint 수 vs grep 매칭 수
grep -rE "@(Get|Post|Put|Delete|Patch)Mapping" <directory> | wc -l
```
두 수가 다르면 메타데이터에 `metadata.skipReason: "extraction count mismatch"` 명시.
