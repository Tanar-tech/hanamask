import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Note, NoteVersion } from "../../shared/preload-api";

interface NoteVersionHistoryProps {
  noteId: string;
  onRestored: (note: Note) => void;
  onRestoringChange: (restoring: boolean) => void;
}

const HEADING = "編集履歴";
const EMPTY_MESSAGE = "編集履歴はありません";
const RESTORE_LABEL = "このバージョンに戻す";
const RESTORE_CONFIRM_MESSAGE = "このバージョンの内容でノートを上書きしますか？";
const VERSION_MISSING_MESSAGE = "対象のバージョンが見つかりません";
const BODY_PREVIEW_MAX_LENGTH = 80;

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const ALERT =
  "m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit";
const RESTORE_BUTTON = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-ink-aqua bg-transparent px-3 py-1.5 font-body text-sm text-ink-aqua-text transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:opacity-50`;

const toBodyPreview = (body: string): string =>
  body.length <= BODY_PREVIEW_MAX_LENGTH ? body : `${body.slice(0, BODY_PREVIEW_MAX_LENGTH)}…`;

export const NoteVersionHistory = ({
  noteId,
  onRestored,
  onRestoringChange,
}: NoteVersionHistoryProps): JSX.Element => {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
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

  const reload = useCallback(async (): Promise<void> => {
    const loaded = await window.hanamask.listNoteVersions(noteId);
    if (mounted.current) setVersions(loaded);
  }, [noteId]);

  useEffect(() => {
    // ノート切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listNoteVersions(noteId);
        if (!current) return;
        setVersions(loaded);
        setError(null);
      } catch (cause) {
        if (current) setError(`編集履歴の読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [noteId]);

  const restore = async (versionId: string): Promise<void> => {
    if (!window.confirm(RESTORE_CONFIRM_MESSAGE)) return;
    // 復元中は全ての復元ボタンを無効化する。多重復元を許すと、先に完了した方の
    // finallyが親の復元中フラグを倒し、まだ未完了の復元がレースに戻ってしまう。
    setRestoring(true);
    onRestoringChange(true);
    try {
      setError(null);
      const restored = await window.hanamask.restoreNoteVersion(versionId);
      // アンマウント後（編集モードへの移行・画面離脱）に復元結果を親へ反映すると、
      // 復元前の内容を基にした編集フォームの保存で復元結果が失われる。
      if (!mounted.current) return;
      if (restored === null) {
        setError(VERSION_MISSING_MESSAGE);
        return;
      }
      onRestored(restored);
      // 復元操作自体も新しいバージョンとして積まれるため、履歴を取り直す。
      await reload();
    } catch (cause) {
      if (mounted.current) setError(`バージョンの復元に失敗しました: ${String(cause)}`);
    } finally {
      if (mounted.current) setRestoring(false);
      // アンマウント済みでも通知する。通知しないと親の復元中フラグが立ったままになる。
      onRestoringChange(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 font-display text-sm tracking-wide text-text-faint">{HEADING}</h3>
      {error !== null && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
      {versions.length === 0 && (
        <p className="m-0 rounded-md border border-dashed border-line px-4 py-6 text-center font-body text-sm text-text-faint">
          {EMPTY_MESSAGE}
        </p>
      )}
      {versions.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-paper-raised px-4 py-3"
            >
              <span className="font-body text-sm font-semibold text-text">{version.title}</span>
              <time dateTime={version.createdAt} className="font-mono text-xs text-text-faint">
                {version.createdAt}
              </time>
              <span className="w-full font-body text-sm break-words text-text-soft">
                {toBodyPreview(version.body)}
              </span>
              <button
                type="button"
                className={RESTORE_BUTTON}
                disabled={restoring}
                onClick={() => {
                  void restore(version.id);
                }}
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
