import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import type { Project } from "@opspilot/shared-types";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Loading } from "../../../lib/ui";
import { useScanProject } from "../../project/use-project";

interface Props {
  project: Project;
  projectId: string;
  appliedCommit?: string | null;
}

function managedSyncText(project: Project, appliedCommit?: string | null): string {
  const branch = project.defaultBranch ?? "main";
  const lines = [
    "# OpsPilot managed clone → Cursor dev 동기화",
    `# clone: ${project.clonePath}`,
    `# Cursor에서 여는 dev 경로는 <DEV_PATH> 로 바꾸세요`,
    "",
    "# A. push / pull (origin SSOT)",
    `git -C "${project.clonePath}" push origin ${branch}`,
    `git -C "<DEV_PATH>" pull --ff-only origin ${branch}`,
  ];
  if (appliedCommit) {
    lines.push("", "# B. cherry-pick (부분 반영)", `git -C "<DEV_PATH>" cherry-pick ${appliedCommit}`);
  }
  lines.push("", "# Cursor: /opspilot-sync-managed-clone");
  return lines.join("\n");
}

export function PostApplyBanner({ project, projectId, appliedCommit }: Props) {
  const scan = useScanProject();
  const [copied, setCopied] = useState(false);

  if (project.workspaceMode === "linked") {
    return (
      <Alert variant="success">
        <Check className="h-4 w-4" />
        <AlertTitle>apply 완료 — Cursor에 즉시 반영됨</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            변경은 <code className="font-mono text-xs">{project.clonePath}</code> 에 커밋되었습니다.
            Cursor에서 같은 폴더를 열면 harness를 바로 쓸 수 있습니다.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={scan.isPending}
            onClick={() => scan.mutate(projectId)}
          >
            {scan.isPending ? <Loading label="스캔 중…" /> : "레지스트리 스캔 (권장)"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const syncBlock = managedSyncText(project, appliedCommit);

  const copy = async () => {
    await navigator.clipboard.writeText(syncBlock);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Alert variant="warning">
      <Info className="h-4 w-4" />
      <AlertTitle>apply 완료 — Cursor dev에는 아직 없음</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          커밋은 OpsPilot <strong>관리 클론</strong>(
          <code className="font-mono text-xs">{project.clonePath}</code>)에만 있습니다. Cursor에서
          쓰려면 dev checkout으로 sync하세요.
        </p>
        <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {syncBlock}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "복사됨" : "sync 명령 복사"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cursor 슬래시 커맨드 <code className="font-mono">/opspilot-sync-managed-clone</code> · 상세는{" "}
          <code className="font-mono">docs/cookbook/cursor-commands/</code>
        </p>
      </AlertDescription>
    </Alert>
  );
}
