# PoC — work-evaluator "범위" 축 → DeepEval G-Eval

[ADR-0007](../../docs/adr/0007-deepeval-as-eval-engine.md) 검증용 첫 수.
work-evaluator 4축 중 **"범위를 지켜라"** 1개 축을 DeepEval G-Eval metric으로 옮겨,
`deepeval test run`(pytest)으로 threshold pass/fail 채점이 도는지 확인한다.

## 무엇을 증명하나

- 자체 LLM-judge 채점 루프 == DeepEval **G-Eval**(자연어 criteria → CoT judge → 0~1 점수 + threshold).
- `deepeval test run` 이 **CI executable verifier** 역할을 한다(Pass^k·게이팅 가능).
- scenario-designer 산출물 == DeepEval **golden**(input / actual_output / expected_output).

> ops-pilot의 인프로덕트 머신 스코어러(ADR-0005, TS·per-run·Claude API)와의 관계·역할
> 분담은 ADR-0007 본문 "관계" 절 참조. 이 PoC는 그 결정의 검증 수단일 뿐이다.

## 구성

- `test_scope_axis.py` — 범위 축 G-Eval metric + 골든 2건(in-scope PASS / scope-creep FAIL).
- `claude_code_model.py` — 로컬 `claude` CLI(headless)를 judge로 쓰는 DeepEval 커스텀 모델.
- `.venv/` — 격리 venv (deepeval 설치됨, git 미추적).

## 실행 — 권장: 로컬 Claude Code judge (API 키 불필요)

Anthropic API 키 대신 **Claude Code 로그인(구독) 자격**으로 채점한다.
`claude_code_model.ClaudeCodeModel`이 `claude -p`를 호출한다.

```bash
cd eval/poc-deepeval
DEEPEVAL_JUDGE=claude-code DEEPEVAL_TELEMETRY_OPT_OUT=YES \
  ./.venv/bin/deepeval test run test_scope_axis.py
```

**실측 결과(검증됨):** `Pass Rate 50% | Passed 1 | Failed 1` — golden 1(in-scope) PASS,
golden 2(scope-creep) FAIL. judge spawn 시 `--strict-mcp-config`로 serena 등 MCP를
비활성화(대시보드 창 방지). 키 0.

## 대안 — Anthropic API judge

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# (선택) 기본 claude-sonnet-4-6. 저비용: export DEEPEVAL_JUDGE_MODEL=claude-haiku-4-5
./.venv/bin/deepeval test run test_scope_axis.py
```

## venv 재생성 (clone 직후)

```bash
uv venv .venv --python 3.11
uv pip install --python .venv/bin/python deepeval
```

## judge 우선순위

`DEEPEVAL_JUDGE=claude-code` → 로컬 Claude Code · `ANTHROPIC_API_KEY` → API의 Claude ·
둘 다 없음 → DeepEval 기본(OpenAI, `OPENAI_API_KEY` 필요).

## 다음

- 나머지 3축(가정·최소·검증)도 같은 패턴으로 metric화.
- OpsPilot `start_run` 출력 → DeepEval golden 매핑 어댑터.
- Pass^k: 동일 golden N회 반복으로 차원4(결정성) 정량 채점.
