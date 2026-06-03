import { useMemo, useState } from "react";
import { GitCompare, Play, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Textarea } from "../../../components/ui/textarea";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { ScenarioImport } from "../../integration/components/scenario-import";
import { useAssetVersions } from "../../registry/use-registry";
import {
  useGenerateScenarioAb,
  useGenerateScenarioAbRun,
  useLaunchBatchRun,
  useLaunchRun,
  useSuggestScenario,
} from "../use-run";

// OPSP-43: 시나리오 출처 — 직접 작성 / 지라에서 / 노션에서.
type ScenarioSource = "manual" | "jira" | "notion";

interface Props {
  assetId: string;
  assetVersionId: string;
  onLaunched: (runIds: string[]) => void;
}

export function RunLauncher({ assetId, assetVersionId, onLaunched }: Props) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [input, setInput] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [successText, setSuccessText] = useState("");
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");
  const [hint, setHint] = useState("");
  const [scenarioSource, setScenarioSource] = useState<ScenarioSource>("manual");
  const [compare, setCompare] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(() => new Set([assetVersionId]));
  const launch = useLaunchRun();
  const launchBatch = useLaunchBatchRun();
  const suggest = useSuggestScenario();
  const generateAb = useGenerateScenarioAb();
  const generateAbRun = useGenerateScenarioAbRun();
  const versions = useAssetVersions(assetId);

  const versionList = versions.data ?? [];
  const compareList = useMemo(() => [...compareIds], [compareIds]);
  const compareCount = compareList.length;
  const isPending = launch.isPending || launchBatch.isPending;
  const launchError = launch.error ?? launchBatch.error;
  const isError = launch.isError || launchBatch.isError;

  const canSubmit =
    name.trim() !== "" &&
    input.trim() !== "" &&
    (!compare || (compareCount >= 2 && compareCount <= 5));

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const successCriteria = successText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "");
          if (compare) {
            launchBatch.mutate(
              {
                assetId,
                assetVersionIds: compareList,
                source,
                name,
                purpose,
                input,
                expectedBehavior,
                successCriteria,
              },
              { onSuccess: (res) => onLaunched(res.runs.map((r) => r.id)) },
            );
          } else {
            launch.mutate(
              { assetId, assetVersionId, source, name, purpose, input, expectedBehavior, successCriteria },
              { onSuccess: (run) => onLaunched([run.id]) },
            );
          }
        }}
      >
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            이 버전으로 시나리오 실행
            <InfoMark
              label="시나리오 실행"
              help="선택한 버전의 git 커밋으로 격리 worktree 를 만들고 그 안에서 에이전트를 돌립니다. 실행은 비동기 — 즉시 트레이스 탭으로 이동하고, 단계가 실시간으로 채워집니다."
            />
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {/* OPSP-43: 시나리오 출처 — 직접 작성 / 지라에서 / 노션에서 */}
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label className="flex items-center gap-1">
              시나리오 출처
              <InfoMark
                label="시나리오 출처"
                help="직접 작성하거나, 지라 이슈·노션 페이지를 가져와 폼을 채울 수 있습니다. 실제 업무를 그대로 시나리오로 — 제목이 이름, 본문이 입력이 됩니다. 성공조건은 비워둡니다(실제 업무는 키워드 채점이 부적합 — 사람 점수·LLM 판정으로 평가)."
              />
            </Label>
            <RadioGroup
              value={scenarioSource}
              onValueChange={(v) => setScenarioSource(v as ScenarioSource)}
              className="flex items-center gap-4"
            >
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="manual" />
                직접 작성
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="jira" />
                지라에서
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="notion" />
                노션에서
              </label>
            </RadioGroup>
          </div>

          {/* 지라/노션 import — 선택 시 name·input 폼을 채운다(assertion 은 비움) */}
          {scenarioSource !== "manual" && (
            <ScenarioImport
              source={scenarioSource}
              onImport={(importedName, importedInput) => {
                setName(importedName);
                setInput(importedInput);
              }}
            />
          )}

          {/* OPSP-27 B: AI 시나리오 초안 — 직접 작성 모드에서만 */}
          {scenarioSource === "manual" && (
          <Alert variant="info">
            <Sparkles className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-1">
              AI 시나리오 초안
              <InfoMark
                label="AI 시나리오 초안"
                help="이 자산의 본문을 Claude 가 읽고 시나리오 5필드 초안을 폼에 자동 채워줍니다. 실 토큰 ~10-40초."
              />
            </AlertTitle>
            <AlertDescription className="space-y-2 pt-2">
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="(선택) 어떤 상황을 검증하고 싶나"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={suggest.isPending}
                  onClick={() =>
                    suggest.mutate(
                      { assetId, hint: hint.trim() === "" ? undefined : hint.trim() },
                      {
                        onSuccess: (sg) => {
                          setName(sg.name);
                          setPurpose(sg.purpose);
                          setInput(sg.input);
                          setExpectedBehavior(sg.expectedBehavior);
                          setSuccessText(sg.successCriteria.join("\n"));
                        },
                      },
                    )
                  }
                >
                  {suggest.isPending ? <Loading label="Claude 초안 생성 중…" /> : "초안 생성 → 폼 채움"}
                </Button>
                {suggest.isSuccess && (
                  <span className="text-xs text-success">초안 적용됨 — 다듬어 실행하세요</span>
                )}
                {suggest.isError && <InlineError error={suggest.error} />}
              </div>
              {/* ADR 0003 Follow-up #2: A/B 산출(생성만) vs A/B 측정(생성→실행→비교) */}
              <div className="flex flex-wrap items-center gap-2 border-t border-info/30 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={generateAb.isPending || generateAbRun.isPending}
                  onClick={() =>
                    generateAb.mutate({
                      assetId,
                      hint: hint.trim() === "" ? undefined : hint.trim(),
                    })
                  }
                >
                  {generateAb.isPending ? (
                    <Loading label="asset·baked 산출 중…" />
                  ) : (
                    "A/B 산출 (생성만)"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={generateAb.isPending || generateAbRun.isPending}
                  onClick={() =>
                    generateAbRun.mutate(
                      {
                        assetId,
                        assetVersionId,
                        hint: hint.trim() === "" ? undefined : hint.trim(),
                        source,
                      },
                      {
                        onSuccess: (res) => onLaunched([res.assetRunId, res.bakedRunId]),
                      },
                    )
                  }
                >
                  {generateAbRun.isPending ? (
                    <Loading label="생성→실행 중…" />
                  ) : (
                    "A/B 측정 (생성→실행→비교)"
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {source === "local-claude"
                    ? "생성 실토큰 ×2 + 실행 실토큰 ×2 (local-claude). 측정은 비교 뷰로 바로 점프합니다."
                    : "생성 실토큰 ×2 (실행은 fixture라 토큰0). 측정은 비교 뷰로 바로 점프합니다."}
                </span>
                {generateAb.isSuccess && (
                  <span className="text-xs text-success">
                    asset·baked 시나리오 2개 생성됨 — 둘 다 실행하면 source별로 비교됩니다.
                  </span>
                )}
                {generateAb.isError && <InlineError error={generateAb.error} />}
                {generateAbRun.isError && <InlineError error={generateAbRun.error} />}
              </div>
            </AlertDescription>
          </Alert>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>
                시나리오 이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 큰 코드베이스에서 X 찾기"
              />
            </div>
            <div className="space-y-1">
              <Label>목적 — 무엇을 검증하나</Label>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="예: 불필요한 툴 호출 없이 정답을 찾는가"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>
              입력 — 에이전트에 줄 지시 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="구체적으로. 예: src/ 에서 결제 검증 로직 위치를 찾아 함수명을 답하라"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>기대 동작 (judge 기준)</Label>
            <Textarea
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              rows={2}
              placeholder="예: Grep 으로 좁힌 뒤 해당 파일만 Read, 추측 금지"
            />
          </div>
          <div className="space-y-1">
            <Label>성공조건 — 한 줄에 하나 (결정론 체크)</Label>
            <Textarea
              value={successText}
              onChange={(e) => setSuccessText(e.target.value)}
              rows={3}
              placeholder={"정답 함수명이 응답에 포함\nGrep 호출 3회 이하\n파일 수정 0건"}
              className="font-mono"
            />
          </div>
          {/* OPSP-10: 비교 모드 */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={compare}
                onCheckedChange={(v) => setCompare(v === true)}
              />
              <GitCompare className="h-4 w-4 text-muted-foreground" />
              버전 비교 모드 (2~5개 버전을 같은 시나리오로 동시 실행)
              <InfoMark
                label="버전 비교"
                help="같은 자산의 여러 버전을 한 시나리오로 한 번에 돌려, 컬럼별로 나란히 비교합니다."
              />
            </label>
            {compare && (
              <div className="space-y-2 pl-6">
                <div className="text-xs text-muted-foreground">
                  실행할 버전 ({compareCount} / 5)
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto pr-2">
                  {versionList.length === 0 && (
                    <p className="text-sm text-muted-foreground">버전이 없습니다.</p>
                  )}
                  {versionList.map((v) => {
                    const checked = compareIds.has(v.id);
                    return (
                      <label
                        key={v.id}
                        className="flex items-center gap-2 text-xs hover:bg-accent/50 rounded p-1"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!checked && compareCount >= 5}
                          onCheckedChange={(c) => {
                            setCompareIds((prev) => {
                              const next = new Set(prev);
                              if (c === true) next.add(v.id);
                              else next.delete(v.id);
                              return next;
                            });
                          }}
                        />
                        <code className="font-mono">{v.gitCommit.slice(0, 8)}</code>
                        <span className="text-muted-foreground">{v.committedAt.slice(0, 10)}</span>
                        <span className="flex-1 truncate">{v.commitMessage ?? "(no message)"}</span>
                      </label>
                    );
                  })}
                </div>
                {compareCount < 2 && (
                  <p className="text-xs text-warning">최소 2개 선택해야 비교 의미가 있어요.</p>
                )}
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="border-t pt-3">
          <RadioGroup
            value={source}
            onValueChange={(v) => setSource(v as "fixture" | "local-claude")}
            className="flex items-center gap-4"
          >
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value="fixture" />
              fixture (토큰0)
              <InfoMark
                label="fixture 소스"
                help="결정론적 가짜 트레이스 — 실 토큰 0. UI 흐름 검증용."
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value="local-claude" />
              local-claude
              <InfoMark
                label="local-claude 소스"
                help="로컬 claude CLI 를 격리 worktree 에서 spawn. 실 토큰 소비."
              />
            </label>
          </RadioGroup>
          <div className="ml-auto flex items-center gap-3">
            {isError && launchError !== null && <InlineError error={launchError} />}
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? (
                <Loading label={compare ? `${String(compareCount)}개 실행 중…` : "실행 중…"} />
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  {compare ? `${String(compareCount)}개 버전 동시 실행` : "실행"}
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
