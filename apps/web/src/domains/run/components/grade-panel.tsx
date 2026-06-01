import { Sparkles } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { InlineError, Loading } from "../../../lib/ui";
import { useGradeRun, useRun, useScores } from "../use-run";

// T4-e: LLM grader 패널 — substring 자동채점을 보강. 표면준수(단어만 언급)는 FAIL.
// 사람 평가(HumanScore)와 짝: 성공조건 → LLM 자동채점 → 사람 평가 흐름.
export function GradePanel({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const { data: scores } = useScores(runId);
  const grade = useGradeRun(runId ?? "");

  if (runId === null) return null;

  const isRunning = run?.status === "running" || run?.status === "pending";
  // 직전 채점(score llm_judge)의 요약 — 재방문 시에도 마지막 결과 맥락 보여줌.
  const judgeScores = (scores ?? []).filter((sc) => sc.scorer === "llm_judge");
  const lastJudge = judgeScores[judgeScores.length - 1];
  const result = grade.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          LLM 채점 — 표면준수 FAIL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={grade.isPending || isRunning}
            onClick={() => grade.mutate()}
            title="성공조건을 LLM 으로 채점 — 단어만 언급한 표면준수는 FAIL, assertion 변별력도 비평"
          >
            {grade.isPending ? (
              <Loading label="채점 중…" />
            ) : lastJudge || result ? (
              "다시 채점"
            ) : (
              "LLM 채점"
            )}
          </Button>
          {isRunning && (
            <span className="text-xs text-muted-foreground">실행이 끝나야 채점할 수 있어요</span>
          )}
          {!result && lastJudge && (
            <Badge variant={lastJudge.passed ? "success" : "destructive"} className="text-[10px]">
              직전 {lastJudge.passed ? "PASS" : "FAIL"}
              {lastJudge.score !== null && ` · ${lastJudge.score.toFixed(2)}`}
            </Badge>
          )}
        </div>

        {/* 직전 채점 요약 (이번 세션 결과가 아직 없을 때) */}
        {!result && lastJudge?.detail?.reason && (
          <p className="text-xs text-muted-foreground">{lastJudge.detail.reason}</p>
        )}

        {grade.isError && <InlineError error={grade.error} />}

        {/* 이번 채점 결과 — assertion 별 PASS/FAIL + 근거 + 변별력 비평 */}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={result.passed ? "success" : "destructive"}>
                {result.passed ? "PASS" : "FAIL"}
              </Badge>
              <span className="font-mono text-sm">{result.score.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">
                {result.results.filter((r) => r.passed).length}/{result.results.length} 단언 통과
              </span>
            </div>
            <ul className="space-y-1.5">
              {result.results.map((r, i) => (
                <li
                  key={i}
                  className="rounded-md border border-l-4 px-3 py-1.5 text-sm"
                  style={{ borderLeftColor: `hsl(var(--${r.passed ? "success" : "destructive"}))` }}
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      variant={r.passed ? "success" : "destructive"}
                      className="mt-0.5 shrink-0 text-[10px]"
                    >
                      {r.passed ? "PASS" : "FAIL"}
                    </Badge>
                    <div className="space-y-0.5">
                      <p>{r.assertion}</p>
                      <p className="text-xs text-muted-foreground">— {r.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {result.critique && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">변별력 비평 · </span>
                {result.critique}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
