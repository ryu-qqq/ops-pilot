# Claude 룰 브릿지 — 역방향 하네스 동기화 (도구 무관 플라이휠 #1)

> 2026-06-06 brainstorming 결과. "OpsPilot = 도구 무관 하네스 개선 플라이휠"의 첫 고리.
> 배경: 복리 증명(`2026-06-06-harness-compounding-proof-design.md`) 이후, 제품 정체성 재진단에서 나옴.

## 어디서 나왔나

복리 증명을 만든 뒤 제품 전체를 DB로 재진단하니, OpsPilot은 사실상 **도구 무관 하네스 개선 플라이휠**인데 고리의 절반만 닫혀 있었다.

- **측정 절반**(사용량·정정왕복)은 이미 **Claude Code** transcript(`~/.claude/projects`)에서 나온다.
- **개선 절반**(평가→개선안→반영)은 레일이 도구 무관인데도 실제론 **Cursor만** 닫힌다 — 개선안 85건 중 84건이 `cursor_rule`.

증거(2026-06-06 실DB):
- ops-pilot 프로젝트는 100% Claude Code로 개발되는데, 개선안 21건이 *전부* `cursor_rule`. `.claude` 대상 0.
- 이유: evaluator의 교훈은 대부분 **규칙/정책**인데, Cursor엔 `.cursor/rules`라는 1급 자리가 있고 Claude의 등가물(CLAUDE.md)은 evaluator targetKind에 없다. 그래서 규칙형 교훈은 죄다 `cursor_rule`로 간다.
- 그런데 **CLAUDE.md는 `.cursor/rules`를 import·참조하지 않는다.** 즉 Claude Code는 그 룰을 안 읽는다. harness-bridge(`sync.ts`)는 `.claude`→`.cursor` 한 방향뿐(역방향 없음).
- 결과: **Claude 작업에서 배운 교훈이 Claude가 안 읽는 곳(.cursor/rules)에 쌓여 환류되지 않는다 — 열린 회로(open-circuit).**

## 결정

**역방향 브릿지를 더해, Claude Code가 공유 룰 레이어(`.cursor/rules`)를 읽게 한다.** 한 룰 레이어를 두 도구가 같이 소비하는 구조 — 반복된 차원 불일치(측정=Claude, 개선=Cursor)가 뿌리에서 사라진다. **evaluator·targetKind는 안 건드린다.** 기존 84건 + 앞으로의 모든 `cursor_rule`이 그대로 Claude에도 먹힌다.

스코프: 규칙형 교훈(대다수)을 Claude에 흘리는 것까지. `.claude` agent/skill *본문* 개선(드문 쪽)은 다음 고리.

## 왜 PostToolUse 훅인가 (검증 결과)

`.cursor/rules`는 거의 전부 `alwaysApply:false` + **글롭 한정**이다(특정 파일 편집 시에만 발화). 항상-읽는 CLAUDE.md에 통째로 넣으면 *조건부 룰을 무조건 룰로* 바꿔 의미를 왜곡하고 컨텍스트를 비대화한다. 그래서 "Claude가 읽게"는 정확히는 **"글롭 맞을 때만 조건부로 읽게"**여야 한다.

claude-code-guide로 공식 문서를 검증한 결과:
- **편집 *전* 주입(PreToolUse + additionalContext)은 공식 보증이 없다** — 무시될 수 있음.
- PreToolUse `if`로 글롭 매칭은 되나 **편집을 차단(deny)**하는 용도라 룰 노출엔 과하다.
- **PostToolUse + additionalContext는 공식 지원**된다. 편집 직후 매칭 룰을 주입하면 Claude가 *다음 수에서* 보고 스스로 고친다. 한 박자 늦은(반응형) 가이드지만, OpsPilot의 정정-루프 철학과 맞고 **실제로 작동**한다.
- SessionStart·UserPromptSubmit도 additionalContext 지원(상시·압축 후 생존).

**결정: PostToolUse(글롭 조건부) + SessionStart(상시 룰·색인).** 반응형(편집 후)임을 한계로 받아들인다.

## 무엇을 만드나

핵심 통찰: **훅 스크립트가 `.cursor/rules`를 런타임에 읽게 하면, OpsPilot은 훅을 한 번만(멱등) 설치하면 된다.** 새 `cursor_rule`이 쌓여도 자동으로 Claude에 흐른다 — 룰마다 재sync 불필요.

OpsPilot 브릿지가 소비 프로젝트에 멱등 생성하는 설치물:

