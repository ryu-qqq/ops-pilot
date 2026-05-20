import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { OnboardingGuide } from "./domains/onboarding/components/onboarding-guide";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView } from "./domains/run/components/runs-view";

type Tab = "registry" | "runs";

export function App() {
  // 탭·선택 run 은 UI 로컬 상태 (CONVENTIONS.md 2). 서버데이터는 Query.
  const [tab, setTab] = useState<Tab>("registry");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  // OPSP-10: 비교 모드 — 동시 실행한 N개 run id. 길이 2+ 면 비교 패널 활성.
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);

  // E2E 흐름: 레지스트리에서 실행 → run 생성되면 트레이스 탭으로 자동 이동.
  // 길이 1 = 단일 실행, 2+ = 비교 모드.
  const handleRunCreated = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setCompareRunIds(runIds.length >= 2 ? runIds : []);
    setTab("runs");
  };

  return (
    <main className="container mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">OpsPilot</h1>
        <span className="text-xs text-muted-foreground">Harness Control Plane</span>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="registry">레지스트리</TabsTrigger>
          <TabsTrigger value="runs">실행 / 트레이스</TabsTrigger>
        </TabsList>
        <OnboardingGuide tab={tab} onSwitchTab={setTab} />
        <TabsContent value="registry" className="mt-0">
          <RegistryView onRunCreated={handleRunCreated} />
        </TabsContent>
        <TabsContent value="runs" className="mt-0">
          <RunsView
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
            compareRunIds={compareRunIds}
            onClearCompare={() => setCompareRunIds([])}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
