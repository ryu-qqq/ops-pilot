import type { ProjectWorkspaceMode } from "@opspilot/shared-types";
import { ArrowRight } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Loading } from "../../../lib/ui";
import { useProjects } from "../../project/use-project";
import { ActivitySection } from "./overview/activity-section";
import { CompoundingTrendSection } from "./overview/compounding-trend-section";
import { HealthSummaryCards } from "./overview/health-summary-cards";
import { UsageLeaderboard } from "./usage-leaderboard";

interface Props {
  projectId: string | null;
  onProjectIdChange: (projectId: string | null) => void;
  onOpenProjectTab?: () => void;
}

function modeLabel(mode: ProjectWorkspaceMode): string {
  return mode === "linked" ? "로컬 연결" : "관리 클론";
}

function modeBadgeVariant(mode: ProjectWorkspaceMode): "success" | "secondary" {
  return mode === "linked" ? "success" : "secondary";
}

// 개요(overview) = OpsPilot 첫 진입. 위→아래:
// (1) 프로젝트 스코프 바 — "이 프로젝트" 섹션(추세·헬스)을 한 선택으로 묶는다.
// (2) 하네스 복리 추세 — 이 프로젝트(North Star: 복리가 되고 있나).
// (3) 사용량 리더보드 — 전역. (4) 자산 헬스 — 이 프로젝트.
// (5) 활동 잔디 — 전역(사용량 신호라 최하단으로 강등).
export function OverviewView({
  projectId,
  onProjectIdChange,
  onOpenProjectTab,
}: Props) {
  const { data: projects, isPending: projectsPending } = useProjects();

  return (
    <div className="space-y-4">
      {/* (1) 프로젝트 스코프 바 — 추세·헬스 공통 선택기 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">이 프로젝트</span>
          <Badge variant="outline" className="text-[10px]">
            추세·헬스 스코프
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-[220px]">
            <Select
              value={projectId ?? ""}
              onValueChange={(id) => onProjectIdChange(id)}
              disabled={projectsPending}
            >
              <SelectTrigger>
                {projectsPending ? (
                  <Loading label="프로젝트 불러오는 중…" />
                ) : (
                  <SelectValue
                    placeholder={
                      projects && projects.length > 0
                        ? "프로젝트 선택"
                        : "등록된 프로젝트 없음"
                    }
                  />
                )}
              </SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span>
                        {p.name} ({p.defaultBranch ?? "?"})
                      </span>
                      <Badge
                        variant={modeBadgeVariant(p.workspaceMode)}
                        className="shrink-0 text-[10px]"
                      >
                        {modeLabel(p.workspaceMode)}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenProjectTab?.()}>
            프로젝트 탭에서 자세히
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* (2) 하네스 복리 추세 — 이 프로젝트 (North Star) */}
      <CompoundingTrendSection projectId={projectId} />

      {/* (3) 사용량 리더보드 — 전역 */}
      <UsageLeaderboard />

      {/* (4) 자산 헬스 — 이 프로젝트 */}
      <Card className="space-y-3 border-l-2 border-primary/40 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">자산 헬스</h2>
          <Badge variant="outline" className="text-[10px]">
            이 프로젝트
          </Badge>
        </div>
        <HealthSummaryCards projectId={projectId} />
      </Card>

      {/* (5) 활동 잔디 — 전역(사용량 신호, 최하단 강등) */}
      <ActivitySection />
    </div>
  );
}
