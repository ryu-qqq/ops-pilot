import { useMemo, useState } from "react";
import { CheckCircle2, Plus, RotateCw } from "lucide-react";
import type { Project, ProjectWorkspaceMode } from "@opspilot/shared-types";
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
import { ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useScanWorkMetrics } from "../../registry/use-registry";
import { useInstallHooks, useProjects, useScanProject } from "../use-project";
import { ProjectRegisterDialog } from "./project-register-dialog";

interface Props {
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

function modeLabel(mode: ProjectWorkspaceMode): string {
  return mode === "linked" ? "로컬 연결" : "관리 클론";
}

function modeBadgeVariant(mode: ProjectWorkspaceMode): "success" | "secondary" {
  return mode === "linked" ? "success" : "secondary";
}

function ProjectModeBadge({ mode }: { mode: ProjectWorkspaceMode }) {
  return (
    <Badge variant={modeBadgeVariant(mode)} className="shrink-0 text-[10px]">
      {modeLabel(mode)}
    </Badge>
  );
}

// 프로젝트 선택 + 액션(스캔·작업 신호 스캔·버전 훅 설치) + 등록 버튼을 한 줄 툴바로.
// 등록 폼은 모달(ProjectRegisterDialog)로 분리해 툴바를 슬림화.
export function ProjectBar({ selectedProjectId, onSelect }: Props) {
  const { data: projects, isPending: projectsPending } = useProjects();
  const scan = useScanProject(selectedProjectId);
  const hooks = useInstallHooks();
  const scanWork = useScanWorkMetrics();

  const [registerOpen, setRegisterOpen] = useState(false);

  const selectedProject = useMemo(
    () => (projects ?? []).find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1">
          <Select
            value={selectedProjectId ?? ""}
            onValueChange={onSelect}
            disabled={projectsPending}
          >
            <SelectTrigger>
              {projectsPending ? (
                <Loading label="프로젝트 불러오는 중…" />
              ) : (
                <SelectValue
                  placeholder={projects && projects.length > 0 ? "프로젝트 선택" : "등록된 프로젝트 없음"}
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
                    <ProjectModeBadge mode={p.workspaceMode} />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={selectedProjectId === null || scan.isPending || scan.isSuccess}
          onClick={() => {
            if (selectedProjectId === null) return;
            scan.mutate(selectedProjectId);
          }}
        >
          {scan.isPending ? (
            <Loading label="스캔 중…" />
          ) : (
            <>
              스캔
              <InfoMark
                label="스캔"
                help="등록 경로(clonePath)에서 git pull 후 .claude/{agents,skills,commands}/*.md 를 읽어 자산·버전(=git 커밋 이력)을 멱등 갱신합니다."
              />
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={selectedProjectId === null || scanWork.isPending}
          onClick={() => {
            if (selectedProjectId !== null) scanWork.mutate({ projectId: selectedProjectId });
          }}
        >
          <RotateCw className={cn("h-3.5 w-3.5", scanWork.isPending && "animate-spin")} />
          {scanWork.isPending ? "스캔 중…" : "작업 신호 스캔"}
          <InfoMark
            label="작업 신호 스캔"
            help="로컬 세션을 훑어 자산별 정정왕복(참고 신호)을 갱신합니다. 품질 점수가 아니라 참고용입니다."
          />
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={selectedProjectId === null || hooks.isPending}
          onClick={() => {
            if (selectedProjectId !== null) hooks.mutate(selectedProjectId);
          }}
        >
          {hooks.isPending ? (
            <Loading label="설치 중…" />
          ) : (
            <>
              버전 강제 훅 설치
              <InfoMark
                label="버전 강제 훅 설치"
                help="등록 경로에 .claude/opspilot/version-on-change.sh + PostToolUse 훅 + post-commit 훅을 설치합니다. 한 번만 실행, 멱등."
              />
            </>
          )}
        </Button>

        <Button type="button" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          프로젝트 등록
        </Button>
      </div>

      {/* 액션 결과 줄 */}
      {(scan.isSuccess || hooks.isSuccess || scanWork.isSuccess) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {scan.isSuccess && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              자산 {scan.data.scannedAssets} · 신규버전 {scan.data.saved.versions}
            </span>
          )}
          {scanWork.isSuccess && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              작업 신호 갱신됨
            </span>
          )}
          {hooks.isSuccess && (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              훅 설치됨
              {hooks.data.committed ? ` (커밋 ${hooks.data.committed.slice(0, 8)})` : " (이미 설치됨)"}
            </span>
          )}
        </div>
      )}

      {hooks.isError && <InlineError error={hooks.error} />}
      {scanWork.isError && <InlineError error={scanWork.error} />}
      {scan.isError && <ErrorNotice error={scan.error} />}

      {selectedProject && <ProjectPathHint project={selectedProject} />}

      <ProjectRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={onSelect}
      />
    </Card>
  );
}

function ProjectPathHint({ project }: { project: Project }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ProjectModeBadge mode={project.workspaceMode} />
        {project.remoteVerified && (
          <Badge variant="outline" className="text-[10px]">
            origin 검증됨
          </Badge>
        )}
      </div>
      <p className="font-mono text-[11px] text-muted-foreground break-all">{project.clonePath}</p>
      <p className="mt-1 text-muted-foreground">
        {project.workspaceMode === "linked"
          ? "Cursor에서 이 폴더를 열면 ingest·apply 변경이 바로 보입니다."
          : "apply는 이 클론에만 반영됩니다. Cursor dev 폴더와 다르면 sync가 필요합니다."}
      </p>
    </div>
  );
}
