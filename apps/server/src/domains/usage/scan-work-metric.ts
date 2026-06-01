import { type Dirent, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ADR-0001: 작업 기반 자동 평가 — transcript 무상 신호(reference signal) 수집.
// scan-usage.ts 와 같은 JSONL 소스를 읽되, "세션 단위"로 자산 발화 + 정정 왕복을 센다.
//
// ⚠️ 정정 왕복은 "품질 점수"가 아니라 "참고 신호"다 (ADR-0001 §1).
//    정정이 많다고 자산이 나쁜 게 아니다 — 작업 난도·탐색·사용자 변심이 혼란변수.
//
// 단위 = 세션(JSONL 1파일 = sessionId = 자연 경계).
//
// 정정 왕복 경계 (좁힌 정의 — ADR-0001 §정정왕복 경계):
//   자산 발화마다 **발화 직후 사용자가 처음 끼어든 타이핑 1회만** 그 발화의 정정으로
//   센다(발화별 0/1). 윈도는 자산 발화로 열리고, (a) 다음 자산 발화가 오거나
//   (b) 첫 사용자 타이핑이 귀속되면 닫힌다. → corr ≤ invocationCount 가 보장된다.
//
//   왜 좁혔나: 직전 정의("발화~다음 발화 또는 세션 끝 사이 user 타이핑 전부")는
//   자산을 한 번 부르고 세션 내내 다른 자산 없이 대화하면 그 모든 타이핑이 한 자산에
//   쌓여 "세션 길이"로 오염됐다(실측 agent:Explore inv=2 corr=237). 발화 결과에 대한
//   *첫 사용자 반응*만 세어 invocationCount 규모로 합리화한다.
//
//   "사용자 타이핑"에서 제외: tool_result 자동 메시지(content=list with tool_result),
//   그리고 system-reminder·task-notification·local-command·bash-input/stdout·
//   slash-command·[Request interrupted] 등 Claude Code가 user 역할로 자동 주입한 메시지.

export interface SessionAssetMetric {
  sessionId: string;
  /** 정규화 키 'kind:name'. */
  assetKey: string;
  kind: "agent" | "skill";
  name: string;
  /** 발화가 일어난 cwd(정규화 절대경로). */
  cwd: string;
  invocationCount: number;
  /** ⚠️ reference signal — 품질 점수 아님. */
  correctionRoundtrips: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface WorkMetricScanResult {
  scannedSessions: number;
  metrics: SessionAssetMetric[];
}

export interface WorkMetricScanOptions {
  includeWorktrees?: boolean;
}

function transcriptsRoot(): string {
  return (
    process.env.OPS_CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude/projects")
  );
}

/** OpsPilot 격리 eval 실행 디렉토리 — 사람 실사용이 아님 (scan-usage 와 동일 기준). */
function isWorktreeCwd(cwd: string): boolean {
  return cwd.includes("opspilot-worktrees") || cwd.includes("-worktrees-");
}

function listJsonl(dir: string): string[] {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonl(full));
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

interface AssetInvocation {
  assetKey: string;
  kind: "agent" | "skill";
  name: string;
  cwd: string;
  ts: string;
}

/** assistant tool_use 블록에서 자산 발화를 뽑는다 (scan-usage 와 동일 규칙). */
function extractInvocations(
  line: Record<string, unknown>,
  cwd: string,
  ts: string,
): AssetInvocation[] {
  const msg = line.message as { content?: unknown } | undefined;
  const content = msg?.content;
  if (!Array.isArray(content)) return [];
  const out: AssetInvocation[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as {
      type?: string;
      name?: string;
      input?: Record<string, unknown>;
    };
    if (b.type !== "tool_use") continue;
    const input = b.input ?? {};
    if (b.name === "Skill") {
      const name = typeof input.skill === "string" ? input.skill : null;
      if (name) out.push({ assetKey: `skill:${name}`, kind: "skill", name, cwd, ts });
    } else if (b.name === "Agent" || b.name === "Task") {
      const name =
        typeof input.subagent_type === "string" ? input.subagent_type : null;
      if (name) out.push({ assetKey: `agent:${name}`, kind: "agent", name, cwd, ts });
    }
  }
  return out;
}

/** user 라인의 텍스트 본문만 추출 (string content 또는 list 안의 text 블록). */
function userText(line: Record<string, unknown>): string {
  const msg = line.message as { content?: unknown } | undefined;
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (b && typeof b === "object") {
      const blk = b as { type?: string; text?: unknown };
      if (blk.type === "text" && typeof blk.text === "string") parts.push(blk.text);
    }
  }
  return parts.join("\n");
}

/**
 * Claude Code가 user 역할로 *자동 주입*한 메시지인지 — 사용자가 타이핑한 게 아님.
 * 실데이터에서 확인된 선행 태그/접두로 판별(전수 스캔 패턴 검증됨).
 */
function isAutoInjectedUser(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("<system-reminder>") ||
    t.startsWith("<task-notification") ||
    t.startsWith("<local-command-") ||
    t.startsWith("<command-name>") ||
    t.startsWith("<command-message>") ||
    t.startsWith("<bash-input>") ||
    t.startsWith("<bash-stdout>") ||
    t.startsWith("<bash-stderr>") ||
    t.startsWith("[Request interrupted")
  );
}

/**
 * user 라인이 "사용자가 실제로 타이핑한 메시지"인지.
 *  - content === string 또는 tool_result 없는 list → 후보 (멀티모달 text 포함)
 *  - content === list 인데 tool_result 블록 있음   → 자동(에이전트/툴 출력) → false
 *  - 본문이 비었거나 자동 주입(system-reminder 등)이면 → false
 */
