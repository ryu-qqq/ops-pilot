import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { registryKeys } from "../../registry/api";
import { ErrorNotice, InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useCreateProject, useInstallHooks, useProjects, useScanProject } from "../use-project";

interface Props {
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

// 프로젝트 = git URL 클론. 등록 → 선택 → 스캔(pull + .claude 적재).
export function ProjectBar({ selectedProjectId, onSelect }: Props) {
  const { data: projects } = useProjects();
  const create = useCreateProject();
  const scan = useScanProject();
  const hooks = useInstallHooks();
  const qc = useQueryClient();
  const [gitUrl, setGitUrl] = useState("");

  return (
    <Card className="space-y-3 p-4">
      <div className="flex gap-2">
        <Input
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder="git URL (예: https://github.com/owner/repo.git)"
          className="font-mono text-sm"
        />
        <Button
          type="button"
          disabled={create.isPending || gitUrl.trim() === ""}
          onClick={() =>
            create.mutate(gitUrl.trim(), {
              onSuccess: (p) => {
                setGitUrl("");
                onSelect(p.id);
              },
            })
          }
        >
          {create.isPending ? (
            <Loading label="클론 중…" />
          ) : (
            <>
              프로젝트 등록
              <InfoMark
                label="프로젝트 등록"
                help="git URL(또는 로컬 경로/file://)을 클론해 OpsPilot 작업 베이스(~/.opspilot/projects/<슬러그>)를 만듭니다. 이 클론이 버전·실행의 기준이며, 클론·원본 둘 다 무오염으로 유지됩니다."
              />
            </>
          )}
        </Button>
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
                  {p.name} ({p.defaultBranch ?? "?"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={selectedProjectId === null || scan.isPending}
          onClick={() => {
            if (selectedProjectId === null) return;
            scan.mutate(selectedProjectId, {
              onSuccess: () =>
                qc.invalidateQueries({ queryKey: registryKeys.assets(selectedProjectId) }),
            });
          }}
        >
          {scan.isPending ? (
            <Loading label="스캔 중…" />
          ) : (
            <>
              스캔
              <InfoMark
                label="스캔"
                help="클론을 git pull 후 .claude/{agents,skills,commands}/*.md 를 읽어 자산·버전(=git 커밋 이력)을 멱등 갱신합니다. .claude가 없으면 정상 동작으로 안내가 뜨고, 그땐 ‘새 자산 작성’부터 시작하면 됩니다."
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
                help="이 프로젝트 클론에 (1) .claude/opspilot/version-on-change.sh + .claude/settings.json PostToolUse 훅(Claude Code 세션이 .claude를 고치면 즉시 구조화 커밋) (2) .git/hooks/post-commit(어떤 에디터로 커밋해도 OpsPilot에 재스캔 알림) 을 설치합니다. 한 번만 실행, 멱등. 이후 사람이 까먹어도 모든 .claude 변경이 자동으로 버전이 됩니다."
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
      {scan.isError && <ErrorNotice error={scan.error} />}
    </Card>
  );
}
