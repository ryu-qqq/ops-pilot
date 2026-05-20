import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { useRun, useScenario } from "../use-run";

export function ScenarioPanel({ runId }: { runId: string | null }) {
  const { data: run } = useRun(runId);
  const { data: scenario, isPending } = useScenario(run?.scenarioId);

  if (runId === null) return null;
  if (isPending || !scenario) return null;

  const assertions = scenario.expectation.assertions ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          시나리오: <span className="font-normal text-muted-foreground">{scenario.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {scenario.description && (
          <div>
            <b className="text-xs uppercase tracking-wider text-muted-foreground">목적</b>
            <p>{scenario.description}</p>
          </div>
        )}
        <div>
          <b className="text-xs uppercase tracking-wider text-muted-foreground">입력</b>
          <p className="font-mono text-xs">{scenario.input}</p>
        </div>
        {scenario.expectation.judge && (
          <div>
            <b className="text-xs uppercase tracking-wider text-muted-foreground">기대 동작</b>
            <p>{scenario.expectation.judge}</p>
          </div>
        )}
        {assertions.length > 0 && (
          <div>
            <b className="text-xs uppercase tracking-wider text-muted-foreground">성공조건</b>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              {assertions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
