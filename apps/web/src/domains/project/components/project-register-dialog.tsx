import { useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import type { CreateProjectRequest } from "../api";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useCreateProject } from "../use-project";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 등록 성공 시 새 프로젝트를 선택(부모가 목록 무효화는 useCreateProject 가 처리).
  onRegistered: (projectId: string) => void;
}

type RegisterMode = CreateProjectRequest["mode"];

// 프로젝트 등록 폼 — 이전엔 ProjectBar 인라인, 이제 모달로 분리(툴바 슬림화).
// linked(로컬 경로 연결) | managed(OpsPilot 관리 클론) 두 방식.
export function ProjectRegisterDialog({ open, onOpenChange, onRegistered }: Props) {
  const create = useCreateProject();

  const [registerMode, setRegisterMode] = useState<RegisterMode>("linked");
  const [localPath, setLocalPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [linkedGitUrl, setLinkedGitUrl] = useState("");

  const canRegister =
    registerMode === "linked" ? localPath.trim() !== "" : gitUrl.trim() !== "";

  const reset = () => {
    setLocalPath("");
    setGitUrl("");
    setLinkedGitUrl("");
  };

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
        reset();
        onRegistered(p.id);
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>프로젝트 등록</DialogTitle>
          <DialogDescription>
            로컬 git 경로를 연결하거나 git URL을 OpsPilot 관리 클론으로 등록합니다.
          </DialogDescription>
        </DialogHeader>

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
              <Input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="로컬 git 경로 (예: ~/Documents/ryu-qqq/Infrastructure)"
                className="font-mono text-sm"
              />
              <Input
                value={linkedGitUrl}
                onChange={(e) => setLinkedGitUrl(e.target.value)}
                placeholder="git URL (선택 · origin과 다를 때만)"
                className="font-mono text-sm"
              />
            </div>
          ) : (
            <Input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="git URL (예: https://github.com/owner/repo.git)"
              className="font-mono text-sm"
            />
          )}

          {create.isError && <InlineError error={create.error} />}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={create.isPending || !canRegister}
              onClick={handleRegister}
            >
              {create.isPending ? (
                <Loading label={registerMode === "linked" ? "연결 중…" : "클론 중…"} />
              ) : (
                <>
                  프로젝트 등록
                  <InfoMark
                    label={registerMode === "linked" ? "로컬 경로 연결" : "OpsPilot 관리 클론"}
                    help={
                      registerMode === "linked"
                        ? "Cursor에서 쓰는 checkout을 OpsPilot에 그대로 등록합니다. scan·ingest·apply가 이 경로에서 일어나며, apply 후 Cursor에서 바로 harness 변경을 볼 수 있습니다. origin remote가 있으면 gitUrl 생략 가능."
                        : "git URL을 clone해 OPS_PROJECTS_DIR/<슬러그>에 둡니다. apply는 클론에만 반영되므로 Cursor dev 폴더와 다르면 push/pull 또는 /opspilot-sync-managed-clone 으로 동기화하세요."
                    }
                  />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
