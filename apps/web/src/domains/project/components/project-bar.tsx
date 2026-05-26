import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { Project, ProjectWorkspaceMode } from "@opspilot/shared-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import type { CreateProjectRequest } from "../api";
import { ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useCreateProject, useInstallHooks, useProjects, useScanProject } from "../use-project";

interface Props {
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

type RegisterMode = CreateProjectRequest["mode"];

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

// 프로젝트 등록(linked | managed) → 선택 → 스캔(pull + .claude 적재).
export function ProjectBar({ selectedProjectId, onSelect }: Props) {
  const { data: projects } = useProjects();
  const create = useCreateProject();
  const scan = useScanProject(selectedProjectId);
  const hooks = useInstallHooks();

  const [registerMode, setRegisterMode] = useState<RegisterMode>("linked");
  const [localPath, setLocalPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [linkedGitUrl, setLinkedGitUrl] = useState("");

  const selectedProject = useMemo(
    () => (projects ?? []).find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const canRegister =
    registerMode === "linked" ? localPath.trim() !== "" : gitUrl.trim() !== "";

  const handleRegister = () => {
    const input: CreateProjectRequest =
      registerMode === "linked"
        ? {
            mode: "linked",
            localPath: localPath.trim(),
            ...(linkedGitUrl.trim() !== "" ? { gitUrl: linkedGitUrl.trim() } : {}),
          }
        : { mode: "managed", gitUrl: gitUrl.trim() };

    create.mutate(input, {
      onSuccess: (p) => {
        setLocalPath("");
        setGitUrl("");
        setLinkedGitUrl("");
        onSelect(p.id);
      },
    });
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">등록 방식</span>
          <RadioGroup
            value={registerMode}
            onValueChange={(v) => setRegisterMode(v as RegisterMode)}
            className="flex flex-row flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="linked" id="register-linked" />
              <Label htmlFor="register-linked" className="cursor-pointer text-sm font-normal">
                로컬 경로 연결
                <span className="ml-1 text-xs text-muted-foreground">(권장 · Cursor)</span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="managed" id="register-managed" />
              <Label htmlFor="register-managed" className="cursor-pointer text-sm font-normal">
                OpsPilot 관리 클론
              </Label>
            </div>
          </RadioGroup>
        </div>

        {registerMode === "linked" ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="로컬 git 경로 (예: ~/Documents/ryu-qqq/Infrastructure)"
                className="font-mono text-sm"
              />
              <Button type="button" disabled={create.isPending || !canRegister} onClick={handleRegister}>
                {create.isPending ? (
                  <Loading label="연결 중…" />
                ) : (
                  <>
                    프로젝트 등록
                    <InfoMark
                      label="로컬 경로 연결"
                      help="Cursor에서 쓰는 checkout을 OpsPilot에 그대로 등록합니다. scan·ingest·apply가 이 경로에서 일어나며, apply 후 Cursor에서 바로 harness 변경을 볼 수 있습니다. origin remote가 있으면 gitUrl 생략 가능."
                    />
                  </>
                )}
              </Button>
            </div>
            <Input
              value={linkedGitUrl}
              onChange={(e) => setLinkedGitUrl(e.target.value)}
              placeholder="git URL (선택 · origin과 다를 때만)"
              className="font-mono text-sm"
            />
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="git URL (예: https://github.com/owner/repo.git)"
              className="font-mono text-sm"
            />
            <Button type="button" disabled={create.isPending || !canRegister} onClick={handleRegister}>
              {create.isPending ? (
                <Loading label="클론 중…" />
              ) : (
                <>
                  프로젝트 등록
                  <InfoMark
                    label="OpsPilot 관리 클론"
                    help="git URL을 clone해 OPS_PROJECTS_DIR/<슬러그>에 둡니다. apply는 클론에만 반영되므로 Cursor dev 폴더와 다르면 push/pull 또는 /opspilot-sync-managed-clone 으로 동기화하세요."
                  />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      {create.isError && <InlineError error={create.error} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1">
          <Select value={selectedProjectId ?? ""} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue
                placeholder={projects && projects.length > 0 ? "프로젝트 선택" : "등록된 프로젝트 없음"}
              />
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
        {scan.isSuccess && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            자산 {scan.data.scannedAssets} · 신규버전 {scan.data.saved.versions}
          </span>
        )}
        {hooks.isSuccess && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            훅 설치됨
            {hooks.data.committed ? ` (커밋 ${hooks.data.committed.slice(0, 8)})` : " (이미 설치됨)"}
          </span>
        )}
        {hooks.isError && <InlineError error={hooks.error} />}
      </div>

      {selectedProject && <ProjectPathHint project={selectedProject} />}

      {scan.isError && <ErrorNotice error={scan.error} />}
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
