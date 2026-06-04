import { type Dirent, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 로컬 Claude Code transcript(~/.claude/projects/**/*.jsonl)를 스캔해
// 스킬·에이전트 자산이 "실제로" 몇 번 호출됐는지 집계한다.
//   - 스킬   : assistant tool_use name="Skill",        input.skill
//   - 에이전트: assistant tool_use name="Agent"|"Task", input.subagent_type
// OpsPilot 평가 실행(worktree)은 사람 실사용이 아니므로 기본 제외.

export interface UsageStat {
  count: number;
  firstUsed: string | null;
  lastUsed: string | null;
  /** cwd(작업 디렉토리) 절대경로별 호출 횟수·마지막 사용 — 프로젝트별 분해용. */
  byCwd: Record<string, { count: number; lastUsed: string | null }>;
  /** 일별(YYYY-MM-DD, ts 앞 10자) 호출 횟수 — 스파크라인·활동 잔디용. */
  byDay: Record<string, number>;
}

export interface UsageScanResult {
  scannedSessions: number;
  parsedEvents: number;
  agents: Record<string, UsageStat>;
  skills: Record<string, UsageStat>;
}

export interface ScanOptions {
  includeWorktrees?: boolean;
  /** 이 ISO 시각 이후 호출만 집계 (최근 N일 리더보드용). 미지정이면 전체 기간. */
  sinceIso?: string;
}

function transcriptsRoot(): string {
  return (
    process.env.OPS_CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude/projects")
  );
}

/** OpsPilot 격리 eval 실행 디렉토리 — 사람 실사용이 아님. */
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

function bump(stat: UsageStat, ts: string, cwd: string): void {
  stat.count += 1;
  if (ts) {
    if (!stat.lastUsed || ts > stat.lastUsed) stat.lastUsed = ts;
    if (!stat.firstUsed || ts < stat.firstUsed) stat.firstUsed = ts;
  }
  if (cwd) {
    const c = (stat.byCwd[cwd] ??= { count: 0, lastUsed: null });
    c.count += 1;
    if (ts && (!c.lastUsed || ts > c.lastUsed)) c.lastUsed = ts;
  }
  if (ts) {
    const day = ts.slice(0, 10); // YYYY-MM-DD
    stat.byDay[day] = (stat.byDay[day] ?? 0) + 1;
  }
}

function emptyStat(): UsageStat {
  return { count: 0, firstUsed: null, lastUsed: null, byCwd: {}, byDay: {} };
}

// TTL 인메모리 캐시 — /usage/assets 요청마다 ~/.claude/projects 전체 transcript를
// 파싱하던 비용(수 초)을 제거한다. transcript는 초단위로 바뀌지 않고 usage는 "참고 신호"라
// 짧은 staleness를 허용한다(주기 work-metric 스캔도 이미 staleness 전제).
// 키 = opts 전체 직렬화 → sinceIso·includeWorktrees가 다르면 캐시 분리(리더보드 vs 자산 탭 안전).
// 런타임 서버 코드이므로 Date.now() 사용 가능(스크립트 결정성 제약은 워크플로 한정).
const usageCache = new Map<string, { at: number; result: UsageScanResult }>();

function usageCacheTtlMs(): number {
  const raw = Number(process.env.OPS_USAGE_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
}

export function scanTranscriptUsage(opts: ScanOptions = {}): UsageScanResult {
  const cacheKey = JSON.stringify(opts);
  const ttl = usageCacheTtlMs();
  const cached = usageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ttl) return cached.result;

  const result = scanTranscriptUsageUncached(opts);
  usageCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

function scanTranscriptUsageUncached(opts: ScanOptions = {}): UsageScanResult {
  const files = listJsonl(transcriptsRoot());
  const agents: Record<string, UsageStat> = {};
  const skills: Record<string, UsageStat> = {};
  let parsedEvents = 0;

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.includes('"tool_use"')) continue;
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (d.type !== "assistant") continue;
      const cwd = typeof d.cwd === "string" ? d.cwd : "";
      if (!opts.includeWorktrees && isWorktreeCwd(cwd)) continue;
      const ts = typeof d.timestamp === "string" ? d.timestamp : "";
      if (opts.sinceIso && (!ts || ts < opts.sinceIso)) continue; // 기간 필터(리더보드)
      const normCwd = cwd.replace(/\/$/, "");
      const msg = d.message as { content?: unknown } | undefined;
      const content = msg?.content;
      if (!Array.isArray(content)) continue;
      parsedEvents += 1;
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
          if (!name) continue;
          bump((skills[name] ??= emptyStat()), ts, normCwd);
        } else if (b.name === "Agent" || b.name === "Task") {
          const name =
            typeof input.subagent_type === "string"
              ? input.subagent_type
              : null;
          if (!name) continue;
          bump((agents[name] ??= emptyStat()), ts, normCwd);
        }
      }
    }
  }

  return { scannedSessions: files.length, parsedEvents, agents, skills };
}
