import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandHome } from "./service.js";

// 등록 폼에 `~/foo` 를 넣으면 `.../apps/server/~/foo` 로 깨지던 버그 회귀 방지.
describe("expandHome", () => {
  it("`~` 단독을 홈 디렉터리로 확장한다", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("`~/foo` 를 홈 기준 경로로 확장한다", () => {
    expect(expandHome("~/platform-gitops")).toBe(join(homedir(), "platform-gitops"));
  });

  it("절대경로는 그대로 둔다", () => {
    expect(expandHome("/abs/path")).toBe("/abs/path");
  });

  it("상대경로는 그대로 둔다(resolve 단계에서 처리)", () => {
    expect(expandHome("./rel")).toBe("./rel");
  });

  it("`~foo`(슬래시 없는 ~) 는 확장하지 않는다", () => {
    expect(expandHome("~foo")).toBe("~foo");
  });
});
