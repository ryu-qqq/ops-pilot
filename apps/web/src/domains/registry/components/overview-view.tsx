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
import { EmptyState } from "../../../lib/ui";
import { useProjects } from "../../project/use-project";
import { AssetHealthDashboard } from "./asset-health-dashboard";
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

// 개요(overview) = OpsPilot 첫 진입. 보는 화면.
// (1) 전역 사용량 리더보드 — 항상 채워짐(프로젝트 무관, 내 로컬 세션 전체 Top 5)
// (2) 자산 헬스 요약 — 프로젝트 선택 종속. 인라인 Select로 고르면 미사용·형식 헬스가 보임.
// 만지는 화면(등록·스캔·저작·master-detail)은 프로젝트 탭(registry). 여기선 탭 전환 유도만.
export function OverviewView({ projectId, onProjectIdChange, onOpenProjectTab }: Props) {
  const { data: projects } = useProjects();

  return (
    <div className="space-y-4">
      {/* (1) 전역 사용량 리더보드 — 시그니처 변경 없이 그대로 재사용 */}
      <UsageLeaderboard />

      {/* (2) 자산 헬스 요약 */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">자산 헬스</h2>
          <div className="flex items-center gap-2">
            <div className="min-w-[220px]">
              <Select
                value={projectId ?? ""}
                onValueChange={(id) => onProjectIdChange(id)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      projects && projects.length > 0
                        ? "프로젝트 선택"
                        : "등록된 프로젝트 없음"
                    }
                  />
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenProjectTab?.()}
            >
              프로젝트 탭에서 자세히
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {projectId === null ? (
          <EmptyState
            title="프로젝트를 고르면 미사용·형식 헬스가 보여요"
            hint="위 Select에서 프로젝트를 선택하세요. prune 후보·형식 오류를 한눈에 봅니다."
          />
        ) : (
          <AssetHealthDashboard
            projectId={projectId}
            selectedId={null}
            onSelect={() => onOpenProjectTab?.()}
          />
        )}
      </Card>
    </div>
  );
}
