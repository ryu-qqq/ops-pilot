import { useEffect, useMemo, useState } from "react";
import type { AssetKind } from "@opspilot/shared-types";
import { useAssets } from "../../registry/use-registry";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetContent, useAuthorAsset } from "../use-authoring";
import {
  DOCS_URL,
  KEY_META,
  KIND_KEYS,
  type ModelChoice,
  bodyTemplate,
  parseFile,
  serializeFrontmatter,
  validateFrontmatter,
} from "../lib/frontmatter";

interface Props {
  projectId: string;
  selectedAssetId: string | null;
}

const MODEL_OPTIONS: ModelChoice[] = ["inherit", "sonnet", "opus", "haiku"];

const fieldStyle = {
  width: "100%",
  padding: 6,
  marginBottom: 6,
  boxSizing: "border-box" as const,
};
const labelStyle = { fontSize: 12, color: "#57606a", marginTop: 6, marginBottom: 2 };

// OPSP-19 척추 + OPSP-26 공식 스펙 반영: 자유 textarea 대신 kind별 구조화 폼.
// frontmatter는 키별 필드로 입력 → 저장 시 단순 YAML로 직렬화해 본문 앞에 붙임.
// edit 모드는 기존 content를 parseFile로 분해해 prefill.
export function AssetAuthor({ projectId, selectedAssetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const editing = (assets ?? []).find((a) => a.id === selectedAssetId) ?? null;
  const { data: loadedContent } = useAssetContent(editing ? selectedAssetId : null);
  const author = useAuthorAsset(projectId);

  const [kind, setKind] = useState<AssetKind>("agent");
  const [fm, setFm] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  const isEdit = editing !== null;
  const name = fm.name ?? "";

  // 새 자산: kind 변경 시 폼 키 셋만 유지하고 빈 값으로 정리.
  useEffect(() => {
    if (isEdit) return;
    setFm((prev) => {
      const next: Record<string, string> = {};
      for (const k of KIND_KEYS[kind]) {
        if (typeof prev[k] === "string") next[k] = prev[k];
      }
      return next;
    });
  }, [kind, isEdit]);

  // edit 모드 prefill — 자산이 바뀌면 kind/name 고정, content 파싱해 폼 채움.
  useEffect(() => {
    if (editing) {
      setKind(editing.kind);
    }
  }, [editing]);
  useEffect(() => {
    if (editing && loadedContent !== undefined) {
      const parsed = parseFile(loadedContent);
      setFm({ ...parsed.frontmatter, name: editing.name });
      setBody(parsed.body);
    }
  }, [editing, loadedContent]);

  // 저장 직전 합성: frontmatter YAML + 본문.
  const serialized = useMemo(() => {
    const fmOnly: Record<string, string> = {};
    for (const k of KIND_KEYS[kind]) {
      const v = fm[k as string];
      if (typeof v === "string" && v.trim() !== "") fmOnly[k as string] = v.trim();
    }
    return serializeFrontmatter(fmOnly) + body;
  }, [fm, body, kind]);

  const validationError = useMemo(() => validateFrontmatter(kind, fm), [kind, fm]);
  const canSubmit = validationError === null && body.trim() !== "" && changeSummary.trim() !== "";

  const setField = (key: string, value: string) => setFm((prev) => ({ ...prev, [key]: value }));

  const applyTemplate = () => {
    // name·description은 사용자가 채우게 두고, 본문만 정확본으로.
    setBody(bodyTemplate(kind, name));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        author.mutate(
          { projectId, kind, name: name.trim(), content: serialized, changeSummary, rationale },
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
        <InfoMark
          label="자산 저작"
          help="작성/저장은 클론의 .claude 에 파일을 쓰고 ‘ops(kind/name): 변경요약 [opspilot authored]’ 구조화 커밋을 만들며, 그 커밋이 곧 새 자산 버전이 됩니다. 변경 요약이 없으면 저장이 거부됩니다(추적 불가 방지)."
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
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
        <a
          href={DOCS_URL[kind]}
          target="_blank"
          rel="noreferrer noopener"
          style={{ fontSize: 12, color: "#0969da" }}
        >
          공식 스펙 ↗
        </a>
        {!isEdit && (
          <button type="button" onClick={applyTemplate} style={{ marginLeft: "auto" }}>
            본문 템플릿
          </button>
        )}
      </div>

      {/* kind별 frontmatter 입력 */}
      {KIND_KEYS[kind].map((k) => {
        const key = k as string;
        const meta = KEY_META[key] ?? { label: key, help: "" };
        const value = fm[key] ?? "";
        const common = {
          value,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
            setField(key, e.target.value),
          disabled: isEdit && key === "name",
          style: fieldStyle,
        };
        return (
          <div key={key}>
            <div style={labelStyle}>
              {meta.label}
              {meta.required && <span style={{ color: "#cf222e" }}> *</span>}
              <InfoMark label={meta.label} help={meta.help} />
            </div>
            {key === "model" ? (
              <select {...common}>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m === "inherit" ? "" : m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                {...common}
                placeholder={meta.placeholder}
              />
            )}
          </div>
        );
      })}

      <div style={labelStyle}>
        본문 (markdown)
        <InfoMark
          label="본문"
          help="에이전트/스킬/커맨드의 실제 지시문. frontmatter 위에 자동으로 합쳐져 파일로 저장됩니다."
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        placeholder="본문(markdown). 위의 ‘본문 템플릿’ 버튼으로 kind별 기본 골격을 얻을 수 있습니다."
        style={{ ...fieldStyle, fontFamily: "monospace", fontSize: 12 }}
      />

      <details
        style={{ marginBottom: 6 }}
        open={showRaw}
        onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ fontSize: 12, color: "#57606a", cursor: "pointer" }}>
          저장될 파일 미리보기
        </summary>
        <pre
          style={{
            background: "#f6f8fa",
            border: "1px solid #d0d7de",
            borderRadius: 4,
            padding: 8,
            fontSize: 11,
            overflowX: "auto",
            margin: "4px 0",
          }}
        >
          {serialized}
        </pre>
      </details>

      <input
        value={changeSummary}
        onChange={(e) => setChangeSummary(e.target.value)}
        placeholder="변경 요약 — 무엇을 바꿨나 (필수, 커밋에 강제 기록)"
        style={fieldStyle}
      />
      <input
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="이유 — 왜 (선택)"
        style={fieldStyle}
      />

      {validationError !== null && (
        <p style={{ color: "#cf222e", fontSize: 12, margin: "4px 0" }}>{validationError}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="submit" disabled={author.isPending || !canSubmit}>
          {author.isPending ? (
            <Loading label="커밋 중…" />
          ) : isEdit ? (
            "수정 저장 → 새 버전"
          ) : (
            "작성 → 버전 생성"
          )}
        </button>
        {author.isSuccess && (
          <span style={{ color: "green", fontSize: 12 }}>
            커밋 {author.data.committed.slice(0, 8)} · 버전 +{author.data.scanned.versions}
          </span>
        )}
        {author.isError && <InlineError error={author.error} />}
      </div>
    </form>
  );
}
