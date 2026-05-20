import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { useTheme } from "./lib/use-theme";
import { OnboardingGuide } from "./domains/onboarding/components/onboarding-guide";
import { RegistryView } from "./domains/registry/components/registry-view";
import { RunsView } from "./domains/run/components/runs-view";

type Tab = "registry" | "runs";

export function App() {
  const [tab, setTab] = useState<Tab>("registry");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const { theme, toggle } = useTheme();

  const handleRunCreated = (runIds: string[]) => {
    setSelectedRunId(runIds[0] ?? null);
    setCompareRunIds(runIds.length >= 2 ? runIds : []);
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
