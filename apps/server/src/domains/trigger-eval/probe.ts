import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 트리거 정확도 probe — 자산(스킬/에이전트)을 임시 .claude 에 깔고
// claude -p 로 query 를 던져, 그 자산이 실제로 "발화"되는지 stream-json 으로 감지한다.
// (skill-creator run_eval.py 의 OpsPilot 판: description 트리거 정확도 측정)
// 실 토큰 소모 — UI/엔드포인트에서 사용자 확인 후만 호출.

export type TriggerKind = "agent" | "skill";

export interface ProbeResult {
  triggered: boolean;
  /** 디버그용 — 실행 중 처음 호출된 도구 이름. */
  firstTool: string | null;
}

interface StreamEvent {
  type?: string;
  message?: { content?: unknown };
}

/** 이 자산을 호출하는 tool_use 인가. skill→Skill(input.skill), agent→Agent|Task(input.subagent_type). */
function matchesAsset(
  name: unknown,
  input: Record<string, unknown>,
  kind: TriggerKind,
  asset: string,
): boolean {
  if (kind === "skill" && name === "Skill") {
    const s = typeof input.skill === "string" ? input.skill : "";
    return s === asset || s.split(":").pop() === asset;
  }
  if (kind === "agent" && (name === "Agent" || name === "Task")) {
    return input.subagent_type === asset;
  }
  return false;
}

/** 한 stream 이벤트에서 첫 tool_use 의 (이름, 자산일치 여부)를 뽑는다. tool_use 없으면 null. */
function firstToolDecision(
  ev: StreamEvent,
  kind: TriggerKind,
  asset: string,
): { name: string | null; match: boolean } | null {
  if (ev.type !== "assistant") return null;
  const content = ev.message?.content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as {
      type?: string;
      name?: string;
      input?: Record<string, unknown>;
    };
    if (b.type !== "tool_use") continue;
    return {
      name: typeof b.name === "string" ? b.name : null,
      match: matchesAsset(b.name, b.input ?? {}, kind, asset),
    };
  }
  return null;
}

// claude -p 를 stream-json 으로 돌리되, 첫 tool_use 가 나오면 즉시 판정하고 프로세스를 죽인다.
// (트리거 여부만 알면 되므로 자산이 실제 작업까지 수행하게 둘 필요 없음 — 비용·시간 절감)
function probeOnce(
  query: string,
  cwd: string,
  kind: TriggerKind,
  asset: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--output-format",
        "stream-json",
        "--verbose",
        "-p",
        query,
      ],
      { cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let buffer = "";
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ triggered: false, firstTool: null }),
      timeoutMs,
    );

    child.stdout.on("data", (d: Buffer) => {
      buffer += d.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let ev: StreamEvent;
        try {
          ev = JSON.parse(line) as StreamEvent;
        } catch {
          continue;
        }
        const decision = firstToolDecision(ev, kind, asset);
        if (decision)
          finish({ triggered: decision.match, firstTool: decision.name });
      }
    });
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    // 첫 tool_use 없이 종료(claude 가 도구 없이 텍스트로만 답함) → 미발화.
    child.on("close", () => finish({ triggered: false, firstTool: null }));
  });
}

export async function probeTrigger(
  kind: TriggerKind,
  name: string,
  content: string,
  query: string,
  timeoutMs = 120_000,
): Promise<ProbeResult> {
  const dir = mkdtempSync(join(tmpdir(), "ops-trig-"));
  try {
    if (kind === "skill") {
      const sd = join(dir, ".claude/skills", name);
      mkdirSync(sd, { recursive: true });
      writeFileSync(join(sd, "SKILL.md"), content, "utf8");
    } else {
      const ad = join(dir, ".claude/agents");
      mkdirSync(ad, { recursive: true });
      writeFileSync(join(ad, `${name}.md`), content, "utf8");
    }
    return await probeOnce(query, dir, kind, name, timeoutMs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
