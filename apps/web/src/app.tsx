import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { useTheme } from "./lib/use-theme";
import { Dashboard } from "./domains/dashboard/components/dashboard";
import { OnboardingGuide } from "./domains/onboarding/components/onboarding-guide";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView } from "./domains/run/components/runs-view";

type Tab = "dashboard" | "registry" | "runs";

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [benchmarkRunIds, setBenchmarkRunIds] = useState<string[]>([]);
  const { theme, toggle } = useTheme();

  const handleRunCreated = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setCompareRunIds(runIds.length >= 2 ? runIds : []);
    setBenchmarkRunIds([]);
    setTab("runs");
  };
  // OPSP-31: 벤치마크는 *같은 입력 N회* 라 compare 와 의미 다름 → 별도 패널.
  const handleBenchmarkStarted = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setBenchmarkRunIds(runIds);
    setCompareRunIds([]);
    setTab("runs");
  };

  return (
    <main className="container mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">OpsPilot</h1>
          <span className="text-xs text-muted-foreground">Harness Control Plane</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
          aria-label="테마 전환"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">대시보드</TabsTrigger>
          <TabsTrigger value="registry">레지스트리</TabsTrigger>
          <TabsTrigger value="runs">실행 / 트레이스</TabsTrigger>
        </TabsList>
        <OnboardingGuide tab={tab === "dashboard" ? "registry" : tab} onSwitchTab={(t) => setTab(t)} />
        <TabsContent value="dashboard" className="mt-0">
          <Dashboard
            onSelectRun={(id) => {
              setSelectedRunId(id);
              setTab("runs");
            }}
          />
        </TabsContent>
        <TabsContent value="registry" className="mt-0">
          <RegistryView
            onRunCreated={handleRunCreated}
            onBenchmarkStarted={handleBenchmarkStarted}
          />
        </TabsContent>
        <TabsContent value="runs" className="mt-0">
          <RunsView
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
            compareRunIds={compareRunIds}
            onClearCompare={() => setCompareRunIds([])}
            benchmarkRunIds={benchmarkRunIds}
            onClearBenchmark={() => setBenchmarkRunIds([])}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
