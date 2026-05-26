import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GitCommitConfig {
  requireTicket: boolean;
  ticketSource: "notion-task-id" | "jira-key" | "literal";
  ticketPrefix: string;
  requireOnIngest: boolean;
}

const DEFAULT_CONFIG: GitCommitConfig = {
  requireTicket: false,
  ticketSource: "notion-task-id",
  ticketPrefix: "",
  requireOnIngest: false,
};

const TYPES = "feat|fix|docs|refactor|test|chore|ops";

function pickYamlScalar(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`^  ${key}:\\s*(.+)$`, "m"));
  if (!m?.[1]) return undefined;
  const raw = m[1].trim();
  if (raw === "true") return "true";
  if (raw === "false") return "false";
  if (raw === "[]") return "";
  return raw.replace(/^["']|["']$/g, "");
}

/** `.claude/project.yaml` → git.commit (경량 파서). */
export function readGitCommitConfig(clonePath: string): GitCommitConfig {
  const yamlPath = join(clonePath, ".claude/project.yaml");
  if (!existsSync(yamlPath)) return DEFAULT_CONFIG;
  const text = readFileSync(yamlPath, "utf8");
  const block = text.match(/git:\s*\n(?: {2}commit:\s*\n)?((?: {4}.+\n?)+)/);
  if (!block?.[1]) return DEFAULT_CONFIG;

  const inner = block[1].replace(/^ {4}/gm, "  ");
  const requireTicket = pickYamlScalar(inner, "requireTicket") === "true";
  const requireOnIngest = pickYamlScalar(inner, "requireOnIngest") === "true";
  const ticketSourceRaw = pickYamlScalar(inner, "ticketSource") ?? "notion-task-id";
  const ticketSource =
    ticketSourceRaw === "jira-key" || ticketSourceRaw === "literal"
      ? ticketSourceRaw
      : "notion-task-id";
  const ticketPrefix = pickYamlScalar(inner, "ticketPrefix") ?? "";

  return { requireTicket, ticketSource, ticketPrefix, requireOnIngest };
}

function ticketPattern(cfg: GitCommitConfig): string {
  switch (cfg.ticketSource) {
    case "jira-key":
      return "[A-Z][A-Z0-9]+-\\d+";
    case "literal": {
      const prefix = cfg.ticketPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return prefix ? `${prefix}-\\d+` : "[A-Z][A-Z0-9]+-\\d+";
    }
    default:
      return "TASK-\\d+";
  }
}

/** Harness 커밋(ops(...))은 ingest 검증에서 제외. */
export function isOpsPilotHarnessSubject(subject: string): boolean {
  return /^ops\([^)]+\):/.test(subject.trim());
}

/** commit-format.md + project.yaml 기준 subject 검증. */
export function validateCommitSubject(subject: string, cfg: GitCommitConfig): string | null {
  const s = subject.trim();
  if (s === "") return "commit subject가 비어 있습니다";
  if (isOpsPilotHarnessSubject(s)) return null;

  if (!cfg.requireTicket && !cfg.requireOnIngest) return null;

  const ticket = ticketPattern(cfg);
  const re = new RegExp(
    `^(${TYPES})(\\([a-z0-9._-]+\\))?: (${ticket}) .+`,
    "i",
  );
  if (!re.test(s)) {
    const example =
      cfg.ticketSource === "literal" && cfg.ticketPrefix
        ? `docs(platform): ${cfg.ticketPrefix}-123 한 줄 요약`
        : cfg.ticketSource === "jira-key"
          ? "fix(api): OPSP-14 ingest subject 검증"
          : "feat(scope): TASK-42 한 줄 요약";
    return `commit subject가 convention과 맞지 않습니다. 예: ${example} — references/conventions/commit-format.md`;
  }
  return null;
}

export function assertCommitSubjectForIngest(
  clonePath: string,
  subject: string,
): string | null {
  const cfg = readGitCommitConfig(clonePath);
  if (!cfg.requireOnIngest) return null;
  return validateCommitSubject(subject, { ...cfg, requireTicket: true });
}
