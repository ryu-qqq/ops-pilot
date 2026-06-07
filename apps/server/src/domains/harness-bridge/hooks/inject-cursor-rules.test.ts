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

  it("**/ 는 디렉터리 0개(루트 파일)도 잡는다", () => {
    expect(globToRegExp("**/*.md").test("README.md")).toBe(true); // 0 dir
    expect(globToRegExp("**/*.md").test("a/b/c.md")).toBe(true); // 깊은 dir
    expect(globToRegExp("apps/**/*.ts").test("apps/x.ts")).toBe(true); // 중간 0 dir
    expect(globToRegExp("apps/**/*.ts").test("apps/a/b.ts")).toBe(true);
    expect(globToRegExp("apps/**/*.ts").test("other/x.ts")).toBe(false);
  });

  it("dir/** 는 그 디렉터리 통째를 잡고 형제는 안 잡는다", () => {
    expect(globToRegExp("src/**").test("src/a/b.ts")).toBe(true);
    expect(globToRegExp("src/**").test("src/x.ts")).toBe(true);
    expect(globToRegExp("src/**").test("srcfile.ts")).toBe(false);
  });

  it("단일 * 는 한 세그먼트만 (하위 디렉터리 안 넘음)", () => {
    expect(globToRegExp("routes/*.ts").test("routes/x.ts")).toBe(true);
    expect(globToRegExp("routes/*.ts").test("routes/api/x.ts")).toBe(false);
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
