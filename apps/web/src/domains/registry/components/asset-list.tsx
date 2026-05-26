import { useMemo, useState } from "react";
import type { Asset, AssetKind } from "@opspilot/shared-types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../../components/ui/accordion";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { EmptyState, ErrorNotice, Loading } from "../../../lib/ui";
import { cn } from "../../../lib/utils";
import { useAssets } from "../use-registry";

interface Props {
  projectId: string | null;
  selectedId: string | null;
  // null 을 받으면 선택 해제(같은 자산 다시 클릭한 경우). 호출처가 처리.
  onSelect: (id: string | null) => void;
}

const KIND_ORDER: AssetKind[] = [
  "skill",
  "command",
  "agent",
  "cursor_skill",
  "cursor_command",
  "cursor_rule",
];
const KIND_LABEL: Record<AssetKind, string> = {
  skill: "스킬",
  command: "커맨드",
  agent: "에이전트",
  cursor_skill: "Cursor 스킬",
  cursor_command: "Cursor 커맨드",
  cursor_rule: "Cursor rule",
};

export function AssetList({ projectId, selectedId, onSelect }: Props) {
  const { data: assets, isPending, isError, error } = useAssets(projectId);
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (assets ?? []).filter((a) =>
      needle === "" ? true : a.name.toLowerCase().includes(needle),
    );
    const byKind = new Map<AssetKind, Asset[]>();
    for (const a of filtered) {
      const list = byKind.get(a.kind) ?? [];
      list.push(a);
      byKind.set(a.kind, list);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: (byKind.get(k) ?? []).sort((x, y) => x.name.localeCompare(y.name)),
    }));
  }, [assets, q]);

  if (projectId === null)
    return (
      <EmptyState
        title="프로젝트를 먼저 선택하세요"
        hint="위의 프로젝트 바에서 git URL로 등록하거나 목록에서 고르면 자산이 여기 표시됩니다."
      />
    );
  if (isPending)
    return (
      <p className="text-sm text-muted-foreground">
        <Loading label="자산 불러오는 중…" />
      </p>
    );
  if (isError) return <ErrorNotice error={error} />;
  if (assets.length === 0)
    return (
      <EmptyState
        title="아직 자산이 없어요"
        hint="상단 ‘스캔’으로 이 프로젝트의 .claude를 적재하거나, 오른쪽 ‘새 자산 작성’으로 첫 에이전트/스킬/커맨드를 만드세요."
      />
    );

  // 기본 모든 그룹 펼침 — 사용자가 닫을 수 있음.
  const defaultOpen = groups.map((g) => g.kind);

  return (
    <div className="space-y-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`이름 검색 (총 ${String(assets.length)}개)`}
      />
      {groups.length === 0 && <p className="text-sm text-muted-foreground">검색 결과 없음.</p>}
      <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
        {groups.map((g) => (
          <AccordionItem key={g.kind} value={g.kind} className="border-b last:border-b-0">
            <AccordionTrigger className="text-xs font-medium uppercase tracking-wider text-muted-foreground hover:no-underline">
              <span className="inline-flex items-center gap-2">
                {KIND_LABEL[g.kind]}
                <Badge variant="secondary" className="text-[10px]">
                  {g.items.length}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-0.5">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(a.id === selectedId ? null : a.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        a.id === selectedId
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                      title={a.id === selectedId ? "다시 클릭하면 선택 해제" : ""}
                    >
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
