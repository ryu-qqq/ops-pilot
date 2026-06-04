import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Asset } from "@opspilot/shared-types";
import { InfoMark } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { refKey } from "../graph";
import type { ToolkitContext } from "./asset-toolkit";
import { NameCell, RelationCell, StatusCell, UsageCell } from "./asset-row-ui";

// 관계(tree) 뷰 — 스킬=부모, 호출하는 에이전트=중첩, 독립 에이전트·커맨드는 별 그룹.
// 데이터·필터·상태는 부모(asset-toolkit) 소유 → 여기선 트리 구성·렌더만.
export function AssetRelationTree({ ctx }: { ctx: ToolkitContext }) {
  const {
    assets,
    selectedId,
    select,
    metaFor,
    relationFor,
    passesFilter,
    filterActive,
    graphMap,
    assetByKey,
    onRowHover,
    hlClass,
    showRelation,
  } = ctx;

  // 접힌/펼친 스킬(부모). 기본 전부 접힘 → 펼친 것만 set 에 담는다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ── 트리 구성 ──────────────────────────────────────────────
  const tree = useMemo(() => {
    const all = assets;
    const skills = all
      .filter((a) => a.kind === "skill")
      .sort((a, b) => a.name.localeCompare(b.name));
    const commands = all
      .filter((a) => a.kind !== "agent" && a.kind !== "skill")
      .sort((a, b) => a.name.localeCompare(b.name));

    // 스킬별 자식 = references 중 등록된 agent·skill 자산.
    const childrenOf = (skill: Asset): Asset[] => {
      const g = graphMap.get(refKey(skill.kind, skill.name));
      const out: Asset[] = [];
      for (const ref of g?.references ?? []) {
        if (ref.kind !== "agent" && ref.kind !== "skill") continue;
        const child = assetByKey.get(refKey(ref.kind, ref.name));
        if (child && child.id !== skill.id) out.push(child);
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    };

    // 어떤 스킬 아래 자식으로 등장한 (kind:name) 집합 → 독립 그룹에서 제외.
    const skillChildKeys = new Set<string>();
    for (const s of skills)
      for (const c of childrenOf(s)) skillChildKeys.add(refKey(c.kind, c.name));

    const orphanAgents = all
      .filter(
        (a) =>
          a.kind === "agent" && !skillChildKeys.has(refKey(a.kind, a.name)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return { skills, orphanAgents, commands, childrenOf };
  }, [assets, graphMap, assetByKey]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 공통 그리드(자식은 캐럿 칸 없음). compact면 관계 컬럼 제거 → 이름 폭 확보.
  // 부모/일반 = [caret 1fr (관계) status use], 자식 = [1fr (관계) status use].
  const PARENT_GRID = showRelation
    ? "grid grid-cols-[16px_1fr_110px_92px_64px] items-center gap-x-3"
    : "grid grid-cols-[16px_1fr_92px_64px] items-center gap-x-3";
  const ROW_GRID = showRelation
    ? "grid grid-cols-[1fr_110px_92px_64px] items-center gap-x-3"
    : "grid grid-cols-[1fr_92px_64px] items-center gap-x-3";

  // 스킬 부모가 트리에 보이나(자기 통과 or 자식 통과).
  const skillVisible = (skill: Asset): boolean => {
    if (passesFilter(skill)) return true;
    return tree.childrenOf(skill).some((c) => passesFilter(c));
  };

  const visibleSkills = tree.skills.filter(skillVisible);
  const visibleOrphans = tree.orphanAgents.filter(passesFilter);
  const visibleCommands = tree.commands.filter(passesFilter);

  return (
    <div className="overflow-hidden rounded-md border">
      {/* 컬럼 헤더 */}
      <div
        className={cn(
          PARENT_GRID,
          "border-b bg-muted/50 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground",
        )}
      >
        <span />
        <span>자산</span>
        {showRelation && <span>관계</span>}
        <span className="inline-flex items-center gap-1">
          상태
          <InfoMark
            help="무상 구조 신호 롤업 — 형식·사용·연결. 출력 품질(eval)과 별개."
            label="상태(구조 신호)"
          />
        </span>
        <span className="text-right">사용</span>
      </div>

      {visibleSkills.length === 0 &&
        visibleOrphans.length === 0 &&
        visibleCommands.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            해당 자산 없음.
          </p>
        )}

      {/* 스킬 그룹 */}
      {visibleSkills.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          스킬 — 호출하는 에이전트 포함
        </div>
      )}
      {visibleSkills.map((skill) => {
        const key = refKey(skill.kind, skill.name);
        const meta = metaFor(skill);
        const selfMatch = passesFilter(skill);
        // 필터 활성 시 보이는 스킬은 자동 펼침 — 매치된 자식이 즉시 보여 "필터 안 먹는다"
        // 는 오해(매치 안 하는 부모가 접힌 채 노출)를 없앤다.
        const isOpen = filterActive || expanded.has(key);
        // 부모(skill)가 필터를 통과해도 자식은 항상 필터를 적용한다.
        // (예: "미사용" 필터에서 미사용 스킬의 사용 중 자식이 새는 버그 방지.)
        // 필터 없음(all/all/all)이면 passesFilter 가 전부 true → 기존처럼 모두 표시.
        const visibleChildren = isOpen
          ? tree.childrenOf(skill).filter(passesFilter)
          : [];
        // 필터 중인데 부모 스킬 자신은 매치 안 함 = 매치된 자식 때문에 "맥락"으로만 보이는 행 → 디밍.
        const contextOnly = filterActive && !selfMatch;
        return (
          <div key={skill.id}>
            <div
              className={cn(
                PARENT_GRID,
                "h-10 cursor-pointer border-t px-3 transition-colors hover:bg-accent/50",
                isOpen && "bg-muted/40",
                contextOnly && "opacity-45",
                skill.id === selectedId && "bg-primary/10",
                hlClass(key),
              )}
              onMouseEnter={() => onRowHover(key)}
              onMouseLeave={() => onRowHover(null)}
              onClick={() => select(skill.id)}
            >
              <button
                type="button"
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-accent",
                  isOpen ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(key);
                }}
                title={isOpen ? "접기" : "펼치기"}
                aria-label={isOpen ? "접기" : "펼치기"}
                aria-expanded={isOpen}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
              </button>
              <NameCell meta={meta} />
              {showRelation && <RelationCell relation={relationFor(skill)} />}
              <StatusCell tone={meta.status.tone} label={meta.status.label} />
              <span className="text-right text-sm">
                <UsageCell usage={meta.usage} />
              </span>
            </div>

            {/* 펼친 자식 — 좌측 연결선으로 "이 스킬 아래"임을 명확히. */}
            {visibleChildren.length > 0 && (
              <div className="border-l-2 border-primary/30 bg-muted/10">
            {visibleChildren.map((child) => {
              const ckey = refKey(child.kind, child.name);
              const cmeta = metaFor(child);
              return (
                <div
                  key={`${skill.id}:${child.id}`}
                  className={cn(
                    ROW_GRID,
                    "h-9 cursor-pointer border-t bg-muted/20 pl-9 pr-3 transition-colors hover:bg-accent/40",
                    child.id === selectedId && "bg-primary/10",
                    hlClass(ckey),
                  )}
                  onMouseEnter={() => onRowHover(ckey)}
                  onMouseLeave={() => onRowHover(null)}
                  onClick={() => select(child.id)}
                >
                  <NameCell meta={cmeta} />
                  {showRelation && (
                    <RelationCell relation={relationFor(child)} />
                  )}
                  <StatusCell
                    tone={cmeta.status.tone}
                    label={cmeta.status.label}
                  />
                  <span className="text-right text-sm">
                    <UsageCell usage={cmeta.usage} />
                  </span>
                </div>
              );
            })}
              </div>
            )}
          </div>
        );
      })}

      {/* 독립 에이전트 그룹 */}
      {visibleOrphans.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          독립 에이전트 — 어떤 스킬에도 중첩 안 됨
        </div>
      )}
      {visibleOrphans.map((agent) => {
        const key = refKey(agent.kind, agent.name);
        const meta = metaFor(agent);
        return (
          <div
            key={agent.id}
            className={cn(
              ROW_GRID,
              "h-10 cursor-pointer border-t px-3 transition-colors hover:bg-accent/50",
              agent.id === selectedId && "bg-primary/10",
              hlClass(key),
            )}
            onMouseEnter={() => onRowHover(key)}
            onMouseLeave={() => onRowHover(null)}
            onClick={() => select(agent.id)}
          >
            <NameCell meta={meta} />
            {showRelation && <RelationCell relation={relationFor(agent)} />}
            <StatusCell tone={meta.status.tone} label={meta.status.label} />
            <span className="text-right text-sm">
              <UsageCell usage={meta.usage} />
            </span>
          </div>
        );
      })}

      {/* 커맨드 그룹 */}
      {visibleCommands.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          커맨드
        </div>
      )}
      {visibleCommands.map((cmd) => {
        const key = refKey(cmd.kind, cmd.name);
        const meta = metaFor(cmd);
        return (
          <div
            key={cmd.id}
            className={cn(
              ROW_GRID,
              "h-10 cursor-pointer border-t px-3 transition-colors hover:bg-accent/50",
              cmd.id === selectedId && "bg-primary/10",
              hlClass(key),
            )}
            onMouseEnter={() => onRowHover(key)}
            onMouseLeave={() => onRowHover(null)}
            onClick={() => select(cmd.id)}
          >
            <NameCell meta={meta} />
            {showRelation && <RelationCell relation={relationFor(cmd)} />}
            <StatusCell tone={meta.status.tone} label={meta.status.label} />
            <span className="text-right text-sm">
              <UsageCell usage={meta.usage} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
