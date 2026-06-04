import { Compass, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TooltipProvider } from "./components/ui/tooltip";
import { useTheme } from "./lib/use-theme";
import { usePersistedState } from "./lib/use-persisted-state";
import { OverviewView } from "./domains/registry/components/overview-view";
import { RegistryView } from "./domains/registry/components/registry-view";
import { WorkListView } from "./domains/work/components/work-list-view";
import type { WorkSelection } from "./domains/work/types";
import { SettingsDialog } from "./domains/settings/components/settings-dialog";
import { InfoDialog } from "./components/overview-info-dialog";
import { ServerHealthIndicator } from "./components/server-health-indicator";
import { type Tab, VALID_TABS } from "./app-tabs";
import { useIngests } from "./domains/feedback/use-feedback";
import { useTour } from "./domains/onboarding/use-tour";
import { TourOverlay } from "./domains/onboarding/tour-overlay";

export function App() {
  const [tabRaw, setTab] = usePersistedState<Tab>("opspilot.tab.v3", "overview");
  const tab = VALID_TABS.includes(tabRaw) ? tabRaw : "overview";
  const [projectId, setProjectId] = usePersistedState<string | null>("opspilot.projectId", null);
  const [workSelection, setWorkSelection] = usePersistedState<WorkSelection>(
    "opspilot.work.selection",
    null,
  );
  // 비교·벤치마크 다중 run 진입점(★결정1: 유지 + 작업 목록 상단 보조 진입점).
  // 영속할 필요 없는 일시 상태 — 작업 목록 상단 패널 표시 여부만 좌우한다.
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [benchmarkRunIds, setBenchmarkRunIds] = useState<string[]>([]);
  const { theme, toggle } = useTheme();

  // 가이드 투어 — 상세 단계(needsSelection)에서 첫 작업을 자동 선택하기 위해 첫 ingest id 를 조회.
  // useIngests 는 진행 중 ingest 가 있을 때만 폴링하고 work 탭과 같은 쿼리 키라 중복 요청은 dedupe 된다.
  const { data: tourIngests } = useIngests(projectId);
  const firstWorkId = tourIngests?.[0]?.id ?? null;
  const tour = useTour({
    onTab: (t) => setTab(t),
    onSelection: (needs) => {
      if (needs && firstWorkId != null) setWorkSelection({ kind: "ingest", id: firstWorkId });
      else setWorkSelection(null);
    },
  });

  // run 생성: 2개 이상이면 비교 패널, 단일이면 그 run 드릴다운. 항상 벤치마크는 해제.
  const handleRunCreated = (runIds: string[]) => {
    setBenchmarkRunIds([]);
    if (runIds.length >= 2) {
      setCompareRunIds(runIds);
      setWorkSelection(null);
    } else {
      setCompareRunIds([]);
      setWorkSelection(runIds[0] != null ? { kind: "run", id: runIds[0] } : null);
    }
    setTab("work");
  };

  // 벤치마크: N회 run 묶음을 작업 목록 상단 벤치마크 패널로. 비교·드릴다운은 해제.
  const handleBenchmarkStarted = (runIds: string[]) => {
    setBenchmarkRunIds(runIds);
    setCompareRunIds([]);
    setWorkSelection(null);
    setTab("work");
  };

  return (
    <TooltipProvider delayDuration={200}>
    <main className="container mx-auto max-w-[1200px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">OpsPilot</h1>
          <span className="text-xs text-muted-foreground">사용량 · eval · HITL</span>
        </div>
        <div className="flex items-center gap-1">
          <ServerHealthIndicator />
          <InfoDialog tab={tab} />
          <Button
            variant={tour.active ? "default" : "ghost"}
            size="icon"
            onClick={tour.toggle}
            title="가이드 투어"
            aria-label="가이드 투어"
          >
            <Compass className="h-4 w-4" />
          </Button>
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
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="registry">프로젝트</TabsTrigger>
          <TabsTrigger value="work">작업</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" forceMount className="mt-0 data-[state=inactive]:hidden">
          <OverviewView
            projectId={projectId}
            onProjectIdChange={setProjectId}
            onOpenProjectTab={() => setTab("registry")}
          />
        </TabsContent>
        <TabsContent value="registry" forceMount className="mt-0 data-[state=inactive]:hidden">
          <RegistryView
            projectId={projectId}
            onProjectIdChange={setProjectId}
            onRunCreated={handleRunCreated}
            onBenchmarkStarted={handleBenchmarkStarted}
          />
        </TabsContent>
        <TabsContent value="work" forceMount className="mt-0 data-[state=inactive]:hidden">
          <WorkListView
            projectId={projectId}
            onProjectIdChange={setProjectId}
            selection={workSelection}
            onSelect={setWorkSelection}
            compareRunIds={compareRunIds}
            benchmarkRunIds={benchmarkRunIds}
            onClearCompare={() => setCompareRunIds([])}
            onClearBenchmark={() => setBenchmarkRunIds([])}
          />
        </TabsContent>
      </Tabs>
      <TourOverlay
        active={tour.active}
        step={tour.step}
        stepIndex={tour.stepIndex}
        total={tour.total}
        onNext={tour.next}
        onPrev={tour.prev}
        onClose={tour.close}
      />
    </main>
    </TooltipProvider>
  );
}
