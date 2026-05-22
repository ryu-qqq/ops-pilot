import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { InlineError, Loading } from "../../../lib/ui";
import { useRun, useSetRunRetro } from "../use-run";

// OPSP-46: run 회고 메모 — 점수와 별개로 "왜 이렇게 됐나" 를 자유 서술.
// 강제 아님(선택). 누적된 "왜" 가 나중에 wiki 지식 축적의 연료가 된다.
export function RunRetro({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const save = useSetRunRetro(runId ?? "");
  const saved = run?.retro ?? "";
  const [text, setText] = useState(saved);
  // run 이 바뀌거나 저장 후 갱신되면 textarea 를 서버 값과 동기화.
  useEffect(() => {
    setText(saved);
  }, [saved]);

  if (runId === null) return null;
  const dirty = text !== saved;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">회고 메모</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          이 실행을 두고 남길 “왜” — 선택 사항입니다. 점수만 매겨도 됩니다.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="예: 이 버전은 Grep 을 덜 쓰고 바로 정답 파일로 갔다 — 절차 이해가 나아짐"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(text)}
          >
            {save.isPending ? <Loading label="저장 중…" /> : "메모 저장"}
          </Button>
          {!dirty && saved !== "" && <span className="text-xs text-success">저장됨</span>}
          {save.isError && <InlineError error={save.error} />}
        </div>
      </CardContent>
    </Card>
  );
}
