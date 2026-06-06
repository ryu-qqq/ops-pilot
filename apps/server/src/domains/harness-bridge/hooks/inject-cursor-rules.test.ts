import { describe, it, expect } from "vitest";
import {
  parseGlobs,
  parseFrontmatter,
  globToRegExp,
  ruleMatchesPath,
  renderPostTool,
  renderSessionStart,
} from "./inject-cursor-rules.mjs";

describe("parseGlobs", () => {
  it("배열·콤마·빈 표기를 모두 글롭 배열로", () => {
    expect(parseGlobs('["**/*.md", "**/README*"]')).toEqual(["**/*.md", "**/README*"]);
    expect(parseGlobs("apps/web/**/*.ts,apps/web/**/*.tsx")).toEqual([
      "apps/web/**/*.ts",
      "apps/web/**/*.tsx",
    ]);
    expect(parseGlobs("")).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  it("globs·alwaysApply·description 를 뽑고 본문을 분리", () => {
    const { data, body } = parseFrontmatter(
      '---\ndescription: 톤 규칙\nalwaysApply: false\nglobs: ["**/*.md"]\n---\n본문줄1\n본문줄2\n',
    );
    expect(data.alwaysApply).toBe(false);
    expect(data.description).toBe("톤 규칙");
    expect(data.globs).toEqual(["**/*.md"]);
    expect(body).toBe("본문줄1\n본문줄2");
  });
});

describe("globToRegExp / ruleMatchesPath", () => {
  it("** 와 {ts,tsx} 를 처리한다", () => {
    expect(globToRegExp("apps/server/src/routes/**/*.ts").test("apps/server/src/routes/api/x.ts")).toBe(true);
    expect(globToRegExp("apps/server/src/routes/**/*.ts").test("apps/web/x.ts")).toBe(false);
    expect(globToRegExp("apps/web/src/**/*.{ts,tsx}").test("apps/web/src/a/b.tsx")).toBe(true);
    expect(ruleMatchesPath(["**/*.md"], "docs/x.md")).toBe(true);
    expect(ruleMatchesPath(["**/*.md"], "src/x.ts")).toBe(false);
  });
});

describe("renderPostTool", () => {
  it("매칭되는 글롭 룰만 본문으로, 없으면 null", () => {
    const rules = [
      { name: "a.mdc", globs: ["apps/server/src/routes/**/*.ts"], alwaysApply: false, description: "", body: "라우트 규칙" },
      { name: "b.mdc", globs: ["**/*.md"], alwaysApply: false, description: "", body: "문서 규칙" },
    ];
    const out = renderPostTool(rules, "apps/server/src/routes/api/x.ts");
    expect(out).toContain("a.mdc");
    expect(out).toContain("라우트 규칙");
    expect(out).not.toContain("문서 규칙");
    expect(renderPostTool(rules, "src/nomatch.json")).toBeNull();
  });
});

describe("renderSessionStart", () => {
  it("상시 룰은 본문, 글롭 룰은 색인", () => {
    const rules = [
      { name: "always.mdc", globs: [], alwaysApply: true, description: "필수", body: "항상 지켜" },
      { name: "g.mdc", globs: ["**/*.ts"], alwaysApply: false, description: "타입 규칙", body: "본문" },
    ];
    const out = renderSessionStart(rules);
    expect(out).toContain("항상 지켜");
    expect(out).toContain("g.mdc");
    expect(out).toContain("타입 규칙");
    expect(out).not.toContain("본문"); // 글롭 룰 본문은 색인엔 안 들어감
  });
});
