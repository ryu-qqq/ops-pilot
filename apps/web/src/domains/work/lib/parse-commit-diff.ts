/**
 * 통짜 unified diff(`git diff`/`git show` 출력) 한 덩어리를 파일별 청크로 쪼갠다.
 * CommitDiffView 를 run 도메인 DiffView 와 같은 2-pane(파일 목록 + 선택 파일 patch)으로
 * 만들기 위한 순수 파싱 — run 뷰는 API가 파일별 구조화 데이터를 주지만, 커밋 diff 는
 * 통짜 문자열이라 프론트에서 잘라야 한다. 새 라이브러리 없이 순수 JS 로 방어적으로 파싱한다.
 *
 * 청크 경계 = `diff --git ` 헤더. 한 파일 patch = 그 헤더부터 다음 `diff --git` 직전까지.
 * 바이너리·mode-only·rename 등 비정형 헤더도 깨지지 않고 그 파일을 합리적으로 표시한다.
 */
export interface CommitDiffFile {
  /** 선택 상태 키 — 청크 인덱스 기반(경로 중복/빈 경로에도 안정적). */
  id: string;
  /** 표시용 파일 경로(rename 이면 `old → new`, 추출 실패 시 "(알 수 없음)"). */
  filePath: string;
  /** 본문에서 센 추가 줄 수(`+` 시작, `+++` 헤더 제외). */
  additions: number;
  /** 본문에서 센 삭제 줄 수(`-` 시작, `---` 헤더 제외). */
  deletions: number;
  /** 이 파일의 전체 patch 텍스트(`diff --git` 헤더 포함). */
  patch: string;
  /** `Binary files … differ` 가 있으면 true — patch 본문 색칠 대신 안내. */
  binary: boolean;
}

/** `diff --git a/<path> b/<path>` 헤더에서 a/b 경로를 뽑는다(공백 포함 경로는 best-effort). */
function parseGitHeaderPaths(line: string): { a: string; b: string } | null {
  // `diff --git a/foo b/foo` — 따옴표 경로/공백은 흔치 않아 단순 정규식으로 충분.
  const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
  if (m === null) return null;
  const a = m[1];
  const b = m[2];
  if (a === undefined || b === undefined) return null;
  return { a, b };
}

/** `+++ b/<path>` 또는 `--- a/<path>` 에서 경로를 뽑는다(`/dev/null` 은 null). */
function parseMarkerPath(line: string): string | null {
  const rest = line.slice(4).trim();
  if (rest === "/dev/null") return null;
  if (rest.startsWith("a/") || rest.startsWith("b/")) return rest.slice(2);
  return rest;
}

/** 한 청크(문자열 배열)에서 표시 경로를 best-effort 로 결정한다. */
function resolveFilePath(lines: string[]): string {
  const header = lines[0] ?? "";
  const gitPaths = parseGitHeaderPaths(header);

  // +++ / --- 마커에서 실제 신/구 경로를 본다(rename·new·deleted 더 정확).
  let plus: string | null = null;
  let minus: string | null = null;
  for (const line of lines) {
    if (line.startsWith("+++ ")) plus = parseMarkerPath(line);
    else if (line.startsWith("--- ")) minus = parseMarkerPath(line);
    if (line.startsWith("@@")) break; // hunk 시작 전까지만 헤더.
  }

  // rename 이면 양쪽 경로가 다름 → "old → new".
  if (gitPaths !== null) {
    if (gitPaths.a !== gitPaths.b) return `${gitPaths.a} → ${gitPaths.b}`;
    return gitPaths.b;
  }
  // diff --git 추출 실패 시 마커 폴백.
  if (plus !== null) return plus;
  if (minus !== null) return minus;
  return "(알 수 없음)";
}

/** 한 청크의 +/- 본문 줄 수와 바이너리 여부를 센다. */
function countChanges(lines: string[]): { additions: number; deletions: number; binary: boolean } {
  let additions = 0;
  let deletions = 0;
  let binary = false;
  for (const line of lines) {
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      binary = true;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue; // 파일 헤더 제외.
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions, binary };
}

/**
 * 통짜 diff 를 파일별 청크 배열로 파싱한다.
 * - `diff --git` 헤더가 없는 비정형 입력이면 전체를 한 파일(`(알 수 없음)`)로 본다.
 * - 빈 입력이면 빈 배열(호출부에서 EmptyState 처리).
 */
export function parseCommitDiff(diffSummary: string): CommitDiffFile[] {
  if (diffSummary === "") return [];

  const allLines = diffSummary.split("\n");

  // `diff --git` 으로 시작하는 줄 인덱스 = 청크 경계.
  const boundaries: number[] = [];
  allLines.forEach((line, i) => {
    if (line.startsWith("diff --git ")) boundaries.push(i);
  });

  // 헤더가 하나도 없으면 전체를 한 청크로(방어).
  if (boundaries.length === 0) {
    const { additions, deletions, binary } = countChanges(allLines);
    return [
      {
        id: "0",
        filePath: resolveFilePath(allLines),
        additions,
        deletions,
        patch: diffSummary,
        binary,
      },
    ];
  }

  return boundaries.map((start, idx) => {
    const end = boundaries[idx + 1] ?? allLines.length;
    const chunk = allLines.slice(start, end);
    const { additions, deletions, binary } = countChanges(chunk);
    return {
      id: String(idx),
      filePath: resolveFilePath(chunk),
      additions,
      deletions,
      // 끝 청크가 아니면 split 으로 잃은 줄바꿈을 복원해 patch 가 끊기지 않게.
      patch: chunk.join("\n"),
      binary,
    };
  });
}
