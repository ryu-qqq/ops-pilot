import type { AssetGraph } from "@opspilot/shared-types";
import { listAssetsWithLatestContent } from "./repository.js";

// 자산 관계(참조) 그래프 빌더.
//
// 휴리스틱: 자산 A 의 최신 본문 안에 같은 프로젝트의 다른 등록 자산 B 의 name 이
// "단어경계 정확일치(대소문자 구분)" 로 등장하면 edge A→B(참조) 로 본다.
//
// 한계(정직하게):
// - 본문 언급 ≠ 실제 호출 보장. 그래서 "참조(reference)" 로만 라벨한다.
// - 짧은 이름(예: "adr", "run") 은 흔한 영어 단어/식별자와 충돌해 false positive 가능.
//   단어경계로 부분일치는 막지만 "run a test" 같은 자연어 문장의 "run" 까지는 못 거른다.
//   백틱/따옴표/경로로 감싸진 경우만 받는 방식은 SKILL.md 본문이 에이전트명을
//   그냥 평문으로 언급(확인됨)하므로 너무 보수적 → 누락 위험. 단어경계+정확일치를 기본값으로 둔다.
// - 자기 참조 제외. 외부/빌트인 이름은 같은 프로젝트 등록 자산이 아니면 매칭 안 됨.

// 정규식 특수문자 이스케이프 (자산명에 -, . 등이 들어갈 수 있음).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 단어경계 매칭용 정규식. 자산명은 보통 kebab-case(work-evaluator) — 양끝에 \w·-
// 부정look(a)round 를 걸어 "work-evaluator-x" 같은 더 긴 이름의 부분일치를 거른다.
function nameRegExp(name: string): RegExp {
  return new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`);
}

export function buildAssetGraph(projectId: string): AssetGraph {
  const assets = listAssetsWithLatestContent(projectId);

  // 이름별 정규식을 1회만 컴파일(루프 안에서 n²번 new RegExp 방지 — asset-graph 는
  // 동기 라우트라 자산이 많아지면 이벤트 루프를 잡을 수 있다).
  const nameRes = assets.map((b) => nameRegExp(b.name));

  // references[i] = 자산 i 가 부르는 자산들. 인덱스 기반으로 모은 뒤 역방향을 채운다.
  const refs: { kind: string; name: string }[][] = assets.map(() => []);
  const referencedBy: { kind: string; name: string }[][] = assets.map(() => []);

  for (let i = 0; i < assets.length; i += 1) {
    const a = assets[i];
    if (!a) continue;
    for (let j = 0; j < assets.length; j += 1) {
      if (i === j) continue; // 자기 참조 제외
      const b = assets[j];
      if (!b) continue;
      if (nameRes[j]?.test(a.content)) {
        refs[i]?.push({ kind: b.kind, name: b.name });
        referencedBy[j]?.push({ kind: a.kind, name: a.name });
      }
    }
  }

  return {
    items: assets.map((a, i) => ({
      kind: a.kind as AssetGraph["items"][number]["kind"],
      name: a.name,
      references: (refs[i] ?? []) as AssetGraph["items"][number]["references"],
      referencedBy: (referencedBy[i] ??
        []) as AssetGraph["items"][number]["referencedBy"],
    })),
  };
}
