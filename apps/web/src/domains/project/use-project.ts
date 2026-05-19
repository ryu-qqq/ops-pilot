import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProject, getProjects, projectKeys, scanProject } from "./api";

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

export function useScanProject() {
  return useMutation({ mutationFn: scanProject });
}
