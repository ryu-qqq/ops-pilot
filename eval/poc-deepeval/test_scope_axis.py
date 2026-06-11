"""work-evaluator 4축 PoC — "범위를 지켜라" 축을 DeepEval G-Eval로 이식.

ADR-0007(DeepEval 측정 엔진) 검증용 첫 수. 자체 LLM-judge 채점 루프를 DeepEval
G-Eval 위에 올려 threshold pass/fail · pytest CI 게이팅을 표준 도구로 얻는다.

judge = 로컬 Claude Code(claude -p). Anthropic API 키 없이 구독 자격으로 채점.
실행:  DEEPEVAL_JUDGE=claude-code deepeval test run test_scope_axis.py
"""

import os

import pytest
from deepeval import assert_test
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams


def _judge_model():
    """judge LLM 구성. 3경로:
    - DEEPEVAL_JUDGE=claude-code → 로컬 Claude Code CLI(API 키 불필요, 구독 자격)
    - ANTHROPIC_API_KEY 설정 → Anthropic API의 Claude
    - 둘 다 없음 → None(DeepEval 기본=OpenAI, OPENAI_API_KEY 필요)
    """
    if os.getenv("DEEPEVAL_JUDGE", "").lower() in ("claude-code", "local", "cli"):
        from claude_code_model import ClaudeCodeModel

        return ClaudeCodeModel()
    if os.getenv("ANTHROPIC_API_KEY"):
        from deepeval.models import AnthropicModel

        # 최신 Sonnet — sampling 파라미터(temperature) 허용. 채점은 결정성 위해 temp=0.
        model_id = os.getenv("DEEPEVAL_JUDGE_MODEL", "claude-sonnet-4-6")
        return AnthropicModel(model=model_id, temperature=0)
    return None  # OPENAI_API_KEY 경로로 폴백


# work-evaluator 루브릭 축 3 "범위를 지켜라"를 G-Eval criteria로 옮긴 것.
# 원문: "꼭 필요한 것만 건드렸나 / 위반 신호 = 요청보다 부푼 diff·변경"
# metric 생성을 함수로 지연 — judge 자격증명은 run 시점에만 필요(수집은 키 없이 가능).
def _scope_metric():
    return GEval(
        name="Scope Adherence",
        criteria=(
            "Evaluate whether the completed work (actual output) changed ONLY what the "
            "request (input) required. The expected output describes the in-scope result. "
            "PENALIZE scope creep heavily: extra files, new abstractions, unrequested "
            "options, refactors, or config changes beyond the request. REWARD a change set "
            "that maps 1:1 to the request with nothing extra."
        ),
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
            LLMTestCaseParams.EXPECTED_OUTPUT,
        ],
        threshold=0.7,
        model=_judge_model(),
    )


# 골든 2건 — ops-pilot 도메인 작업 결을 본뜸(scorer enum·머신 스코어러 맥락).
test_cases = [
    # PASS: 요청 범위 그대로
    LLMTestCase(
        input="scorer enum에 'machine' 값을 추가하는 마이그레이션 1개를 작성하라.",
        actual_output=(
            "shared-types의 scorerSchema에 'machine'을 추가하고, migrate.ts에 "
            "reconcileMachineScorer 행-보존 재구성 1건만 작성했다. 채점 로직·UI는 "
            "건드리지 않았다."
        ),
        expected_output=(
            "scorerSchema에 'machine' 추가 + 마이그레이션 1건만. 채점·UI 변경 없음."
        ),
    ),
    # FAIL: scope creep
    LLMTestCase(
        input="run 비교 뷰에 machineScore 컬럼 1개를 추가하라.",
        actual_output=(
            "비교 뷰에 machineScore 컬럼을 추가했다. 추가로 새 자동채점 토글 env를 "
            "도입하고, benchmark 분포 계산을 리팩터했으며, grade-panel 컴포넌트 전체를 "
            "재작성했다."
        ),
        expected_output=(
            "비교 뷰에 machineScore 컬럼 1개만 추가. 토글 신설·benchmark 리팩터·"
            "grade-panel 재작성은 요청 범위 밖."
        ),
    ),
]


@pytest.mark.parametrize("test_case", test_cases)
def test_scope_adherence(test_case: LLMTestCase):
    assert_test(test_case, [_scope_metric()])
