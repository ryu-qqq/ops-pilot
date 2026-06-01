# Claude Code 용 — 소비 프로젝트 CLAUDE.md 강제 참조 블록

소비 프로젝트의 `CLAUDE.md` **맨 위**(다른 모든 섹션보다 앞)에 다음 블록을 삽입한다.
ops-pilot이 sync 시 `project.yaml.mustReference` 배열을 읽고 해당 항목만 포함시켜 자동 주입한다.

---

## 삽입할 블록 (템플릿)

```markdown
<!-- agent-crew:must-reference:begin (auto-managed by ops-pilot — do not edit by hand) -->
# ⚠️ MUST — 작업 시작 전 반드시 참조

이 프로젝트는 agent-crew 공유 자산을 사용한다. 모든 작업(코드·문서·자산 저작)은
다음 원칙·컨벤션을 **먼저 읽고** 그 기준으로 수행한다.

## 작업 원칙 4줄 (work-evaluator 채점 축)

1. **가정하지 마라.** 모르면 묻는다. 혼란을 숨기지 말고 트레이드오프를 드러낸다.
2. **최소만 만들어라.** 문제를 푸는 최소한의 코드·자산만. 추측성 산출 금지.
3. **범위를 지켜라.** 꼭 필요한 것만 건드린다. 요청보다 부푼 diff 금지.
4. **성공 기준을 정하고 검증하라.** 완료 조건을 명시하고, 검증될 때까지 돈다.

> 작업이 끝났다고 보고하기 전에 위 4축으로 self-check 한다.
> 모호하면 `agents/work-evaluator.md` 본문을 직접 Read.

## 활성화된 컨벤션

<!-- 아래 줄은 project.yaml.mustReference 에 명시된 항목만 ops-pilot이 채움 -->
- 커밋 메시지: `agent-crew/references/conventions/commit-format.md`
- PR 제목: `agent-crew/references/conventions/pr-title.md`

<!-- agent-crew:must-reference:end -->
```

---

## 주입 규칙 (ops-pilot 동작)

1. 소비 프로젝트의 `CLAUDE.md`에 `<!-- agent-crew:must-reference:begin -->` 마커가 있으면 그 블록만 **idempotent replace**
2. 없으면 파일 **맨 위**에 삽입 (기존 H1 제목 위)
3. `project.yaml.mustReference` 배열에 따라 "활성화된 컨벤션" 항목을 동적 채움
   - `work-evaluator-4-principles` 항목은 항상 포함 (제거 시 블록 자체 제거)
   - `commit-format` → "커밋 메시지" 줄 포함
   - `pr-title` → "PR 제목" 줄 포함

## 왜 본문 전체가 아닌 "참조 명령"만 박나

`MUST` 블록은 매 요청마다 토큰을 소비한다. 자산 본문 전체를 박으면 컨텍스트가 비대해진다.
따라서 여기엔 **(a) 가장 자주 위반되는 핵심 원칙(4줄)**과 **(b) 나머지 자산의 경로**만 둔다.
LLM은 이 블록을 보고 작업 시작 시점에 필요한 자산을 명시 호출한다.

## 호환성

이 스니펫은 소비 프로젝트의 기존 `CLAUDE.md` 내용을 보존한다. 마커 블록 외부는 손대지 않는다.
