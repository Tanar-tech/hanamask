import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import type { Image, Note } from "../../shared/preload-api";
import { EntityLinks } from "./EntityLinks";
import { MermaidDiagram } from "./MermaidDiagram";
import { NoteVersionHistory } from "./NoteVersionHistory";

interface NoteDetailProps {
  noteId: string;
  onBack: () => void;
}

interface BodySegment {
  kind: "text" | "mermaid";
  content: string;
}

interface NoteDraft {
  title: string;
  body: string;
  tagsText: string;
}

const NOT_FOUND_MESSAGE = "ノートが見つかりません";
const UPDATE_FAILED_MESSAGE = "ノートの更新に失敗しました";
const TAG_SEPARATOR = ",";
const BODY_TEXTAREA_ROWS = 12;
const ATTACH_LABEL = "画像を添付";
const EXTERNAL_UPDATE_MESSAGE = "このノートは別の場所で更新されました";
const DISCARD_LABEL = "破棄して最新を読み込む";
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";
const PREVIEW_MAX_WIDTH_PX = 320;

// readAsDataURL yields "data:<mime>;base64,<payload>"; the IPC contract takes the payload alone.
const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error(`ファイルを読み込めませんでした: ${file.name}`));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(`ファイルを読み込めませんでした: ${file.name}`));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });

const findImageFile = (clipboardData: DataTransfer | null): File | null => {
  if (clipboardData === null) return null;
  const imageItem = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? null;
};

const MERMAID_FENCE = /^```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n?^```[ \t]*$/gm;

