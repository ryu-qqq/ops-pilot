import { useState } from "react";
import { Play, Target } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { EmptyState, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetScenarios } from "../../registry/use-registry";
import { useLaunchBatchScenarios } from "../use-run";

interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runIds: string[]) => void;
}

export function RegressionLauncher({ assetId, assetVersionId, defaultCwd, onLaunched }: Props) {
  const scenarios = useAssetScenarios(assetId);
  const launch = useLaunchBatchScenarios();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cwd, setCwd] = useState(defaultCwd);
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");

  const list = scenarios.data ?? [];
  const count = selected.size;
  const canSubmit = count >= 2 && count <= 10;

  if (scenarios.isPending) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          <Loading label="시나리오 목록 불러오는 중…" />
        </p>
      </Card>
    );
  }
  if (list.length < 2) {
    return (
      <Card className="p-4">
        <EmptyState
          title="회귀 셋 만들려면 시나리오가 2개 이상 필요해요"
          hint="위의 ‘이 버전으로 시나리오 실행’ 폼으로 시나리오를 만들고 실행해 두세요. 그러면 여기서 다중 선택해 한 번에 회귀할 수 있습니다."
        />
      </Card>
    );
  }

  return (
    <Card className="border-success/40 bg-success/5">
      <CardHeader className="border-b border-success/20">
        <CardTitle className="flex items-center gap-2 text-base text-success-foreground">
          <Target className="h-4 w-4 text-success" />
          <span className="text-foreground">회귀 셋 (이 버전 × N 시나리오 일괄)</span>
          <InfoMark
            label="회귀 셋"
            help="누적된 시나리오 중 N개(2~10)를 골라 같은 자산 버전으로 한 번에 돌립니다."
          />
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            선택: {count} / 10
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        <div className="max-h-36 space-y-1 overflow-y-auto pr-2">
          {list.map((sc) => {
            const checked = selected.has(sc.id);
            return (
              <label
                key={sc.id}
                className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-accent/50"
              >
                <Checkbox
                  checked={checked}
                  disabled={!checked && count >= 10}
                  onCheckedChange={(c) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (c === true) next.add(sc.id);
                      else next.delete(sc.id);
                      return next;
                    });
                  }}
                />
                <span className="flex-1 truncate">{sc.name}</span>
                {sc.description !== null && (
                  <span className="text-xs text-muted-foreground">
                    — {sc.description.slice(0, 40)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {count > 0 && count < 2 && (
          <p className="text-xs text-warning">최소 2개 선택해야 회귀 의미가 있어요.</p>
        )}
      </CardContent>
      <CardFooter className="border-t border-success/20 pt-3">
        <Input value={cwd} onChange={(e) => setCwd(e.target.value)} className="flex-1 font-mono text-xs" />
        <RadioGroup
          value={source}
          onValueChange={(v) => setSource(v as "fixture" | "local-claude")}
          className="flex items-center gap-3 ml-2 mr-2"
        >
          <label className="flex items-center gap-1 text-xs">
            <RadioGroupItem value="fixture" />
            fixture
          </label>
          <label className="flex items-center gap-1 text-xs">
            <RadioGroupItem value="local-claude" />
            local-claude
          </label>
        </RadioGroup>
        <Button
          type="button"
          disabled={launch.isPending || !canSubmit}
          onClick={() =>
            launch.mutate(
              { assetVersionId, scenarioIds: [...selected], cwd, source },
              { onSuccess: (res) => onLaunched(res.runs.map((r) => r.id)) },
            )
          }
        >
          {launch.isPending ? (
            <Loading label={`${String(count)}개 회귀 실행 중…`} />
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              {`${String(count)} 시나리오 일괄 실행`}
            </>
          )}
        </Button>
        {launch.isError && <InlineError error={launch.error} />}
      </CardFooter>
    </Card>
  );
}
