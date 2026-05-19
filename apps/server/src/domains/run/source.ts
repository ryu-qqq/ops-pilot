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
 */
export function localClaudeSource(claudeBin = "claude"): RunnerSource {
  return {
    kind: "local-claude",
    run: ({ prompt, cwd }) =>
      ({
        async *[Symbol.asyncIterator]() {
          const child = spawn(
            claudeBin,
            ["-p", prompt, "--output-format", "stream-json", "--verbose"],
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
