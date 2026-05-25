// OPSP-18 (b): 터미널-친화 로그 — 데이몬 pane 에 핵심 이벤트만 컬러 한 줄.
// pino 의 JSON 로그와 분리된 채널(stdout console.log). 시끄러우면 OPS_TERM_LOG=off.
// 진짜 TUI 아님 — 정돈된 console 출력 수준.

const enableColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string): string => (enableColor ? `\x1b[${code}m${s}\x1b[0m` : s);

const dim = (s: string) => c("2", s);
const bold = (s: string) => c("1", s);
const green = (s: string) => c("32", s);
const red = (s: string) => c("31", s);
const yellow = (s: string) => c("33", s);
const cyan = (s: string) => c("36", s);
const magenta = (s: string) => c("35", s);

function ts(): string {
  const d = new Date();
  return dim(d.toISOString().slice(11, 19));
}

function emit(line: string): void {
  if (process.env.OPS_TERM_LOG === "off") return;
  console.log(line);
}

function short(id: string): string {
  return id.slice(0, 8);
}

export const mcpLog = {
  listening(port: number): void {
    emit(
      `${ts()} ${green("●")} OpsPilot 데이몬 listening ${bold(`:${String(port)}`)} ` +
        dim(`(MCP: http://localhost:${String(port)}/mcp)`),
    );
  },
  zombieCleaned(n: number): void {
    emit(`${ts()} ${yellow("⚠")} 좀비 run ${String(n)}개 정리`);
  },
  runStart(runId: string, summary: string): void {
    emit(`${ts()} ${cyan("▶")} RUN ${bold(short(runId))} start  ${summary}`);
  },
  runDone(
    runId: string,
    status: "succeeded" | "failed",
    tokens: number | null,
    costUsd: number | null,
  ): void {
    const icon = status === "succeeded" ? green("✓") : red("✗");
    const meta: string[] = [];
    if (tokens !== null && tokens > 0) meta.push(`${String(tokens)}tok`);
    if (costUsd !== null) meta.push(`$${costUsd.toFixed(2)}`);
    emit(
      `${ts()} ${icon} RUN ${bold(short(runId))} ${status}` +
        (meta.length > 0 ? `  ${dim(meta.join(" "))}` : ""),
    );
  },
  scan(projectName: string, savedAssets: number, savedVersions: number): void {
    emit(
      `${ts()} ${green("✓")} scan ${bold(projectName)} → ` +
        `+${String(savedAssets)} assets, +${String(savedVersions)} versions`,
    );
  },
  mcp(tool: string): void {
    emit(`${ts()} ${magenta("📡")} MCP call ${bold(tool)}`);
  },
  error(msg: string): void {
    emit(`${ts()} ${red("✗")} ${msg}`);
  },
};
