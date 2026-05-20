import { useEffect, useMemo, useState } from "react";
import type { AssetKind } from "@opspilot/shared-types";
import { useAssets } from "../../registry/use-registry";
import { InfoMark, InlineError, Loading } from "../../../lib/ui";
import { useAssetContent, useAuthorAsset, useReviewAuthoring } from "../use-authoring";
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
import s from "./asset-author.module.css";

interface Props {
  projectId: string;
  selectedAssetId: string | null;
}

const MODEL_OPTIONS: ModelChoice[] = ["inherit", "sonnet", "opus", "haiku"];

// OPSP-19 척추 + OPSP-26 공식 스펙 반영: 자유 textarea 대신 kind별 구조화 폼.
// frontmatter는 키별 필드로 입력 → 저장 시 단순 YAML로 직렬화해 본문 앞에 붙임.
// edit 모드는 기존 content를 parseFile로 분해해 prefill.
export function AssetAuthor({ projectId, selectedAssetId }: Props) {
  const { data: assets } = useAssets(projectId);
  const editing = (assets ?? []).find((a) => a.id === selectedAssetId) ?? null;
  const { data: loadedContent } = useAssetContent(editing ? selectedAssetId : null);
  const author = useAuthorAsset(projectId);
  const review = useReviewAuthoring();

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
      className={s.form}
    >
      <div className={s.title}>
        {isEdit ? `자산 수정 → 새 버전: ${editing.kind}/${editing.name}` : "새 자산 작성"}
        <InfoMark
          label="자산 저작"
          help="작성/저장은 클론의 .claude 에 파일을 쓰고 ‘ops(kind/name): 변경요약 [opspilot authored]’ 구조화 커밋을 만들며, 그 커밋이 곧 새 자산 버전이 됩니다. 변경 요약이 없으면 저장이 거부됩니다(추적 불가 방지)."
        />
      </div>

      <div className={s.kindRow}>
        <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)} disabled={isEdit}>
          <option value="agent">agent</option>
          <option value="skill">skill</option>
          <option value="command">command</option>
        </select>
        <a href={DOCS_URL[kind]} target="_blank" rel="noreferrer noopener" className={s.docsLink}>
          공식 스펙 ↗
        </a>
        {!isEdit && (
          <button type="button" onClick={applyTemplate} className={s.templateBtn}>
            본문 템플릿
          </button>
        )}
      </div>

      {KIND_KEYS[kind].map((k) => {
        const key = k as string;
        const meta = KEY_META[key] ?? { label: key, help: "" };
        const value = fm[key] ?? "";
        return (
          <div key={key}>
            <div className={s.fieldLabel}>
              {meta.label}
              {meta.required && <span className={s.required}> *</span>}
              <InfoMark label={meta.label} help={meta.help} />
            </div>
            {key === "model" ? (
              <select
                value={value}
                onChange={(e) => setField(key, e.target.value)}
                className={s.field}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m === "inherit" ? "" : m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => setField(key, e.target.value)}
                disabled={isEdit && key === "name"}
                placeholder={meta.placeholder}
                className={s.field}
              />
            )}
          </div>
        );
      })}

      <div className={s.fieldLabel}>
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
        className={s.bodyArea}
      />

      <details
        className={s.preview}
        open={showRaw}
        onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
      >
        <summary className={s.previewSummary}>저장될 파일 미리보기</summary>
        <pre className={s.previewPre}>{serialized}</pre>
      </details>

      <input
        value={changeSummary}
        onChange={(e) => setChangeSummary(e.target.value)}
        placeholder="변경 요약 — 무엇을 바꿨나 (필수, 커밋에 강제 기록)"
        className={s.field}
      />
      <input
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="이유 — 왜 (선택)"
        className={s.field}
      />

      {validationError !== null && <p className={s.validationError}>{validationError}</p>}

      {/* OPSP-27 A: 저장 전 로컬 Claude 검수. 자동 적용 X — 사용자가 보고 결정. */}
      <div className={s.reviewRow}>
        <button
          type="button"
          disabled={review.isPending || name.trim() === "" || body.trim() === ""}
          onClick={() => review.mutate({ kind, name: name.trim(), content: serialized })}
          title="로컬 Claude 가 초안의 의도·개선점을 한국어로 짧게 평가합니다 (실 토큰 소모, ~10-30초)"
        >
          {review.isPending ? <Loading label="Claude 검수 중…" /> : "🤖 AI 검수 (의도·개선)"}
        </button>
        <InfoMark
          label="AI 검수"
          help="저장 전 초안을 로컬 Claude 에 보내 ‘어떤 의도로 읽히는가 + 개선 제안’을 받습니다. 자동 적용 X — 결과를 보고 사용자가 직접 수정·저장. 실 토큰 소모."
        />
        {review.isError && <InlineError error={review.error} />}
      </div>
      {review.isSuccess && <div className={s.reviewPanel}>{review.data}</div>}

      <div className={s.submitRow}>
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
          <span className={s.successText}>
            커밋 {author.data.committed.slice(0, 8)} · 버전 +{author.data.scanned.versions}
          </span>
        )}
        {author.isError && <InlineError error={author.error} />}
      </div>
    </form>
  );
}
