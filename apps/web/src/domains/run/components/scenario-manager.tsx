import { useState } from "react";
import { AlertTriangle, ListChecks, Pencil, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { EmptyState, InfoMark, InlineError, Loading } from "../../../lib/ui";
import type { ScenarioWithCounts } from "../api";
import { useDeleteScenario, useScenariosForAsset, useUpdateScenario } from "../use-run";

// OPSP-34: 자산별 시나리오 보기·수정·삭제 패널.
// immutable 원칙 깨짐 경고는 편집 dialog 안에 명시. 삭제 dialog 는 cascade 영향 보여줌.

interface Props {
  assetId: string;
}

export function ScenarioManager({ assetId }: Props) {
  const list = useScenariosForAsset(assetId);
  const [editing, setEditing] = useState<ScenarioWithCounts | null>(null);
  const [deleting, setDeleting] = useState<ScenarioWithCounts | null>(null);

  if (list.isPending) {
    return (
      <Card>
        <CardContent className="p-4">
          <Loading label="시나리오 목록 불러오는 중…" />
        </CardContent>
      </Card>
    );
  }
  if (list.isError) return <InlineError error={list.error} />;
  const scenarios = list.data ?? [];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          시나리오 ({scenarios.length})
          <InfoMark
            label="시나리오 관리"
            help="이 자산용 시나리오의 본문·단언·LLM 판정 기준을 보고, 잘못 만든 게 있으면 수정·삭제할 수 있습니다. 단 수정은 과거 run 의 평가 의미를 바꾸고, 삭제는 관련 run·trace·score 까지 cascade 로 같이 지웁니다."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {scenarios.length === 0 ? (
          <EmptyState
            title="이 자산에 등록된 시나리오가 없습니다"
            hint="아래 ‘이 버전으로 시나리오 실행’ 폼으로 시나리오를 만들고 한 번 실행해 두면 여기 나타납니다."
          />
        ) : (
          <Accordion type="multiple" className="w-full">
            {scenarios.map((sc) => (
              <AccordionItem key={sc.id} value={sc.id}>
                <AccordionTrigger>
                  <div className="flex flex-1 items-center gap-2 pr-3 text-left">
                    <span className="flex-1 truncate font-medium">{sc.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      run {sc.runCount}
                    </Badge>
                    {sc.description !== null && sc.description !== "" && (
                      <span className="hidden text-xs text-muted-foreground md:inline">
                        — {sc.description.slice(0, 60)}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 px-1 pb-2">
                    {sc.description !== null && sc.description !== "" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">설명</Label>
                        <p className="text-sm">{sc.description}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">input (에이전트에 줄 prompt)</Label>
                      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2 font-mono text-xs">
                        {sc.input}
                      </pre>
                    </div>
                    {sc.expectation.assertions && sc.expectation.assertions.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          assertions (응답에 포함돼야 할 키워드)
                        </Label>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sc.expectation.assertions.map((a, i) => (
                            <Badge key={i} variant="secondary" className="font-mono text-xs">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {sc.expectation.judge !== undefined && sc.expectation.judge !== "" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">judge (LLM 판정 기준)</Label>
                        <p className="text-sm">{sc.expectation.judge}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {sc.id.slice(0, 8)} · {sc.createdAt.slice(0, 10)}
                      </span>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(sc)}>
                          <Pencil className="h-3 w-3" />
                          수정
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleting(sc)}
                        >
                          <Trash2 className="h-3 w-3" />
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      {editing !== null && <EditDialog scenario={editing} onClose={() => setEditing(null)} />}
      {deleting !== null && <DeleteDialog scenario={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}

function EditDialog({ scenario, onClose }: { scenario: ScenarioWithCounts; onClose: () => void }) {
  const update = useUpdateScenario();
  const [name, setName] = useState(scenario.name);
  const [description, setDescription] = useState(scenario.description ?? "");
  const [input, setInput] = useState(scenario.input);
  const [assertionsText, setAssertionsText] = useState(
    (scenario.expectation.assertions ?? []).join("\n"),
  );
  const [judge, setJudge] = useState(scenario.expectation.judge ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>시나리오 수정 — {scenario.name}</DialogTitle>
        </DialogHeader>
        {scenario.runCount > 0 && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>과거 run {scenario.runCount}개의 평가 기준이 바뀝니다</AlertTitle>
            <AlertDescription>
              이 시나리오를 입력으로 만들어진 run 의 단언·판정 의미가 *수정된 본문 기준*으로 재해석됩니다.
              과거 결과 비교 의미가 흐려지면 새 시나리오로 만드는 게 안전합니다.
            </AlertDescription>
          </Alert>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const assertions = assertionsText
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s !== "");
            update.mutate(
              {
                id: scenario.id,
                patch: {
                  name,
                  description: description.trim() === "" ? null : description,
                  input,
                  expectation: {
                    assertions: assertions.length > 0 ? assertions : undefined,
                    judge: judge.trim() === "" ? undefined : judge,
                  },
                },
              },
              { onSuccess: onClose },
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="sc-name">이름</Label>
            <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-desc">설명 (선택)</Label>
            <Input id="sc-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-input">input (에이전트에 줄 prompt)</Label>
            <Textarea
              id="sc-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-40 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-assert">assertions (한 줄에 키워드 1개)</Label>
            <Textarea
              id="sc-assert"
              value={assertionsText}
              onChange={(e) => setAssertionsText(e.target.value)}
              className="min-h-24 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-judge">judge (LLM 판정 기준 · 선택)</Label>
            <Textarea
              id="sc-judge"
              value={judge}
              onChange={(e) => setJudge(e.target.value)}
              className="min-h-16 text-sm"
            />
          </div>
          {update.isError && <InlineError error={update.error} />}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={update.isPending || input.trim() === "" || name.trim() === ""}>
              {update.isPending ? <Loading label="저장 중…" /> : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  scenario,
  onClose,
}: {
  scenario: ScenarioWithCounts;
  onClose: () => void;
}) {
  const del = useDeleteScenario();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            시나리오 삭제 — {scenario.name}
          </DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">되돌릴 수 없습니다.</p>
            <p className="mt-1 text-sm">
              이 시나리오와 그 시나리오로 만들어진 **run {scenario.runCount}개** (+ 관련 trace·score) 가
              cascade 로 함께 삭제됩니다.
            </p>
          </AlertDescription>
        </Alert>
        {del.isError && <InlineError error={del.error} />}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={del.isPending}
            onClick={() => del.mutate(scenario.id, { onSuccess: onClose })}
          >
            {del.isPending ? <Loading label="삭제 중…" /> : `${scenario.runCount}개 run과 함께 삭제`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