1. **훅 스크립트** `.claude/hooks/inject-cursor-rules.mjs` (node — jq 의존 없음, 정규식·frontmatter 파싱 견고). 두 모드:
   - **PostToolUse 모드:** stdin JSON의 `tool_input.file_path`를 프로젝트 상대경로로 정규화 → `.cursor/rules/*.mdc`의 `globs`와 매칭 → 맞는 룰 본문을 `hookSpecificOutput.additionalContext`로 출력. 매칭 없으면 조용히 종료(exit 0).
   - **SessionStart 모드:** `alwaysApply:true` 룰 본문 + 나머지(글롭·수동) 룰의 색인(이름·globs·description 한 줄)을 stdout으로.
   - 두 모드 모두 **`opspilot-agent-*`(브릿지 생성물)·`agent-crew-must`는 제외**(루프 차단; agent-crew-must는 alwaysApply라면 상시 색인엔 포함 가능 — 구현 계획에서 확정).
2. **`.claude/settings.json`** — PostToolUse(matcher `Edit|Write|MultiEdit`)·SessionStart 훅 엔트리를 **기존 설정 안 깨고 멱등 병합**(우리 스크립트 경로를 가리키는 엔트리가 이미 있으면 skip). 프로젝트 스코프(커밋 가능). `settings.local.json`은 건드리지 않는다.

서버(harness-bridge 도메인, 기존 `.claude`→`.cursor`와 대칭):
- `planClaudeRulesBridge(clonePath)` / `applyClaudeRulesBridge(clonePath)` — 훅 스크립트 쓰기 + settings 멱등 병합 계획/적용. 스크립트 본문은 서버에 템플릿.
- `sync_cursor_harness` MCP·라우트와 apply-후 경로에 연결(설치 보장). 단 스크립트가 런타임 동적이라 **설치만 멱등 보장되면 충분** — 룰 변경마다 재생성 불필요.

## 인터페이스 (개략)

- 서버: harness-bridge에 역방향 함수 추가. 기존 `planCursorHarnessSync`/`applyCursorHarnessSync`와 대칭. 설치 결과(생성/병합된 상대경로 목록) 반환.
- 생성물: `.claude/hooks/inject-cursor-rules.mjs`(생성 헤더 표식), `.claude/settings.json`(병합).
- 글롭 매칭: `.mdc` frontmatter의 `globs`(배열 또는 콤마구분 문자열) 파싱 → minimatch류 매칭. 외부 의존 최소 — 간단 glob→정규식 변환을 스크립트에 내장(node 표준만).

## 스코프 밖 (다음 고리)

- `.claude` agent/skill **본문** 개선안 적용(B 영역). apply는 이미 지원하나 evaluator가 거의 안 냄.
- evaluator/targetKind 변경 — 안 한다(이번 결정의 핵심: 기존 cursor_rule 출력을 Claude로 흘리기만).
- 공유 agent-crew **상류** 반영(개선안→agent-crew PR→버전→재sync). 별도 큰 고리.
- 편집 *전* 가이드(PreToolUse) — 공식 미지원이라 보류.

## 성공기준

- ops-pilot에 설치 후, governed 파일(예: `apps/server/src/routes/*.ts` → `nested-route-param-ownership`, `README.md` → `readme-screenshot-integrity`)을 Claude로 편집하면 그 룰이 컨텍스트에 주입된다.
- 새 `cursor_rule`을 추가해도(재sync 없이) 다음 편집부터 자동 반영된다(런타임 동적).
- 기존 `settings.json`·`settings.local.json`·hand-authored 설정이 보존된다(멱등 병합).
- 브릿지 생성물(`opspilot-agent-*`)이 룰로 역주입되지 않는다(루프 없음).
- 검증: harness-bridge 글롭 매칭·frontmatter 분류·생성물 제외 vitest. 훅 스크립트 샘플 stdin 자기 테스트. ops-pilot 수동 e2e(훅은 Playwright로 안 잡힘).

## 리스크·열린 질문

- **반응형(편집 후) 한계.** 룰이 편집 후 한 박자 늦게 뜬다 — Claude가 다음 수에서 고쳐야 한다. Cursor의 편집-전 가이드보다 약하다(공식 제약).
- **PostToolUse additionalContext가 모델에 실제로 닿는지** 실세션에서 확인(문서상 지원이나 체감 검증 필요).
- **settings.json 병합 견고성.** JSON 구조·기존 훅 보존·중복 방지. 깨지면 사용자 설정 손상 — 가장 조심할 곳.
- **글롭 매칭 정확도.** `.mdc`의 globs 표기(배열/콤마/중괄호 `{ts,tsx}`)를 node 표준만으로 견고히 파싱·매칭. 외부 minimatch 의존을 둘지 자체 변환할지 구현 계획에서 결정.
- **상대경로 정규화.** 훅이 받는 절대 file_path를 프로젝트 루트 기준 상대로 변환(cwd는 stdin에 있음).
- **컨텍스트 비용.** 색인은 가볍게. 본문 주입은 매칭된 것만.
- 이 반응형 주입이 실제로 Claude 작업 품질(정정 감소)에 닿는지는 ops-pilot 도그푸드로 체감 검증. 약하면 SessionStart 색인을 강화하거나 PreToolUse 차단형을 재고.
