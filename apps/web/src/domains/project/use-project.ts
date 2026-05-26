import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registryKeys } from "../registry/api";
import { createProject, getProjects, installHooks, projectKeys, scanProject } from "./api";

export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: getProjects });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

/** projectId 를 넘기면 같은 프로젝트 스캔 mutation 상태(isPending/isSuccess)를 화면 전역에서 공유. */
export function useScanProject(projectId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey:
      projectId != null ? ([...projectKeys.all, "scan", projectId] as const) : undefined,
    mutationFn: scanProject,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: registryKeys.assets(id) });
    },
  });
}

export function useInstallHooks() {
  return useMutation({ mutationFn: installHooks });
}
