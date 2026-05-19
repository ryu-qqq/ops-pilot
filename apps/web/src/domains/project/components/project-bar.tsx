import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../../registry/api";
import { useCreateProject, useProjects, useScanProject } from "../use-project";

interface Props {
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

// 프로젝트 = git URL 클론. 등록 → 선택 → 스캔(pull + .claude 적재).
export function ProjectBar({ selectedProjectId, onSelect }: Props) {
  const { data: projects } = useProjects();
  const create = useCreateProject();
  const scan = useScanProject();
  const qc = useQueryClient();
  const [gitUrl, setGitUrl] = useState("");

  return (
    <div style={{ border: "1px solid #d0d7de", borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder="git URL (예: https://github.com/owner/repo.git)"
          style={{ flex: 1, padding: 6, fontFamily: "monospace", fontSize: 13 }}
        />
        <button
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
          {create.isPending ? "클론 중…" : "프로젝트 등록"}
        </button>
      </div>
      {create.isError && (
        <p style={{ color: "crimson", fontSize: 12 }}>{create.error.message}</p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={selectedProjectId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          style={{ flex: 1, padding: 6 }}
        >
          <option value="" disabled>
            {projects && projects.length > 0 ? "프로젝트 선택" : "등록된 프로젝트 없음"}
          </option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.defaultBranch ?? "?"})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={selectedProjectId === null || scan.isPending}
          onClick={() => {
            if (selectedProjectId === null) return;
            scan.mutate(selectedProjectId, {
              onSuccess: () =>
                qc.invalidateQueries({ queryKey: registryKeys.assets(selectedProjectId) }),
            });
          }}
        >
          {scan.isPending ? "스캔 중…" : "스캔"}
        </button>
        {scan.isSuccess && (
          <span style={{ color: "green", fontSize: 13 }}>
            자산 {scan.data.scannedAssets} · 신규버전 {scan.data.saved.versions}
          </span>
        )}
        {scan.isError && (
          <span style={{ color: "crimson", fontSize: 12 }}>{scan.error.message}</span>
        )}
      </div>
    </div>
  );
}
