import { useEffect, useState } from "react";
import type { AssetKind } from "@opspilot/shared-types";
import { useAssets } from "../../registry/use-registry";
import { useAssetContent, useAuthorAsset } from "../use-authoring";

interface Props {
  projectId: string;
  selectedAssetId: string | null;
}

function template(kind: AssetKind, name: string): string {
  const fm = `---\nname: ${name || "이름"}\ndescription: 한 줄 설명 (언제 트리거되는지)\n---\n\n`;
  return `${fm}# ${name || "Asset"}\n\n프롬프트 본문을 여기에.\n`;
}

// OPSP-19 척추: OpsPilot에서 자산 작성/수정 → 저장 시 클론 .claude 에 쓰고
// 강제 구조화 커밋(=새 버전). 변경 요약 없이는 저장 불가.
export function AssetAuthor({ projectId, selectedAssetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const editing = (assets ?? []).find((a) => a.id === selectedAssetId) ?? null;
  const { data: loadedContent } = useAssetContent(editing ? selectedAssetId : null);
  const author = useAuthorAsset(projectId);

  const [kind, setKind] = useState<AssetKind>("agent");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [rationale, setRationale] = useState("");

  // 기존 자산 선택 시 그 종류/이름/본문으로 prefill (→ 저장하면 v_n+1)
  useEffect(() => {
    if (editing) {
      setKind(editing.kind);
      setName(editing.name);
    }
  }, [editing]);
  useEffect(() => {
    if (editing && loadedContent !== undefined) setContent(loadedContent);
  }, [editing, loadedContent]);

  const isEdit = editing !== null;
  const canSubmit = name.trim() !== "" && content.trim() !== "" && changeSummary.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        author.mutate(
          { projectId, kind, name: name.trim(), content, changeSummary, rationale },
          {
            onSuccess: () => {
              setChangeSummary("");
              setRationale("");
            },
          },
        );
      }}
      style={{ border: "1px solid #8250df", borderRadius: 6, padding: 12, marginTop: 12 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        {isEdit ? `자산 수정 → 새 버전: ${editing.kind}/${editing.name}` : "새 자산 작성"}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as AssetKind)}
          disabled={isEdit}
          style={{ padding: 6 }}
        >
          <option value="agent">agent</option>
          <option value="skill">skill</option>
          <option value="command">command</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isEdit}
          placeholder="이름 (영숫자/._-)"
          style={{ flex: 1, padding: 6 }}
        />
        {!isEdit && (
          <button type="button" onClick={() => setContent(template(kind, name))}>
            템플릿
          </button>
        )}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        placeholder="자산 본문 (frontmatter 포함)"
        style={{ width: "100%", padding: 6, fontFamily: "monospace", fontSize: 12, boxSizing: "border-box" }}
      />
      <input
        value={changeSummary}
        onChange={(e) => setChangeSummary(e.target.value)}
        placeholder="변경 요약 — 무엇을 바꿨나 (필수, 커밋에 강제 기록)"
        style={{ width: "100%", padding: 6, margin: "6px 0", boxSizing: "border-box" }}
      />
      <input
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="이유 — 왜 (선택)"
        style={{ width: "100%", padding: 6, marginBottom: 6, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="submit" disabled={author.isPending || !canSubmit}>
          {author.isPending ? "커밋 중…" : isEdit ? "수정 저장 → 새 버전" : "작성 → 버전 생성"}
        </button>
        {author.isSuccess && (
          <span style={{ color: "green", fontSize: 12 }}>
            커밋 {author.data.committed.slice(0, 8)} · 버전 +{author.data.scanned.versions}
          </span>
        )}
        {author.isError && (
          <span style={{ color: "crimson", fontSize: 12 }}>{author.error.message}</span>
        )}
      </div>
    </form>
  );
}
