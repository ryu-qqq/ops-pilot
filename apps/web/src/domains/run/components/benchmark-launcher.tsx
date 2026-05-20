import { useState } from "react";
import { AlertTriangle, Play, Repeat } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { EmptyState, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetScenarios } from "../../registry/use-registry";
import { useLaunchBenchmark } from "../use-run";

// OPSP-31: 같은 (자산버전 × 시나리오) 를 N회 일괄 실행해 통과율·평균·분산 측정.
// OPSP-9 회귀(N 시나리오)와 OPSP-10 비교(N 버전)의 *직교 차원* — 같은 입력 반복.

interface Props {
  assetId: string;
  assetVersionId: string;
  defaultCwd: string;
  onLaunched: (runIds: string[]) => void;
}

export function BenchmarkLauncher({
  assetId,
  assetVersionId,
  defaultCwd,
  onLaunched,
}: Props) {
  const scenarios = useAssetScenarios(assetId);
  const launch = useLaunchBenchmark();
  const [scenarioId, setScenarioId] = useState<string>("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [source, setSource] = useState<"fixture" | "local-claude">("fixture");
  const [n, setN] = useState(3);

  const list = scenarios.data ?? [];
  const canSubmit = scenarioId !== "" && n >= 1 && n <= 10;

  if (scenarios.isPending) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          <Loading label="시나리오 목록 불러오는 중…" />
        </p>
      </Card>
    );
  }
  if (list.length < 1) {
    return (
      <Card className="p-4">
        <EmptyState
          title="벤치마크 돌릴 시나리오가 없습니다"
          hint="먼저 ‘이 버전으로 시나리오 실행’ 폼으로 시나리오를 만들어 두세요. 그러면 같은 (자산버전 × 시나리오)를 N회 돌려 분산을 측정할 수 있습니다."
        />
      </Card>
    );
  }

  return (
    <Card className="border-purple/40 bg-purple/5">
      <CardHeader className="border-b border-purple/20">
        <CardTitle className="flex items-center gap-2 text-base text-purple-foreground">
          <Repeat className="h-4 w-4 text-purple" />
          <span className="text-foreground">벤치마크 (이 버전 × 1 시나리오 × N회)</span>
          <InfoMark
            label="벤치마크 N회"
            help="비결정 자산(local-claude)이 같은 입력에 얼마나 일관되게 작동하는지 통과율·평균·표준편차로 측정합니다."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">시나리오</span>
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— 선택 —</option>
            {list.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">N</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={n}
              onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">(1~10 · N=1은 단일 실행)</span>
          </label>
        </div>
        {source === "local-claude" && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              <strong>비용 경고</strong>: local-claude 로 N={n}회 = 실 Claude 호출 {n}회. 시나리오 한
              번 실행과 비교해 토큰·시간이 {n}배.
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t border-purple/20 pt-3">
        <Input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          className="flex-1 font-mono text-xs"
        />
        <RadioGroup
          value={source}
          onValueChange={(v) => setSource(v as "fixture" | "local-claude")}
          className="ml-2 mr-2 flex items-center gap-3"
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
              { assetVersionId, scenarioId, cwd, source, n },
              { onSuccess: (res) => onLaunched(res.runs.map((r) => r.id)) },
            )
          }
        >
          {launch.isPending ? (
            <Loading label={`${String(n)}회 벤치마크 시작 중…`} />
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              {`${String(n)}회 벤치마크 실행`}
            </>
          )}
        </Button>
        {launch.isError && <InlineError error={launch.error} />}
      </CardFooter>
    </Card>
  );
}
