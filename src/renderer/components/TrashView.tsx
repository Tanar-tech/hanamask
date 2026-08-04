import { useEffect, useRef, useState, type JSX } from "react";
import type { Note } from "../../shared/preload-api";

interface TrashViewProps {
  onBack: () => void;
}

const HEADING = "ゴミ箱";
const EMPTY_MESSAGE = "削除済みのノートはありません";
const RESTORE_LABEL = "復元";
const BACK_LABEL = "戻る";
const NOTE_MISSING_MESSAGE = "対象のノートが見つかりません";
const BODY_PREVIEW_MAX_LENGTH = 80;

const toBodyPreview = (body: string): string =>
  body.length <= BODY_PREVIEW_MAX_LENGTH ? body : `${body.slice(0, BODY_PREVIEW_MAX_LENGTH)}…`;

export const TrashView = ({ onBack }: TrashViewProps): JSX.Element => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const mounted = useRef(true);

  // StrictModeの二重マウントで再利用されるため、初期値ではなくマウント時に立て直す。
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // アンマウント後に古い取得結果が届いて状態を上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listDeletedNotes();
        if (!current) return;
        setNotes(loaded);
        setError(null);
      } catch (cause) {
        if (current) setError(`削除済みノートの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, []);

  const restore = async (id: string): Promise<void> => {
    // 復元中は全ての復元ボタンを無効化する。多重復元を許すと、先に完了した方の
    // 再取得結果を後から届いた復元の再取得結果が上書きしうる。
    setRestoring(true);
    try {
      setError(null);
      const restored = await window.hanamask.restoreNote(id);
      if (!mounted.current) return;
      if (restored === null) {
        setError(NOTE_MISSING_MESSAGE);
        return;
      }
      const reloaded = await window.hanamask.listDeletedNotes();
      if (mounted.current) setNotes(reloaded);
    } catch (cause) {
      if (mounted.current) setError(`ノートの復元に失敗しました: ${String(cause)}`);
    } finally {
      if (mounted.current) setRestoring(false);
    }
  };

  return (
    <section>
      <h2>{HEADING}</h2>
      <button type="button" onClick={onBack}>
        {BACK_LABEL}
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {notes.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            <span>{note.title}</span>
            <p>{toBodyPreview(note.body)}</p>
            <button
              type="button"
              disabled={restoring}
              onClick={() => {
                void restore(note.id);
              }}
            >
              {RESTORE_LABEL}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
