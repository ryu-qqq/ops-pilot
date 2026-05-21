import { useState } from "react";
import { Lightbulb, Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { useTheme } from "./lib/use-theme";
import { Dashboard } from "./domains/dashboard/components/dashboard";
import { OnboardingGuide } from "./domains/onboarding/components/onboarding-guide";
import { useOnboardingDismissed } from "./domains/onboarding/use-onboarding";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView, type RunViewMode } from "./domains/run/components/runs-view";
import { SettingsDialog } from "./domains/settings/components/settings-dialog";

type Tab = "dashboard" | "registry" | "runs";

export function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [benchmarkRunIds, setBenchmarkRunIds] = useState<string[]>([]);
  // OPSP-37 (2): "실행" 탭 안의 트레이스 리스트 ⇄ 흐름 그래프 뷰.
  const [runViewMode, setRunViewMode] = useState<RunViewMode>("list");
  const { theme, toggle } = useTheme();
  // OPSP-38 (1): 가이드 보기 버튼을 헤더로 — 테마 토글과 한 줄 정렬.
  const { dismissed, reopen } = useOnboardingDismissed();

  const handleRunCreated = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setCompareRunIds(runIds.length >= 2 ? runIds : []);
    setBenchmarkRunIds([]);
    setRunViewMode("list");
    setTab("runs");
  };
  // OPSP-31: 벤치마크는 *같은 입력 N회* 라 compare 와 의미 다름 → 별도 패널.
  const handleBenchmarkStarted = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setBenchmarkRunIds(runIds);
    setCompareRunIds([]);
    setRunViewMode("list");
    setTab("runs");
  };
  // OPSP-37 (2): 대시보드 점 클릭 → "실행" 탭 + 흐름 그래프 모드.
  const handleSelectRunToGraph = (id: string) => {
    setSelectedRunId(id);
    setRunViewMode("graph");
    setTab("runs");
  };

  return (
    <main className="container mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">OpsPilot</h1>
          <span className="text-xs text-muted-foreground">Harness Control Plane</span>
        </div>
        <div className="flex items-center gap-1">
          {dismissed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reopen}
              className="text-xs text-muted-foreground"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              가이드 보기
            </Button>
          )}
          <SettingsDialog />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            title={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
            aria-label="테마 전환"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">대시보드</TabsTrigger>
          <TabsTrigger value="registry">레지스트리</TabsTrigger>
          <TabsTrigger value="runs">실행</TabsTrigger>
        </TabsList>
        <OnboardingGuide
          tab={tab === "dashboard" ? "registry" : tab}
          onSwitchTab={(t) => setTab(t)}
        />
        <TabsContent value="dashboard" className="mt-0">
          <Dashboard onSelectRun={handleSelectRunToGraph} />
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
            viewMode={runViewMode}
            onViewModeChange={setRunViewMode}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