function isUserTypedMessage(line: Record<string, unknown>): boolean {
  const msg = line.message as { content?: unknown } | undefined;
  const content = msg?.content;
  if (Array.isArray(content)) {
    const hasToolResult = content.some(
      (b) =>
        b &&
        typeof b === "object" &&
        (b as { type?: string }).type === "tool_result",
    );
    if (hasToolResult) return false;
  } else if (typeof content !== "string") {
    return false;
  }
  const text = userText(line);
  if (!text.trim()) return false;
  return !isAutoInjectedUser(text);
}

interface MutableMetric {
  assetKey: string;
  kind: "agent" | "skill";
  name: string;
  cwd: string;
  invocationCount: number;
  correctionRoundtrips: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

function touch(m: MutableMetric, ts: string): void {
  if (!ts) return;
  if (!m.firstSeen || ts < m.firstSeen) m.firstSeen = ts;
  if (!m.lastSeen || ts > m.lastSeen) m.lastSeen = ts;
}

/**
 * 한 세션(JSONL 파일) 1개를 순회하며 자산별 발화·정정 왕복을 집계한다.
 *
 * 정정 왕복 윈도(좁힌 정의, ADR-0001 §정정왕복 경계):
 * 자산 발화 배치가 오면 윈도를 새로 연다(직전 윈도는 닫음 — 다음 발화 경계).
 * 윈도가 열린 상태에서 **사용자가 처음 타이핑하면** 그때 열려 있던 자산(들)에
 * 정정 왕복을 1씩 가산하고 **윈도를 즉시 닫는다**(발화별 0/1). 이로써 한 발화가
 * 흡수하는 사용자 반응은 최대 1회 → corr ≤ invocationCount 보장(세션 길이 오염 차단).
 * 발화 없는 일반 assistant 응답·tool_result 자동 메시지는 윈도를 닫지 않는다
 * (발화 결과를 사용자에게 제시하기까지 보통 여러 턴이 끼므로 윈도를 유지).
 * 한 메시지가 여러 자산을 동시 발화하면(병렬 위임) 같은 윈도를 공유한다.
 */
function scanSessionFile(
  file: string,
  opts: WorkMetricScanOptions,
): SessionAssetMetric[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const byAsset = new Map<string, MutableMetric>();
  // 현재 열린 윈도에 든 자산 키 (이후 user 타이핑이 정정 왕복으로 귀속됨).
  const openWindow = new Set<string>();
  let sessionId = "";

  for (const line of text.split("\n")) {
    if (!line) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!sessionId && typeof d.sessionId === "string") sessionId = d.sessionId;
    const cwd = typeof d.cwd === "string" ? d.cwd.replace(/\/$/, "") : "";
    const ts = typeof d.timestamp === "string" ? d.timestamp : "";

    if (d.type === "assistant") {
      if (!opts.includeWorktrees && isWorktreeCwd(cwd)) continue;
      const invs = extractInvocations(d, cwd, ts);
      // 새 발화 배치가 도달 → 직전 윈도를 닫는다("다음 자산 발화" 경계, ADR-0001).
      if (invs.length > 0) openWindow.clear();
      for (const inv of invs) {
        const m =
          byAsset.get(inv.assetKey) ??
          (() => {
            const fresh: MutableMetric = {
              assetKey: inv.assetKey,
              kind: inv.kind,
              name: inv.name,
              cwd: inv.cwd,
              invocationCount: 0,
              correctionRoundtrips: 0,
              firstSeen: null,
              lastSeen: null,
            };
            byAsset.set(inv.assetKey, fresh);
            return fresh;
          })();
        m.invocationCount += 1;
        // cwd 는 마지막 발화 기준으로 유지 (보통 세션 내 동일).
        if (inv.cwd) m.cwd = inv.cwd;
        touch(m, ts);
        openWindow.add(inv.assetKey); // 윈도 열림(또는 갱신).
      }
    } else if (d.type === "user") {
      // tool_result 자동·system-reminder 등 자동 주입 제외, 사용자 타이핑만 센다.
      if (!isUserTypedMessage(d)) continue;
      if (openWindow.size === 0) continue; // 어떤 자산도 안 열려 있으면 귀속 대상 없음.
      // 발화별 0/1: 열린 자산에 1씩 가산 후 윈도를 닫는다(첫 사용자 반응만).
      for (const key of openWindow) {
        const m = byAsset.get(key);
        if (!m) continue;
        m.correctionRoundtrips += 1;
        touch(m, ts);
      }
      openWindow.clear();
    }
  }

  if (!sessionId) return [];
  return [...byAsset.values()].map((m) => ({
    sessionId,
    assetKey: m.assetKey,
    kind: m.kind,
    name: m.name,
    cwd: m.cwd,
    invocationCount: m.invocationCount,
    correctionRoundtrips: m.correctionRoundtrips,
    firstSeen: m.firstSeen,
    lastSeen: m.lastSeen,
  }));
}

/** 전수 재스캔 — 모든 세션(JSONL)을 읽어 세션×자산 작업 지표를 산출한다(멱등). */
export function scanWorkMetrics(
  opts: WorkMetricScanOptions = {},
): WorkMetricScanResult {
  const files = listJsonl(transcriptsRoot());
  const metrics: SessionAssetMetric[] = [];
  for (const file of files) {
    metrics.push(...scanSessionFile(file, opts));
  }
  return { scannedSessions: files.length, metrics };
}
