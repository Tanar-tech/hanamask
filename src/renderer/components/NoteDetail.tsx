import { useCallback, useEffect, useState, type ChangeEvent, type JSX } from "react";
import type { Image, Note } from "../../shared/preload-api";

interface NoteDetailProps {
  noteId: string;
  onBack: () => void;
}

const NOT_FOUND_MESSAGE = "ノートが見つかりません";
const ATTACH_LABEL = "画像を添付";
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

export const NoteDetail = ({ noteId, onBack }: NoteDetailProps): JSX.Element => {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const reloadImages = useCallback(async (): Promise<void> => {
    setImages(await window.hanamask.listImages(noteId));
  }, [noteId]);

  useEffect(() => {
    // ノート切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getNote(noteId);
        if (!current) return;
        setNote(loaded);
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
      {note !== null && error === null && (
        <>
          <h2>{note.title}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p>
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
        </>
      )}
    </article>
  );
};
