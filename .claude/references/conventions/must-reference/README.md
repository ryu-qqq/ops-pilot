# must-reference — 소비 프로젝트가 자산을 "잊지 않고" 호출하도록 보장

## 왜 이게 필요한가

agent-crew의 자산(agents·skills·references)이 아무리 잘 만들어져도, 소비 프로젝트의 LLM이 **호출 자체를 안 하면 무용지물**이다. 우아한형제들 기술블로그 ["흩어져 있는 AI 자산, MCP stdio로 헤쳐모여!"](https://techblog.woowahan.com/25986/) 마지막 섹션이 정확히 이 한계를 지적한다 — *"MCP는 에이전트가 실행할 수 있는 프로토콜이기 때문에, 에이전트가 필요하지 않다고 판단하면 실행되지 않을 수 있다"*.

→ 보강책: 소비 프로젝트의 **항상 컨텍스트에 들어가는 자리**(Claude Code의 `CLAUDE.md`, Cursor의 `alwaysApply: true` 룰)에 `MUST: agent-crew의 X를 반드시 참조한다`라는 명령을 박는다.

## 강제의 강도

| Level | 메커니즘 | 우회 가능성 | 우리 위치 |
|---|---|---|---|
| 1. 권고 | 일반 문서에 "참조하세요" | LLM이 쉽게 무시 | — |
| **2. always-injected** | **alwaysApply 룰에 `MUST` 명령** | **매 요청마다 인식 → 매우 낮음** | **여기서 채택** |
| 3. Hook 차단 | PreToolUse hook이 호출 누락 시 차단 | 진짜 강제. 셋업 복잡 | 별도 에픽 |

100% 보장은 아니지만, 실측 무시율이 매우 낮고 셋업 비용 1~2시간으로 가장 ROI가 높다.

## 두 IDE 지원

| IDE | 항상 읽는 파일 | 우리 스니펫 |
|---|---|---|
| Claude Code | `CLAUDE.md` (프로젝트 루트) | [`claude-md-snippet.md`](./claude-md-snippet.md) |
| Cursor | `.cursor/rules/*.mdc` 중 `alwaysApply: true` | [`cursor-always-rule.mdc`](./cursor-always-rule.mdc) |

본문은 동일, 포장지만 다르다. 소비 프로젝트의 `.claude/project.yaml`에서 `ide:` 값을 읽고, ops-pilot이 sync 시 해당 스니펫을 자동 배포한다.

## 사용 흐름

```
agent-crew (이 폴더)
   ├── claude-md-snippet.md      ──┐
   └── cursor-always-rule.mdc    ──┤
                                   ↓
ops-pilot sync (소비 프로젝트의 project.yaml.ide 읽음)
                                   ↓
소비 프로젝트
   ├── CLAUDE.md (Claude Code)       ← MUST 블록 주입
   └── .cursor/rules/agent-crew-must.mdc (Cursor)  ← alwaysApply 룰 주입
```

## 어떤 자산을 강제할지 선택

소비 프로젝트의 `project.yaml`:

```yaml
mustReference:
  - work-evaluator-4-principles   # 작업 원칙 4줄 (기본 권장)
  - commit-format                  # 커밋 컨벤션
  - pr-title                       # PR 제목 컨벤션
```

배열에 명시된 키만 스니펫에 포함된다. 기본 권장은 `work-evaluator-4-principles` 하나.

## 한계

- LLM이 본문을 보고도 의식적으로 무시할 수 있다 (확률은 낮지만 0이 아님)
- 컨텍스트 비대화 트레이드오프 — `MUST` 블록은 매 요청마다 토큰을 소비. 따라서 **자산 본문 전체가 아닌 "참조 명령"만** 박는다. 본문은 실제 호출 시 로드.
- 진짜 100% 강제는 Hook 레벨이 필요. 그건 [Agent Engineering 트렌드 조사 → 평가 프레임워크] 에픽 결과 후 별도 진행.

## 변경 이력

- v0.7.0 (2026-05-26) — 신설
