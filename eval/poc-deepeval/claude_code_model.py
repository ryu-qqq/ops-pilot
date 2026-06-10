"""로컬 Claude Code CLI(headless)를 DeepEval judge로 쓰는 커스텀 모델.

Anthropic API 키 대신 Claude Code 로그인(구독) 자격을 사용한다.
DeepEval은 judge에 generate(prompt)->str 만 요구하고, GEval 프롬프트가 이미
JSON 출력을 지시하므로 텍스트만 돌려주면 헬퍼가 파싱한다.
"""

import subprocess

from deepeval.models import DeepEvalBaseLLM


class ClaudeCodeModel(DeepEvalBaseLLM):
    def __init__(self, model: str = "claude-code"):
        self.model = model

    def load_model(self):
        return None

    def get_model_name(self) -> str:
        return f"claude-code-local ({self.model})"

    def _run(self, prompt: str) -> str:
        # argv로 직접 전달 — shell 인용 문제 회피. 순수 텍스트 생성이라 도구 불필요.
        # --strict-mcp-config + 빈 --mcp-config: spawn 때 serena 등 MCP를 전부 비활성화
        # (serena 대시보드 창이 매 spawn마다 뜨는 것 방지).
        proc = subprocess.run(
            [
                "claude",
                "-p",
                prompt,
                "--strict-mcp-config",
                "--mcp-config",
                '{"mcpServers":{}}',
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"claude -p 실패(rc={proc.returncode}): {proc.stderr[:500]}")
        return proc.stdout.strip()

    def generate(self, prompt: str, *args, **kwargs) -> str:
        # schema kwarg가 와도 무시 — 프롬프트가 JSON 출력을 지시하므로
        # generate_with_schema_and_extract 헬퍼가 텍스트에서 JSON을 파싱한다.
        return self._run(prompt)

    async def a_generate(self, prompt: str, *args, **kwargs) -> str:
        return self.generate(prompt, *args, **kwargs)
