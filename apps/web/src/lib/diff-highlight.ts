/**
 * diff 한 줄을 (프리픽스 배경 클래스 + 코드 토큰 HTML)로 쪼개는 공유 헬퍼.
 *
 * work(CommitDiffView)·run(DiffView) 두 diff 뷰가 patch 줄을 똑같이 색칠하도록 한 곳에 모은다.
 * prism 은 "완전한 코드 파일"을 토큰화하지만 diff 는 줄마다 `+`/`-`/` ` 프리픽스 + 잘린 조각이라
 * 통째로 먹이면 토큰화가 깨진다. 그래서 줄 단위로: 프리픽스를 떼어 배경/색은 바깥(클래스)에서,
 * 떼어낸 코드 조각만 prism 으로 highlight 한다.
 *
 * 미지원 확장자·grammar 미로드·바이너리·빈 줄에서는 절대 깨지지 않고 plain(escape 텍스트)으로 폴백.
 */
import Prism from "prismjs";

/** 파일 확장자 → prism 언어 키. 여기 없는 확장자는 plain(폴백). */
const EXT_TO_LANG: Record<string, string> = {
  java: "java",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  md: "markdown",
  markdown: "markdown",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  jsonc: "json",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  py: "python",
  sql: "sql",
  go: "go",
  kt: "kotlin",
  kts: "kotlin",
};

/**
 * prism grammar 동적 import 로더. 정적 전량 import 는 번들을 키우므로(설계 §lazy),
 * 그 언어가 처음 필요할 때만 청크로 로드한다. prism 은 언어 간 의존이 있어(예: typescript→
 * javascript→clike, tsx→typescript+jsx) 의존을 먼저 로드해야 grammar 가 등록된다.
 *
 * Vite 가 청크를 분리할 수 있도록 import 경로는 리터럴로(동적 표현식 금지).
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  clike: () => import("prismjs/components/prism-clike"),
  javascript: () => import("prismjs/components/prism-javascript"),
  markup: () => import("prismjs/components/prism-markup"),
  java: () => import("prismjs/components/prism-java"),
  typescript: () => import("prismjs/components/prism-typescript"),
  jsx: () => import("prismjs/components/prism-jsx"),
  tsx: () => import("prismjs/components/prism-tsx"),
  markdown: () => import("prismjs/components/prism-markdown"),
  yaml: () => import("prismjs/components/prism-yaml"),
  json: () => import("prismjs/components/prism-json"),
  bash: () => import("prismjs/components/prism-bash"),
  css: () => import("prismjs/components/prism-css"),
  python: () => import("prismjs/components/prism-python"),
  sql: () => import("prismjs/components/prism-sql"),
  go: () => import("prismjs/components/prism-go"),
  kotlin: () => import("prismjs/components/prism-kotlin"),
};

/** 각 언어가 먼저 등록돼야 하는 선행 grammar(prism 내부 의존). */
const DEPS: Record<string, string[]> = {
  java: ["clike"],
  kotlin: ["clike"],
  go: ["clike"],
  typescript: ["javascript"],
  javascript: ["clike"],
  jsx: ["javascript", "markup"],
  tsx: ["jsx", "typescript"],
  markdown: ["markup"],
  css: ["markup"],
};

/** 이미 로드(또는 로드 중)인 언어 — 중복 import 방지. */
const loaded = new Map<string, Promise<void>>();

/** clike 등 일부는 javascript 가 끌어오므로 동적 import 만으로 등록되지만, 명시 의존을 먼저 보장한다. */
async function loadOne(lang: string): Promise<void> {
  const existing = loaded.get(lang);
  if (existing !== undefined) return existing;
  const loader = LOADERS[lang];
  if (loader === undefined) {
    loaded.set(lang, Promise.resolve());
    return;
  }
  const p = (async () => {
    for (const dep of DEPS[lang] ?? []) await loadOne(dep);
    await loader();
  })();
  loaded.set(lang, p);
  return p;
}

