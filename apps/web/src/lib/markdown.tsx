import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// 자산 본문(마크다운) 렌더 — @tailwindcss/typography 없이 요소별 클래스만 매핑(의존성 최소).
// raw HTML 은 react-markdown 기본값대로 렌더하지 않는다(XSS 안전).
const components: Components = {
  h1: ({ node: _n, ...p }) => <h1 className="mb-2 mt-4 text-base font-semibold" {...p} />,
  h2: ({ node: _n, ...p }) => <h2 className="mb-2 mt-4 text-sm font-semibold" {...p} />,
  h3: ({ node: _n, ...p }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold text-muted-foreground" {...p} />
  ),
  h4: ({ node: _n, ...p }) => <h4 className="mb-1 mt-3 text-xs font-semibold" {...p} />,
  p: ({ node: _n, ...p }) => <p className="my-2 leading-relaxed" {...p} />,
  ul: ({ node: _n, ...p }) => <ul className="my-2 ml-4 list-disc space-y-1" {...p} />,
  ol: ({ node: _n, ...p }) => <ol className="my-2 ml-4 list-decimal space-y-1" {...p} />,
  li: ({ node: _n, ...p }) => <li className="leading-relaxed" {...p} />,
  a: ({ node: _n, ...p }) => (
    <a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />
  ),
  pre: ({ node: _n, ...p }) => (
    <pre className="my-2 overflow-x-auto rounded bg-muted p-3 text-xs leading-relaxed" {...p} />
  ),
  // inline code 만 배경. pre(블록) 안의 code 는 부모 pre 가 배경을 담당하므로 중립 처리.
  code: ({ node: _n, className, ...p }) =>
    className?.includes("language-") ? (
      <code className="font-mono" {...p} />
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...p} />
    ),
  blockquote: ({ node: _n, ...p }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground" {...p} />
  ),
  table: ({ node: _n, ...p }) => (
    <table className="my-2 w-full border-collapse text-xs" {...p} />
  ),
  th: ({ node: _n, ...p }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold" {...p} />
  ),
  td: ({ node: _n, ...p }) => <td className="border border-border px-2 py-1" {...p} />,
  hr: ({ node: _n, ...p }) => <hr className="my-3 border-border" {...p} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
