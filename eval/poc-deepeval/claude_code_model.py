"""로컬 Claude Code CLI(headless)를 DeepEval judge로 쓰는 커스텀 모델.

Anthropic API 키 대신 Claude Code 로그인(구독) 자격을 사용한다.
DeepEval은 judge에 generate(prompt)->str 만 요구하고, GEval 프롬프트가 이미
JSON 출력을 지시하므로 텍스트만 돌려주면 헬퍼가 파싱한다.
"""

import asyncio
import shutil
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
        # shutil.which: 존재 확인 + Windows의 claude.cmd 같은 shim 경로 해석.
        claude_path = shutil.which("claude")
        if not claude_path:
            raise RuntimeError(
                "로컬 'claude' 실행파일을 찾을 수 없습니다. Claude Code 설치+PATH를 확인하거나, "
                "ANTHROPIC_API_KEY를 설정해 API judge를 사용하세요."
            )
        proc = subprocess.run(
            [
                claude_path,
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
        # 동기 subprocess를 별도 스레드로 — async eval 시 이벤트 루프 차단 방지.
        return await asyncio.to_thread(self.generate, prompt, *args, **kwargs)
