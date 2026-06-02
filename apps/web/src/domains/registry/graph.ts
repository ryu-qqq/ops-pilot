import type { Asset, AssetGraph, AssetUsage } from "@opspilot/shared-types";

// 툴킷 트리·상태 롤업의 무상(no-cost) 계산 단일 원천.
// "상태"는 형식(lint)·사용(usage)·연결(graph) 구조 신호만 본다 — 진짜 출력 품질(eval)과 섞지 않는다.

export interface LintRow {
  ok: boolean;
  errorCount: number;
  warningCount: number;
}

export type GraphItem = AssetGraph["items"][number];
export type AssetRef = GraphItem["references"][number];

// 상태 톤 — 기존 TONE(emerald/amber/red) 재사용. "none" = 미추적(command/cursor).
export type StatusTone = "green" | "amber" | "red" | "none";

export interface AssetStatus {
  tone: StatusTone;
  label: string; // 정상 / 주의 / 문제 / —
}

// (kind:name) 정규 키 — usage·graph·중복 dedup 의 단일 키 형식.
export function refKey(kind: string, name: string): string {
  return `${kind}:${name}`;
}

// 상태 롤업(프론트 무상 계산):
// 🔴 문제 = lint error>0 (트리거 불가) 또는 (agent && referencedBy 빔 && neverUsed) [고아+미사용 dead]
// 🟡 주의 = lint warning>0 또는 neverUsed (위 🔴 아닌 경우)
// 🟢 정상 = 그 외 (형식 OK · 쓰임 or 엮임 · 단독 의도)
// command/cursor(usage 미추적, supported=false) = 형식만 반영, 형식 OK면 '—'.
export function computeAssetStatus(
  asset: Asset,
  usage: AssetUsage | undefined,
  lint: LintRow | undefined,
  graphItem: GraphItem | undefined,
): AssetStatus {
  const errorCount = lint?.errorCount ?? 0;
  const warningCount = lint?.warningCount ?? 0;

  if (errorCount > 0) return { tone: "red", label: "문제" };

  // usage 미추적 종류(command/cursor): 형식만 본다. 형식 OK → '—'.
  const tracked = usage?.supported ?? false;
  if (!tracked) {
    if (warningCount > 0) return { tone: "amber", label: "주의" };
    return { tone: "none", label: "—" };
  }

  const neverUsed = usage?.neverUsed ?? false;
  // 고아 = 어떤 스킬·커맨드도 나를 호출 안 함(referencedBy 빔).
  const orphan = (graphItem?.referencedBy.length ?? 0) === 0;

  // dead: 고아 에이전트인데 미사용 → 진짜 죽은 자산(prune 후보).
  if (asset.kind === "agent" && orphan && neverUsed)
    return { tone: "red", label: "문제" };

  if (warningCount > 0) return { tone: "amber", label: "주의" };
  if (neverUsed) return { tone: "amber", label: "주의" };

  return { tone: "green", label: "정상" };
}

// 고아 에이전트 판정 (독립 그룹 멤버십). referencedBy 가 비어야 독립.
export function isOrphanAgent(asset: Asset, graphItem: GraphItem | undefined) {
  return (
    asset.kind === "agent" && (graphItem?.referencedBy.length ?? 0) === 0
  );
}

// 관계 컬럼 표기(트리·플랫 단일 원천). 항상 채움 — "이름만" 케이스 없음.
//   skill   = ⛓ N 호출 (본문 references 수)
//   agent   = ↩ N 스킬 (나를 호출하는 스킬 수, 1도 표시) /
//             referencedBy 빔이면 독립 · 단독(사용중·청록) or 독립 · 미사용(주황)
//   command·cursor = — (관계 미추적)
export interface RelationDescriptor {
  label: string;
  title: string;
  tone: "muted" | "orphan" | "dead";
}
export function computeRelation(
  asset: Asset,
  graphItem: GraphItem | undefined,
  referencingSkillCount: number,
  usage: AssetUsage | undefined,
): RelationDescriptor {
  if (asset.kind === "skill") {
    const calls = graphItem?.references.length ?? 0;
    return {
      label: `⛓ ${String(calls)} 호출`,
      title: `이 스킬이 본문에서 참조(호출)하는 자산 ${String(calls)}개 — 휴리스틱`,
      tone: "muted",
    };
  }
  if (asset.kind === "agent") {
    if (isOrphanAgent(asset, graphItem)) {
      const neverUsed = usage?.neverUsed ?? false;
      if (neverUsed)
        return {
          label: "독립 · 미사용",
          title:
            "어떤 스킬·커맨드도 이 에이전트를 호출 안 하고, 어디서도 쓰이지 않음 (dead — prune 후보).",
          tone: "dead",
        };
      return {
        label: "독립 · 단독",
        title: "어떤 자산도 호출 안 하지만 단독으로 쓰임 — 의도된 단독.",
        tone: "orphan",
      };
    }
    return {
      label: `↩ ${String(referencingSkillCount)} 스킬`,
      title: `${String(referencingSkillCount)}개 스킬이 이 에이전트를 호출.`,
      tone: "muted",
    };
  }
  return { label: "—", title: "관계 미추적 종류", tone: "muted" };
}
