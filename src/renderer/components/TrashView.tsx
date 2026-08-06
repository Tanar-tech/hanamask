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
const LIST_LABEL = "削除済みノート";
const BODY_PREVIEW_MAX_LENGTH = 80;

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const BUTTON_QUIET = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint disabled:hover:bg-transparent`;

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
    <section className="flex flex-col gap-4 font-body text-text">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-display text-xl font-bold tracking-wide">{HEADING}</h2>
        <button type="button" onClick={onBack} className={BUTTON_QUIET}>
          {BACK_LABEL}
        </button>
      </header>
      {error !== null && (
        <p
          role="alert"
          className="m-0 rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}
      {notes.length === 0 && (
        <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-text-faint">
          {EMPTY_MESSAGE}
        </p>
      )}
      {notes.length > 0 && (
        <ul aria-label={LIST_LABEL} className="m-0 flex list-none flex-col gap-3 p-0">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-solid border-line bg-paper-raised px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-display text-base font-semibold">{note.title}</span>
                <p className="m-0 text-sm leading-relaxed text-text-soft">
                  {toBodyPreview(note.body)}
                </p>
              </div>
              <button
                type="button"
                disabled={restoring}
                onClick={() => {
                  void restore(note.id);
                }}
                className={BUTTON_PRIMARY}
              >
                {RESTORE_LABEL}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
