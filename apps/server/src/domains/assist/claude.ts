import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

// OPSP-27: 로컬 Claude CLI 단발 호출 헬퍼.
// stream-json 트레이스가 필요한 실행(domains/run/source.ts)과 달리,
// 어시스트는 한 번 묻고 한 번 답만 받으면 됨 → -p 의 기본 텍스트 stdout 만 모음.
// 키체인 인증 그대로 재사용(별도 API 키 X). 실 토큰 소모 — UI에서 사용자 확인 후만 호출.

export class ClaudeAssistError extends Error {}

interface Options {
  cwd?: string;
  timeoutMs?: number;
}

export async function runClaudeOnce(prompt: string, opts: Options = {}): Promise<string> {
  const cwd = opts.cwd ?? tmpdir();
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return new Promise<string>((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ClaudeAssistError(`Claude 응답 ${String(timeoutMs / 1000)}s 초과 — 작업이 너무 큰지 다시 시도하세요.`));
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new ClaudeAssistError(
          `Claude CLI 실행 실패: ${e.message}. 'claude' 가 PATH 에 있는지·로컬 인증이 살아있는지 확인하세요.`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new ClaudeAssistError(`Claude 종료코드 ${String(code)}: ${stderr.slice(0, 500)}`.trim()),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// 응답에서 JSON 한 덩어리만 추출. 응답 JSON 의 string 값에 ```diff``` 같은 코드펜스가
// 들어올 수 있어서, 코드펜스 정규식으론 잘못 잡힌다(필드 안 코드펜스를 외곽으로 오인).
// 따라서 (1) raw 전체 JSON.parse 우선 (2) 첫 '{' 부터 *string literal 인식 깊이 매칭*.
export function extractJsonObject(text: string): unknown {
  // 1. 응답 전체가 깔끔한 JSON 이면 그대로.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // 다음 단계로
  }
  // 2. 첫 '{' 부터 string-aware 깊이 매칭.
  const start = text.indexOf("{");
  if (start < 0) throw new ClaudeAssistError("응답에서 '{' 를 찾지 못함");
  let depth = 0;
  let inStr: false | '"' | "'" = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inStr !== false) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice) as unknown;
        } catch (e) {
          throw new ClaudeAssistError(`JSON 파싱 실패: ${(e as Error).message}`);
        }
      }
    }
  }
  throw new ClaudeAssistError("응답 JSON 의 '}' 가 닫히지 않음");
}
