import { useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { InlineError, Loading } from "../../../lib/ui";
import { useCreateHumanScore, useScores } from "../use-run";

export function HumanScore({ runId }: { runId: string | null }) {
  const { data: scores } = useScores(runId);
  const create = useCreateHumanScore(runId ?? "");
  const [passed, setPassed] = useState(true);
  const [score, setScore] = useState("0.8");
  const [reason, setReason] = useState("");

  if (runId === null) return null;
  const humanScores = (scores ?? []).filter((sc) => sc.scorer === "human");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">사람 평가</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {humanScores.length > 0 && (
          <ul className="space-y-1.5">
            {humanScores.map((sc) => (
              <li
                key={sc.id}
                className="rounded-md border border-l-4 px-3 py-1.5 text-sm"
                style={{ borderLeftColor: `hsl(var(--${sc.passed ? "success" : "destructive"}))` }}
              >
                <Badge variant={sc.passed ? "success" : "destructive"} className="text-[10px]">
                  {sc.passed ? "PASS" : "FAIL"}
                </Badge>
                {sc.score !== null && <span className="ml-2 font-mono">{sc.score.toFixed(2)}</span>}
                {sc.detail?.reason && (
                  <span className="ml-2 text-muted-foreground">— {sc.detail.reason}</span>
                )}
                <span className="ml-2 text-xs text-muted-foreground">
                  · {sc.createdAt.slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(score);
            create.mutate(
              {
                runId,
                passed,
                score: score.trim() === "" || Number.isNaN(n) ? null : n,
                reason: reason.trim() === "" ? null : reason,
              },
              { onSuccess: () => setReason("") },
            );
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={passed}
              onCheckedChange={(c) => setPassed(c === true)}
            />
            통과
          </label>
          <div className="space-y-1">
            <Label className="text-xs">점수</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="w-20"
            />
          </div>
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs">이유 (성공조건 대비)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="왜 이 점수인가"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loading label="저장 중…" /> : "평가 저장"}
          </Button>
          {create.isError && <InlineError error={create.error} />}
        </form>
      </CardContent>
    </Card>
  );
}
