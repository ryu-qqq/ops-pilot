/**
 * patch 본문을 prism 문법 강조로 렌더하는 공유 컴포넌트.
 *
 * work(CommitDiffView)·run(DiffView) 두 diff 뷰가 똑같이 보이도록 patch 줄 렌더를 한 곳에 모은다.
 * 한 줄을 받아 [프리픽스 배경 클래스] + [코드 토큰 노드]로 렌더한다 — 프리픽스(`+`/`-`)와
 * +/- 배경은 바깥에서 유지하고, 코드 부분에만 prism 토큰 색을 얹는다(설계 §까다로운 지점).
 *
 * grammar 는 lazy 로드 — 파일을 열 때 그 언어 청크만 동적 import 하고, 로드 완료되면 리렌더해
 * highlight 를 반영한다. 미지원 확장자·로드 실패·바이너리·빈 patch 에서는 plain 으로 깨짐 없이 폴백.
 */
import { useEffect, useState } from "react";

import {
  ensureLang,
  isLangReady,
  langForPath,
  splitDiffLine,
  type DiffLineKind,
} from "./diff-highlight";
import { cn } from "./utils";

/** 줄 종류별 배경/색 클래스 — 기존 diffLineClass/patchLineClass 와 동일한 토큰만 사용. */
const KIND_CLASS: Record<DiffLineKind, string> = {
  add: "bg-success/15",
  del: "bg-destructive/15",
  hunk: "text-primary",
  meta: "font-semibold text-muted-foreground",
  context: "",
};

interface PatchLinesProps {
  /** 선택 파일의 전체 patch 텍스트. */
  patch: string;
  /** 파일 경로 — 확장자로 prism 언어를 정한다. 미지원/없으면 plain. */
  filePath: string;
}

/**
 * patch 를 줄 단위로 prism highlight 해 렌더. `<pre>` 컨테이너는 호출부가 감싼다고 가정하지 않고
 * 여기서 함께 렌더(두 뷰의 기존 `<pre className="bg-muted/50 …">` 를 대체).
 */
export function PatchLines({ patch, filePath }: PatchLinesProps) {
  const lang = langForPath(filePath);
  // grammar 로드 완료를 트리거로 리렌더 — 로드되면 highlight 가 반영된다.
  const [ready, setReady] = useState(() => isLangReady(lang));

  useEffect(() => {
    let alive = true;
    if (lang === null) {
      setReady(false);
      return;
    }
    setReady(isLangReady(lang));
    if (!isLangReady(lang)) {
      void ensureLang(lang).then(() => {
        if (alive) setReady(isLangReady(lang));
      });
    }
    return () => {
      alive = false;
    };
  }, [lang]);

  // ready 가 false 면 plain(null lang 으로 escape 텍스트), true 면 prism 토큰.
  const effectiveLang = ready ? lang : null;

  return (
    <pre className="prism-diff bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
      {patch.split("\n").map((line, i) => {
        const { kind, prefix, html } = splitDiffLine(line, effectiveLang);
        return (
          <div key={i} className={cn(KIND_CLASS[kind])}>
            {prefix !== "" && <span className="select-none text-muted-foreground">{prefix}</span>}
            {/* 코드 부분 — prism 이 escape 한 HTML 만 주입(설계 §테마)이라 안전. 빈 줄은 높이 유지용 공백. */}
            <span dangerouslySetInnerHTML={{ __html: html === "" && prefix === "" ? " " : html }} />
          </div>
        );
      })}
    </pre>
  );
}
