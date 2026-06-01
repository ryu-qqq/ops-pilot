# java-spring · Fallback (intent 매칭 실패 시)

`intent`가 `api-endpoints`·`domain-classes`·`test-patterns` 외이거나 custom일 때 본 가이드를 따른다.

## 추출 목표

스택 무관 기본 메타데이터 — *"이 자바 파일에 무엇이 있나"* 의 가장 가벼운 인덱스.

```json
{
  "file": "src/main/java/com/example/order/OrderController.java",
  "package": "com.example.order",
  "topLevel": {
    "kind": "class" | "interface" | "record" | "enum",
    "name": "OrderController",
    "annotations": ["@RestController"]
  },
  "imports": ["org.springframework.web.bind.annotation.*", "..."],
  "publicMembers": [
    {"kind": "field", "name": "orderService", "type": "OrderService"},
    {"kind": "method", "name": "addItem", "returnType": "ResponseEntity"}
  ]
}
```

## 정규식

```
패키지:    ^package\s+([\w.]+);
import:    ^import\s+([\w.*]+);
최상위:    ^(?:public\s+)?(class|interface|record|enum)\s+(\w+)
어노테이션: ^@(\w+)(?:\([^)]*\))?\s*$  (최상위 또는 멤버 위)
public 멤버:
  필드:  ^\s+public\s+(?:final\s+|static\s+)*(\S+)\s+(\w+)\s*[;=]
  메서드: ^\s+public\s+(?:static\s+)?(\S+)\s+(\w+)\s*\(
```

## 주의

- `private/protected` 멤버는 의도적으로 *제외* — fallback은 공개 인터페이스만
- import는 *별표 import만 정리*, 개별 import는 그룹 단위로 첫 5개까지 (긴 import 절감)
- 어노테이션 인자는 *제거* (`@RequestMapping("/x")` → `@RequestMapping`만)

## metadata.skipReason 명시 케이스

- 파일이 1000줄 초과 → `"file too large for regex extraction (>1000 lines)"`
- syntax error로 정규식 매칭 0 → `"no top-level declaration found"`
- generic 깊이 3+ → 해당 멤버는 type을 `"<complex generic>"`로 대체
