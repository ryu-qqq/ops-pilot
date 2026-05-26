import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./lib/use-theme";
import { FeedbackView } from "./domains/feedback/components/feedback-view";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView, type RunViewMode } from "./domains/run/components/runs-view";
import { SettingsDialog } from "./domains/settings/components/settings-dialog";
import { WorkflowGuide } from "./components/workflow-guide";

type Tab = "feedback" | "runs" | "registry";

export function App() {
  const [tab, setTab] = useState<Tab>("feedback");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [benchmarkRunIds, setBenchmarkRunIds] = useState<string[]>([]);
  const [runViewMode, setRunViewMode] = useState<RunViewMode>("graph");
  const { theme, toggle } = useTheme();

  const handleRunCreated = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setCompareRunIds(runIds.length >= 2 ? runIds : []);
    setBenchmarkRunIds([]);
    setRunViewMode("list");
    setTab("runs");
  };

  const handleBenchmarkStarted = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setBenchmarkRunIds(runIds);
    setCompareRunIds([]);
    setRunViewMode("list");
    setTab("runs");
  };

  const handleOpenEvalRun = (runId: string) => {
    setSelectedRunId(runId);
    setCompareRunIds([]);
    setBenchmarkRunIds([]);
    setRunViewMode("graph");
    setTab("runs");
  };

  return (
    <TooltipProvider delayDuration={200}>
    <main className="container mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">OpsPilot</h1>
          <span className="text-xs text-muted-foreground">피드백 · eval · HITL</span>
        </div>
        <div className="flex items-center gap-1">
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
          <TabsTrigger value="feedback">피드백</TabsTrigger>
          <TabsTrigger value="runs">실행 / 트레이스</TabsTrigger>
          <TabsTrigger value="registry">프로젝트</TabsTrigger>
        </TabsList>
        <WorkflowGuide tab={tab} />
        <TabsContent value="feedback" className="mt-0">
          <FeedbackView onOpenEvalRun={handleOpenEvalRun} />
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
        <TabsContent value="registry" className="mt-0">
          <RegistryView
            onRunCreated={handleRunCreated}
            onBenchmarkStarted={handleBenchmarkStarted}
          />
        </TabsContent>
      </Tabs>
    </main>
    </TooltipProvider>
  );
}
