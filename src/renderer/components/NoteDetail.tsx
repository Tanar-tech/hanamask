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
const TITLE_FIELD_ID = "note-detail-title";
const BODY_FIELD_ID = "note-detail-body";
const TAGS_FIELD_ID = "note-detail-tags";
const IMAGE_FIELD_ID = "note-detail-image";

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const RESET_LIST = "m-0 list-none p-0";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border bg-transparent px-3 py-2 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50`;
// アクア＝利用者の操作。主たる操作だけ面を薄く敷いて他と見分けられるようにする。
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua bg-ink-aqua/10 font-semibold text-ink-aqua-text`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
const ALERT =
  "m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit";
const FIELD_LABEL = "font-display text-xs tracking-wide text-text-faint";
// box-border: preflight を入れていないため box-sizing は content-box のまま。
// w-full と padding/border が足し算になり、指定しないと入力欄が画面からはみ出す。
const FIELD = `${FOCUS_RING} m-0 box-border w-full rounded-md border border-line bg-paper-raised px-3 py-2 font-body text-sm text-text`;
const SECTION_LABEL = "font-display text-sm tracking-wide text-text-faint";

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
    <p
      key={`${segment.kind}-${index}`}
      className="m-0 font-body text-base leading-relaxed break-words whitespace-pre-wrap text-text"
    >
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

// ピンク＝自分以外の手で変わったこと。読む前に「外から来た知らせ」だと分かるようにする。
const ExternalUpdateNotice = ({ onDiscard }: { onDiscard: () => void }): JSX.Element => (
  <div
    role="status"
    className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-pink bg-ink-pink/10 px-4 py-3"
  >
    <p className="m-0 flex-1 font-body text-sm text-ink-pink">{EXTERNAL_UPDATE_MESSAGE}</p>
    <button type="button" onClick={onDiscard} className={BUTTON_SECONDARY}>
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
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <label htmlFor={TITLE_FIELD_ID} className={FIELD_LABEL}>
        タイトル
      </label>
      <input
        id={TITLE_FIELD_ID}
        className={`${FIELD} font-display text-lg font-semibold`}
        value={draft.title}
        onChange={(event) => {
          onChange({ title: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor={BODY_FIELD_ID} className={FIELD_LABEL}>
        本文
      </label>
      <textarea
        id={BODY_FIELD_ID}
        className={`${FIELD} resize-y leading-relaxed`}
        rows={BODY_TEXTAREA_ROWS}
        value={draft.body}
        onChange={(event) => {
          onChange({ body: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor={TAGS_FIELD_ID} className={FIELD_LABEL}>
        タグ
      </label>
      <input
        id={TAGS_FIELD_ID}
        className={FIELD}
        value={draft.tagsText}
        onChange={(event) => {
          onChange({ tagsText: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onSave} className={BUTTON_PRIMARY}>
        保存
      </button>
      <button type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
        キャンセル
      </button>
    </div>
    {error !== null && (
      <p role="alert" className={ALERT}>
        {error}
      </p>
    )}
  </div>
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
  // mutationCountは利用者の操作で表示中の内容が変わるたびに増える。取得の前後で値が変われば、
  // その取得は操作前の内容なので捨てる。restoringの再判定では塞げない（取得が解決する頃には
  // 操作が完了していてフラグは既に降りているため）。加算は操作の開始時なので、操作が失敗すると
  // 待機中だった正当な取得を1回だけ捨てる。次の変更通知で取り直されるため許容している。
  // imageMutationCountは画像一覧だけを対象にした同じ仕組み。mutationCountに相乗りさせると
  // 画像を添付するたびに待機中のノート本体の取得まで捨ててしまうため、別に持つ。
  const liveStateRef = useRef({ editing, restoring, mutationCount: 0, imageMutationCount: 0 });
  useEffect(() => {
    liveStateRef.current.editing = editing;
    liveStateRef.current.restoring = restoring;
  }, [editing, restoring]);

  const handleRestoringChange = useCallback((next: boolean): void => {
    if (next) liveStateRef.current.mutationCount += 1;
    setRestoring(next);
  }, []);

  const reloadImages = useCallback(async (): Promise<void> => {
    const startedAtImageMutationCount = liveStateRef.current.imageMutationCount;
    const latest = await window.hanamask.listImages(noteId);
    // 添付前に始まった取得が後から解決すると、添付した画像が一覧から消える。
    if (liveStateRef.current.imageMutationCount !== startedAtImageMutationCount) return;
    setImages(latest);
  }, [noteId]);

  const reloadNote = useCallback(async (): Promise<void> => {
    // 復元の応答待ち中に取得すると復元前の内容が後から届き、復元結果を打ち消しうる。
    if (liveStateRef.current.restoring) return;
    const startedAtMutationCount = liveStateRef.current.mutationCount;
    const latest = await window.hanamask.getNote(noteId);
    setReloadError(null);
    if (latest === null) return;
    if (liveStateRef.current.mutationCount !== startedAtMutationCount) return;
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
        // mutationCountと違い保存の完了後に加算する。添付は完了した時点で初めて一覧の内容が
        // 変わるため、ここまでに始まった取得はすべて添付前の一覧を運んでいる。
        liveStateRef.current.imageMutationCount += 1;
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
      liveStateRef.current.mutationCount += 1;
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
    <article className="flex flex-col gap-5 font-body text-text">
      <div>
        <button type="button" onClick={onBack} className={BUTTON_SECONDARY}>
          戻る
        </button>
      </div>
      {error !== null && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
      {reloadError !== null && (
        <p role="alert" className={ALERT}>
          {reloadError}
        </p>
      )}
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
          <header className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-line pb-3">
            <h2 className="m-0 font-display text-2xl leading-tight font-bold break-words text-text">
              {note.title}
            </h2>
            <button
              type="button"
              className={BUTTON_PRIMARY}
              // 復元の応答待ち中に編集を始めると、復元前の内容を基にしたフォームの保存で復元結果が失われる。
              disabled={restoring}
              onClick={() => {
                setDraft(toDraft(note));
              }}
            >
              編集
            </button>
          </header>
          {note.tags.length > 0 && (
            <ul className={`${RESET_LIST} flex flex-wrap gap-2`}>
              {note.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-line px-2 py-0.5 font-body text-xs text-text-soft"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-4">
            {splitByMermaidFence(note.body).map(renderSegment)}
          </div>
          <section className="flex flex-col gap-2">
            <label htmlFor={IMAGE_FIELD_ID} className={SECTION_LABEL}>
              {ATTACH_LABEL}
            </label>
            <input
              id={IMAGE_FIELD_ID}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleFileSelected}
              className={`${FOCUS_RING} m-0 font-body text-sm text-text-soft file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-ink-aqua file:bg-transparent file:px-3 file:py-1.5 file:font-body file:text-sm file:text-ink-aqua-text`}
            />
            {attachError !== null && (
              <p role="alert" className={ALERT}>
                {attachError}
              </p>
            )}
            {images.length > 0 && (
              <ul className={`${RESET_LIST} flex flex-wrap gap-3`}>
                {images.map((image) => (
                  <li key={image.id}>
                    <img
                      src={image.fileUrl}
                      alt={ATTACH_LABEL}
                      className="block h-auto max-w-80 rounded-md border border-line"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <EntityLinks entityType="note" entityId={noteId} />
          <NoteVersionHistory
            noteId={noteId}
            onRestored={setNote}
            onRestoringChange={handleRestoringChange}
          />
        </>
      )}
    </article>
  );
};
