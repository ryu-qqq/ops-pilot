/**
 * 커밋 메타(날짜·저자) 한 줄 표시 문자열을 만든다. 형식 `2026-06-08 · 홍길동`.
 * - 날짜는 ISO 문자열 앞 10자(YYYY-MM-DD)만 — 프로젝트 date 표시 관례(slice(0,10)) 따름.
 * - 둘 중 하나만 있으면 그것만, 둘 다 없으면 null(호출부에서 줄 자체를 생략).
 * 옛 ingest 는 commitDate/commitAuthor 가 null/undefined → graceful 하게 생략된다.
 */
export function formatCommitMeta(
  commitDate: string | null | undefined,
  commitAuthor: string | null | undefined,
): string | null {
  const date =
    commitDate != null && commitDate.trim() !== "" ? commitDate.slice(0, 10) : null;
  const author =
    commitAuthor != null && commitAuthor.trim() !== "" ? commitAuthor : null;
  if (date !== null && author !== null) return `${date} · ${author}`;
  return date ?? author;
}
