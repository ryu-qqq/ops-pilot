# java-spring · Domain Classes 메타데이터 추출

context-preprocessor skill이 `intent: domain-classes`로 호출될 때 이 가이드를 따른다.

## 추출 목표

```json
{
  "className": "Order",
  "package": "com.example.order.domain",
  "kind": "entity" | "valueObject" | "aggregate" | "service" | "dto",
  "fields": [{"name": "id", "type": "Long", "annotations": ["@Id"]}],
  "methods": [{"name": "addItem", "returnType": "void", "annotations": []}],
  "annotations": ["@Entity", "@Table"]
}
```

## Glob·Grep 패턴

### 1. 후보 파일 (도메인 디렉토리 한정)

```
glob:  **/domain/**/*.java
       **/model/**/*.java
       **/entity/**/*.java
```

### 2. 클래스 단위 추출

```
regex per file:
  ^package\s+([\w.]+);                            → package
  ^(public\s+)?(class|record|enum)\s+(\w+)        → className, type
  ^@(\w+)(?:\([^)]*\))?\s*$                       → class annotations (multi-line 가능)
```

### 3. kind 판정 규칙

| annotation·구조 | kind |
|---|---|
| `@Entity`, `@Table` | `entity` |
| `record Xxx(...)` | `valueObject` |
| `@Service` | `service` |
| `*Request`, `*Response`, `*Dto`, `@Schema` | `dto` |
| `@AggregateRoot` (DDD lib) 또는 `@DomainEvents` 메서드 보유 | `aggregate` |
| 기타 | `class` (kind unknown) |

### 4. 필드·메서드

```
필드 정규식:
  ^\s+private\s+(?:final\s+)?(\S+)\s+(\w+)\s*[;=]
  → fieldType, fieldName

  필드 위 라인의 어노테이션 (멀티라인 가능)

메서드 정규식:
  ^\s+(?:public|private|protected)\s+(?:static\s+)?(\S+)\s+(\w+)\s*\(([^)]*)\)
  → returnType, methodName, paramSignature

  메서드 위 라인의 어노테이션
```

### 5. 생성자·equals·hashCode·toString 제외

이 메서드들은 메타데이터에서 *제외* (Lombok 자동 생성·boilerplate). 호출자가 명시 요청하면 포함.

## 출력 JSON 예시

원본 `Order.java` (~5KB):
```java
package com.example.order.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "orders")
@Getter @Builder
@NoArgsConstructor @AllArgsConstructor
public class Order {
    @Id @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private String customerId;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL)
    private List<OrderItem> items;

    public void addItem(OrderItem item) {
        this.items.add(item);
        item.assignOrder(this);
    }

    public boolean isPayable() {
        return status == OrderStatus.PENDING && !items.isEmpty();
    }

    // equals/hashCode/toString (Lombok 자동 — 제외)
}
```

정제 (~600 bytes, 88% 절감):
```json
{
  "className": "Order",
  "package": "com.example.order.domain",
  "kind": "entity",
  "fields": [
    {"name": "id", "type": "Long", "annotations": ["@Id", "@GeneratedValue"]},
    {"name": "customerId", "type": "String", "annotations": ["@Column"]},
    {"name": "status", "type": "OrderStatus", "annotations": ["@Enumerated"]},
    {"name": "items", "type": "List<OrderItem>", "annotations": ["@OneToMany"]}
  ],
  "methods": [
    {"name": "addItem", "returnType": "void"},
    {"name": "isPayable", "returnType": "boolean"}
  ],
  "annotations": ["@Entity", "@Table"]
}
```

## 주의·코너 케이스

- **Inner class**: 1단계 nested만 추출. 더 깊으면 skipReason
- **Generic 복잡 타입**: `Map<String, List<Order>>` 같은 중첩은 그대로 문자열 보존 (파싱 X)
- **Lombok 어노테이션**: `@Getter/@Setter/@Builder` 등은 메타데이터에 포함하지만 자동 생성 메서드는 추출 X
- **Record vs Class**: kind에 명시하되 fields는 동일 추출

## 검증

```bash
# 클래스 수
grep -rE "^public\s+(class|record|enum)" <directory> | wc -l
```
추출 수와 다르면 `metadata.skipReason` 명시.
