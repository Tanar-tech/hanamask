import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note, NoteVersion } from "../../shared/preload-api";

interface NoteVersionHistoryProps {
  noteId: string;
  onRestored: (note: Note) => void;
}

const HEADING = "編集履歴";
const EMPTY_MESSAGE = "編集履歴はありません";
const RESTORE_LABEL = "このバージョンに戻す";
const RESTORE_CONFIRM_MESSAGE = "このバージョンの内容でノートを上書きしますか？";
const VERSION_MISSING_MESSAGE = "対象のバージョンが見つかりません";
const BODY_PREVIEW_MAX_LENGTH = 80;

const toBodyPreview = (body: string): string =>
  body.length <= BODY_PREVIEW_MAX_LENGTH ? body : `${body.slice(0, BODY_PREVIEW_MAX_LENGTH)}…`;

export const NoteVersionHistory = ({
  noteId,
  onRestored,
}: NoteVersionHistoryProps): JSX.Element => {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setVersions(await window.hanamask.listNoteVersions(noteId));
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
    try {
      setError(null);
      const restored = await window.hanamask.restoreNoteVersion(versionId);
      if (restored === null) {
        setError(VERSION_MISSING_MESSAGE);
        return;
      }
      onRestored(restored);
      // 復元操作自体も新しいバージョンとして積まれるため、履歴を取り直す。
      await reload();
    } catch (cause) {
      setError(`バージョンの復元に失敗しました: ${String(cause)}`);
    }
  };

  return (
    <section>
      <h3>{HEADING}</h3>
      {error !== null && <p role="alert">{error}</p>}
      {versions.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <span>{version.title}</span>
            <time dateTime={version.createdAt}>{version.createdAt}</time>
            <span>{toBodyPreview(version.body)}</span>
            <button
              type="button"
              onClick={() => {
                void restore(version.id);
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
