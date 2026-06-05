import { Badge } from "../../../components/ui/badge";
import { EmptyState } from "../../../lib/ui";
import { cn } from "../../../lib/utils";

/**
 * 통짜 unified diff 한 줄의 종류를 색칠 클래스로 매핑.
 * DiffView(run 도메인)의 patchLineClass 톤을 따른다 — 하드코딩 hex 금지, CSS 변수 토큰만.
 * 파일/메타 헤더는 한 흐름의 구분선 역할이라 굵게(muted), hunk 헤더는 primary 강조.
 */
function diffLineClass(line: string): string {
  // 파일·메타 헤더(diff --git / index / 모드 / --- / +++) — 회색 굵게.
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("rename ") ||
    line.startsWith("similarity ") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode")
  ) {
    return "font-semibold text-muted-foreground";
  }
  // hunk 헤더(@@ … @@) — 청록/강조.
  if (line.startsWith("@@")) return "text-primary";
  // 추가(+) — 단, +++ 파일 헤더는 위에서 이미 처리됨.
  if (line.startsWith("+")) return "bg-success/15 text-success";
  // 삭제(-) — --- 헤더는 위에서 처리됨.
  if (line.startsWith("-")) return "bg-destructive/15 text-destructive";
  // 문맥·그 외 — 기본 muted.
  return "text-muted-foreground";
}

interface Props {
  /** `git diff gitRef^..gitRef`(루트커밋이면 `git show`)의 통짜 unified diff. 빈 문자열이면 변경 없음. */
  diffSummary: string;
  /** true면 256KB 초과로 diff가 일부만 수집됨. */
  truncated?: boolean;
}

/**
 * 커밋의 실제 변경 diff(통짜 unified diff 문자열)를 가볍게 색칠해 한 흐름으로 렌더.
 * work-evaluator의 worktree diff(DiffView)가 아니라, ingest된 그 커밋이 실제로 무엇을
 * 바꿨는지를 보여준다 — diff는 이미 ingest 상세(diffSummary)로 내려온다(API 추가 없음).
 */
export function CommitDiffView({ diffSummary, truncated = false }: Props) {
  // 빈 문자열 = 실제 변경 없음(빈/머지 커밋). 수집 실패가 아니다 —
  // 백엔드 apps/server/src/domains/feedback/service.ts 에서 collectCommitDiff 실패 시
  // throw new FeedbackIngestError("InvalidGitRef") 로 ingest 자체가 실패하므로,
  // 수집 실패는 애초에 빈 diffSummary 로 내려오지 않는다(여기까지 도달하지 못함).
  // → 이 불변식(수집 실패는 ingest에서 차단)을 깨뜨리는 백엔드 변경이 있으면
  //   빈 문자열의 의미가 달라지니 이 분기도 함께 손봐야 한다.
  if (diffSummary === "") {
    return (
      <EmptyState
        title="이 커밋은 변경 없음"
        hint="빈 커밋이거나 머지 커밋이라 diff가 비어 있습니다. (수집 실패가 아니라 실제로 바뀐 파일이 없는 경우입니다.)"
      />
    );
  }

  const lines = diffSummary.split("\n");

  return (
    <div className="space-y-2">
      {truncated && (
        <Badge variant="warning" title="256KB를 초과해 diff의 일부만 표시됩니다">
          256KB 초과 — 일부만 표시
        </Badge>
      )}
      <div className="overflow-auto rounded-md border">
        <pre className="bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            <div key={i} className={cn(diffLineClass(line))}>
              {line === "" ? " " : line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