const splitByMermaidFence = (body: string): BodySegment[] => {
  const segments: BodySegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MERMAID_FENCE)) {
    const text = body.slice(lastIndex, match.index);
    if (text.trim() !== "") segments.push({ kind: "text", content: text });
    segments.push({ kind: "mermaid", content: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
  }
  const rest = body.slice(lastIndex);
  if (rest.trim() !== "") segments.push({ kind: "text", content: rest });
  return segments;
};

const renderSegment = (segment: BodySegment, index: number): JSX.Element =>
  segment.kind === "mermaid" ? (
    <MermaidDiagram key={`${segment.kind}-${index}`} code={segment.content} />
  ) : (
    <p key={`${segment.kind}-${index}`} style={{ whiteSpace: "pre-wrap" }}>
      {segment.content}
    </p>
  );

const toDraft = (note: Note): NoteDraft => ({
  title: note.title,
  body: note.body,
  tagsText: note.tags.join(`${TAG_SEPARATOR} `),
});

const parseTags = (tagsText: string): string[] =>
  tagsText
    .split(TAG_SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

const ExternalUpdateNotice = ({ onDiscard }: { onDiscard: () => void }): JSX.Element => (
  <div role="status">
    <p>{EXTERNAL_UPDATE_MESSAGE}</p>
    <button type="button" onClick={onDiscard}>
      {DISCARD_LABEL}
    </button>
  </div>
);

interface NoteEditFormProps {
  draft: NoteDraft;
  error: string | null;
  onChange: (patch: Partial<NoteDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const NoteEditForm = ({
  draft,
  error,
  onChange,
  onSave,
  onCancel,
}: NoteEditFormProps): JSX.Element => (
  <>
    <input
      aria-label="タイトル"
      value={draft.title}
      onChange={(event) => {
        onChange({ title: event.target.value });
      }}
    />
    <textarea
      aria-label="本文"
      rows={BODY_TEXTAREA_ROWS}
      value={draft.body}
      onChange={(event) => {
        onChange({ body: event.target.value });
      }}
    />
    <input
      aria-label="タグ"
      value={draft.tagsText}
      onChange={(event) => {
        onChange({ tagsText: event.target.value });
      }}
    />
    <button type="button" onClick={onSave}>
      保存
    </button>
    <button type="button" onClick={onCancel}>
      キャンセル
    </button>
    {error !== null && <p role="alert">{error}</p>}
  </>
);

export const NoteDetail = ({ noteId, onBack }: NoteDetailProps): JSX.Element => {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [externalNote, setExternalNote] = useState<Note | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const editing = draft !== null;
  // 変更通知のコールバックは購読時のstateを閉じ込めてしまうため、判断材料は都度refから読む。
  const liveStateRef = useRef({ editing, restoring });
  useEffect(() => {
    liveStateRef.current = { editing, restoring };
  }, [editing, restoring]);

  const reloadImages = useCallback(async (): Promise<void> => {
    setImages(await window.hanamask.listImages(noteId));
  }, [noteId]);

  const reloadNote = useCallback(async (): Promise<void> => {
    // 復元の応答待ち中に取得すると復元前の内容が後から届き、復元結果を打ち消しうる。
    if (liveStateRef.current.restoring) return;
    const latest = await window.hanamask.getNote(noteId);
    setReloadError(null);
    if (latest === null) return;
    // 編集中の入力を失わせないため、反映せず通知だけ出して利用者に選ばせる。
    if (liveStateRef.current.editing) setExternalNote(latest);
    else setNote(latest);
  }, [noteId]);

  const discardDraft = (): void => {
    if (externalNote !== null) setNote(externalNote);
    setExternalNote(null);
    setDraft(null);
    setSaveError(null);
  };

  useEffect(() => {
    // ノート切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    setReloadError(null);
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getNote(noteId);
        if (!current) return;
        setNote(loaded);
        setDraft(null);
        setSaveError(null);
        setExternalNote(null);
        setError(loaded === null ? NOT_FOUND_MESSAGE : null);
      } catch (cause) {
        if (current) setError(`ノートの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [noteId]);

  useEffect(() => {
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listImages(noteId);
        if (current) setImages(loaded);
      } catch (cause) {
        if (current) setAttachError(`画像の読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [noteId]);

  // MCPツール経由の更新・添付は同じ画面を開いたまま起きるため、変更通知で取り直す。
  useEffect(
    () =>
      window.hanamask.onNotesChanged(() => {
        void reloadImages().catch((cause: unknown) => {
          setAttachError(`画像の読み込みに失敗しました: ${String(cause)}`);
        });
        void reloadNote().catch((cause: unknown) => {
          setReloadError(`最新の内容の取得に失敗しました: ${String(cause)}`);
        });
      }),
    [reloadImages, reloadNote],
  );

  const attachFile = useCallback(
    async (file: File): Promise<void> => {
      try {
        setAttachError(null);
        const dataBase64 = await readFileAsBase64(file);
        await window.hanamask.attachImage(noteId, file.name, dataBase64, file.type);
        await reloadImages();
      } catch (cause) {
        setAttachError(`画像の添付に失敗しました: ${String(cause)}`);
      }
    },
    [noteId, reloadImages],
  );

  const patchDraft = (patch: Partial<NoteDraft>): void => {
    setDraft((current) => (current === null ? null : { ...current, ...patch }));
  };

  const saveDraft = async (): Promise<void> => {
    if (draft === null) return;
    try {
      setSaveError(null);
      const updated = await window.hanamask.updateNote(noteId, {
        title: draft.title,
        body: draft.body,
        tags: parseTags(draft.tagsText),
      });
      if (updated === null) {
        setSaveError(NOT_FOUND_MESSAGE);
        return;
      }
      setNote(updated);
      setDraft(null);
      setExternalNote(null);
    } catch (cause) {
      setSaveError(`${UPDATE_FAILED_MESSAGE}: ${String(cause)}`);
    }
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    void attachFile(file);
  };

  // 詳細画面にはフォーカスを持つ要素が無く、貼り付けはdocumentにしか届かないため、
  // 要素のonPasteではなくdocumentを購読する。
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent): void => {
      const file = findImageFile(event.clipboardData);
      if (file === null) return;
      event.preventDefault();
      void attachFile(file);
    };
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [attachFile]);

  return (
    <article>
      <button type="button" onClick={onBack}>
        戻る
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {reloadError !== null && <p role="alert">{reloadError}</p>}
      {note !== null && error === null && draft !== null && (
        <>
          {externalNote !== null && <ExternalUpdateNotice onDiscard={discardDraft} />}
          <NoteEditForm
            draft={draft}
            error={saveError}
            onChange={patchDraft}
            onSave={() => {
              void saveDraft();
            }}
            onCancel={discardDraft}
          />
        </>
      )}
      {note !== null && error === null && draft === null && (
        <>
          <h2>{note.title}</h2>
          <button
            type="button"
            // 復元の応答待ち中に編集を始めると、復元前の内容を基にしたフォームの保存で復元結果が失われる。
            disabled={restoring}
            onClick={() => {
              setDraft(toDraft(note));
            }}
          >
            編集
          </button>
          {splitByMermaidFence(note.body).map(renderSegment)}
          <ul>
            {note.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
          <input
            type="file"
            aria-label={ATTACH_LABEL}
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={handleFileSelected}
          />
          {attachError !== null && <p role="alert">{attachError}</p>}
          <ul>
            {images.map((image) => (
              <li key={image.id}>
                <img
                  src={image.fileUrl}
                  alt={ATTACH_LABEL}
                  style={{ maxWidth: PREVIEW_MAX_WIDTH_PX }}
                />
              </li>
            ))}
          </ul>
          <EntityLinks entityType="note" entityId={noteId} />
          <NoteVersionHistory
            noteId={noteId}
            onRestored={setNote}
            onRestoringChange={setRestoring}
          />

        </>
      )}
    </article>
  );
};
