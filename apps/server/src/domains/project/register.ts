import type { Project } from "@opspilot/shared-types";
import { scaffoldProjectYaml } from "../agent-crew/sync.js";
import {
  createProject,
  getProjectByClonePath,
  listProjects,
} from "./repository.js";
import {
  cloneProject,
  defaultNameFromPath,
  linkLocalProject,
  normalizeGitUrl,
  ProjectCloneError,
  ProjectLinkError,
  slugFromUrl,
} from "./service.js";

export interface RegisterLinkedInput {
  mode: "linked";
  localPath: string;
  gitUrl?: string;
  name?: string;
}

export interface RegisterManagedInput {
  mode: "managed";
  gitUrl: string;
  name?: string;
}

export type RegisterProjectInput = RegisterLinkedInput | RegisterManagedInput;

export class ProjectRegisterError extends Error {
  constructor(
    public readonly code: "Duplicate" | "LinkError" | "CloneError",
    message: string,
  ) {
    super(message);
    this.name = "ProjectRegisterError";
  }
}

function isRegisteredGitUrl(gitUrl: string): boolean {
  const norm = normalizeGitUrl(gitUrl);
  return listProjects().some((p) => normalizeGitUrl(p.gitUrl) === norm);
}

// 등록 직후 project.yaml 을 기본값으로 만들어 sync 진입을 매끄럽게 한다.
// best-effort — yaml 생성 실패가 등록 자체를 깨면 안 된다.
function ensureProjectYaml(clonePath: string): void {
  try {
    scaffoldProjectYaml(clonePath);
  } catch {
    /* 등록은 성공시키고 yaml 은 나중에 sync/수동으로 보강 */
  }
}

// REG-02/05: REST · MCP 공통 프로젝트 등록.
export function registerProject(input: RegisterProjectInput): Project {
  if (input.mode === "linked") {
    let linked;
    try {
      linked = linkLocalProject({ localPath: input.localPath, gitUrl: input.gitUrl });
    } catch (e) {
      if (e instanceof ProjectLinkError) {
        throw new ProjectRegisterError("LinkError", e.message);
      }
      throw e;
    }
    if (getProjectByClonePath(linked.clonePath)) {
      throw new ProjectRegisterError("Duplicate", `이미 등록된 로컬 경로: ${linked.clonePath}`);
    }
    if (isRegisteredGitUrl(linked.gitUrl)) {
      throw new ProjectRegisterError("Duplicate", "이미 등록된 git URL");
    }
    const project = createProject({
      name: input.name ?? defaultNameFromPath(linked.clonePath),
      gitUrl: linked.gitUrl,
      clonePath: linked.clonePath,
      defaultBranch: linked.defaultBranch,
      workspaceMode: "linked",
      remoteVerified: linked.remoteVerified,
    });
    ensureProjectYaml(project.clonePath);
    return project;
  }

  if (isRegisteredGitUrl(input.gitUrl)) {
    throw new ProjectRegisterError("Duplicate", "이미 등록된 git URL");
  }
  try {
    const { clonePath, defaultBranch } = cloneProject(input.gitUrl);
    const project = createProject({
      name: input.name ?? slugFromUrl(input.gitUrl),
      gitUrl: input.gitUrl,
      clonePath,
      defaultBranch,
      workspaceMode: "managed",
    });
    ensureProjectYaml(project.clonePath);
    return project;
  } catch (e) {
    if (e instanceof ProjectCloneError) {
      throw new ProjectRegisterError("CloneError", e.message);
    }
    throw e;
  }
}

export function projectSummary(project: Project) {
  return {
    id: project.id,
    name: project.name,
    gitUrl: project.gitUrl,
    clonePath: project.clonePath,
    workspaceMode: project.workspaceMode,
    remoteVerified: project.remoteVerified,
    defaultBranch: project.defaultBranch,
    createdAt: project.createdAt,
  };
}
