import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// 러너 입력 = 무엇을(prompt) 어디서(대상 레포 cwd) 실행하나.
export interface RunInput {
  prompt: string;
  cwd: string;
}

// 소스는 "정규화 전 원본 이벤트 객체"를 순서대로 흘린다.
// fixture(결정론·토큰0) / localClaude(로컬 CLI·실인증) 가 같은 인터페이스.
export interface RunnerSource {
  readonly kind: "fixture" | "local-claude";
  run(input: RunInput): AsyncIterable<unknown>;
}

// UI "실행"에서 source=fixture & 이벤트 미지정 시 쓰는 내장 데모 트레이스
// (토큰 0·결정론 — 클린 환경 데모 재현용). 멀티 에이전트 핸드오프 형태를 모사.
export const DEMO_FIXTURE: unknown[] = [
  { type: "system", subtype: "init", tools: ["Agent", "Read", "Grep"] },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: "orchestrator 절차서 로드 → Phase0 wiki-lookup 선행" }],
    },
  },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "d1", name: "Agent", input: { subagent_type: "wiki-lookup", prompt: "도메인 컨벤션 조회" } },
      ],
    },
  },
  {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "d1", content: "vaultContext 수집 완료" }],
    },
  },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "d2", name: "Agent", input: { subagent_type: "product-owner", prompt: "수용기준 도출" } },
      ],
    },
  },
  {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "d2", content: "수용기준 3건 + CLARIFY 1건" }],
    },
  },
  {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "ESCALATION 없음 → 다음 Phase 진행" }] },
  },
  {
    type: "result",
    subtype: "success",
    result: "데모 흐름 완료",
    usage: { input_tokens: 12840, output_tokens: 920 },
    total_cost_usd: 0.041,
  },
];

/** 결정론 픽스처: 미리 정해둔 이벤트 배열을 그대로 재생 (테스트·CI, 토큰 0). */
export function fixtureSource(events: unknown[]): RunnerSource {
  return {
    kind: "fixture",
    run: async function* () {
      for (const e of events) yield e;
    },
  };
}

/**
 * 로컬 Claude Code CLI 를 헤드리스로 spawn.
 * 기존 로컬 인증(Keychain OAuth/플랜)을 그대로 사용 — 별도 API 키 불필요.
 * `claude -p <prompt> --output-format stream-json --verbose` 의 JSON 라인을 흘린다.
 *
 * **MCP 차단(--strict-mcp-config + 빈 mcp-config)**: 사용자 글로벌 MCP(Serena 등)가
 * 매 실행마다 onboarding 하지 않게. 평가 실행은 깔끔한 빈 컨텍스트가 일관성·재현성에
 * 유리. 사용자 인증·플랜 키체인은 그대로(--bare 는 키체인까지 차단이라 부적합).
 */
export function localClaudeSource(claudeBin = "claude"): RunnerSource {
  return {
    kind: "local-claude",
    run: ({ prompt, cwd }) =>
      ({
        async *[Symbol.asyncIterator]() {
          const child = spawn(
            claudeBin,
            [
              "--strict-mcp-config",
              "--mcp-config",
              '{"mcpServers":{}}',
              "-p",
              prompt,
              "--output-format",
              "stream-json",
              "--verbose",
            ],
            { cwd, stdio: ["ignore", "pipe", "pipe"] },
          );
          let stderr = "";
          child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

          const rl = createInterface({ input: child.stdout });
          try {
            for await (const line of rl) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                yield JSON.parse(trimmed);
              } catch {
                // stream-json 이 아닌 잡출력 라인은 무시
              }
            }
            const code: number = await new Promise((res) => child.on("close", res));
            if (code !== 0) {
              throw new Error(`claude 종료코드 ${String(code)}: ${stderr.slice(0, 500)}`);
            }
          } finally {
            rl.close();
            if (child.exitCode === null) child.kill("SIGKILL");
          }
        },
      }) as AsyncIterable<unknown>,
  };
}
