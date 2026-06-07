// 타입 선언 — 자기완결 .mjs 훅의 순수 함수 export 를 테스트·서버에서 타입 안전하게 import.
export interface CursorRule {
  name: string;
  globs: string[];
  alwaysApply: boolean;
  description: string;
  body: string;
}

export function parseGlobs(val: string): string[];
export function parseFrontmatter(text: string): {
  data: { globs: string[]; alwaysApply: boolean; description: string };
  body: string;
};
export function globToRegExp(glob: string): RegExp;
export function ruleMatchesPath(globs: string[], relPath: string): boolean;
export function loadRules(projectRoot: string): CursorRule[];
export function renderPostTool(rules: CursorRule[], relPath: string): string | null;
export function renderSessionStart(rules: CursorRule[]): string | null;
export function main(): void;