/** 경로 확장자 → prism 언어 키(미지원/확장자 없음이면 null = plain). */
export function langForPath(path: string): string | null {
  // rename 표시("a → b")면 도착 경로 기준.
  const target = path.includes(" → ") ? (path.split(" → ").pop() ?? path) : path;
  const base = target.slice(target.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null; // 확장자 없음/도트파일.
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

/**
 * 한 파일에 필요한 grammar 를 lazy 로드. 로드 완료되면 resolve — 호출부가 리렌더해 highlight 를 반영.
 * 미지원/로드 실패는 조용히 무시(plain 유지) — diff 가 깨지면 안 되므로.
 */
export async function ensureLang(lang: string | null): Promise<void> {
  if (lang === null) return;
  try {
    await loadOne(lang);
  } catch {
    // 로드 실패 시 plain 폴백. 콘솔 소음 없이 무시.
  }
}

/** grammar 가 실제로 등록됐는지(로드 완료 + Prism.languages 에 존재). */
export function isLangReady(lang: string | null): boolean {
  return lang !== null && Object.prototype.hasOwnProperty.call(Prism.languages, lang);
}

/** diff 줄의 종류 — 프리픽스/헤더 판별 결과. */
export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "context";

const META_PREFIXES = [
  "diff --git",
  "index ",
  "--- ",
  "+++ ",
  "new file",
  "deleted file",
  "rename ",
  "copy ",
  "similarity ",
  "dissimilarity ",
  "old mode",
  "new mode",
  "Binary files",
  "GIT binary patch",
];

/** 한 줄의 종류를 판정. `+++`/`---` 파일 헤더는 +/- 색칠보다 먼저 meta 로 걸러야 한다. */
export function classifyDiffLine(line: string): DiffLineKind {
  for (const p of META_PREFIXES) {
    if (line.startsWith(p)) return "meta";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

/**
 * 코드 조각을 prism HTML 로 토큰화. grammar 미로드/plain 이면 escape 한 텍스트 그대로 반환.
 * 반환 HTML 은 prism 이 escape 하므로 dangerouslySetInnerHTML 로 안전하게 꽂을 수 있다.
 */
export function highlightCode(code: string, lang: string | null): string {
  if (code === "") return "";
  if (lang !== null) {
    const grammar = Prism.languages[lang];
    if (grammar !== undefined) {
      try {
        return Prism.highlight(code, grammar, lang);
      } catch {
        // 토큰화 실패 시 plain.
      }
    }
  }
  return escapeHtml(code);
}

/** prism 미사용(plain) 경로용 HTML escape — `<`,`>`,`&` 만으로 충분(텍스트 노드). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * diff 한 줄을 렌더 데이터로 분해.
 * - `kind`: 줄 배경/색 클래스 결정용.
 * - `prefix`: 프리픽스 문자(`+`/`-`) — highlight 대상에서 빼고 그대로 둔다.
 * - `html`: 코드 부분의 prism HTML(또는 escape 텍스트). meta/hunk 줄은 highlight 없이 escape.
 */
export interface DiffLineParts {
  kind: DiffLineKind;
  prefix: string;
  html: string;
}

export function splitDiffLine(line: string, lang: string | null): DiffLineParts {
  const kind = classifyDiffLine(line);
  // 코드 줄(add/del/context)만 프리픽스를 떼고 코드 부분을 highlight.
  if (kind === "add" || kind === "del") {
    const prefix = line.slice(0, 1);
    const code = line.slice(1);
    return { kind, prefix, html: highlightCode(code, lang) };
  }
  if (kind === "context") {
    // 컨텍스트 줄도 보통 맨 앞 공백 프리픽스. 있으면 떼고, 없으면(빈 줄) 그대로.
    const prefix = line.startsWith(" ") ? " " : "";
    const code = prefix === " " ? line.slice(1) : line;
    return { kind, prefix, html: highlightCode(code, lang) };
  }
  // meta/hunk — highlight 없이 escape(헤더는 muted/primary 클래스로 충분).
  return { kind, prefix: "", html: escapeHtml(line) };
}
