import { useEffect, useRef, useState, type JSX } from "react";
import {
  TRASH_RETENTION_DAYS,
  type DeletedNote,
  type DeletedNotebook,
  type DeletedTask,
} from "../../shared/preload-api";



interface TrashViewProps {
  onBack: () => void;
}

const HEADING = "ゴミ箱";
const EMPTY_MESSAGE = "削除済みのページ・タスク・ノートはありません";
const RESTORE_LABEL = "復元";
const BACK_LABEL = "戻る";
const NOTE_MISSING_MESSAGE = "対象のページが見つかりません";
const TASK_MISSING_MESSAGE = "対象のタスクが見つかりません";
const NOTEBOOK_MISSING_MESSAGE = "対象のノートが見つかりません";
const NOTE_LIST_LABEL = "削除済みページ";
const TASK_LIST_LABEL = "削除済みタスク";
const NOTEBOOK_LIST_LABEL = "削除済みノート";
const BODY_PREVIEW_MAX_LENGTH = 80;

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const BUTTON_QUIET = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint disabled:hover:bg-transparent`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 期限が近いものだけ色を変える。何日から「近い」かは要求定義に無いので、猶予30日に対して
// 1週間を切ったら、という線を定数で持つ。
const SOON_THRESHOLD_DAYS = 7;

// 切り上げる。当日いっぱい残っている状態を「あと0日」と表示しないため。
const remainingDaysOf = (deletedAt: string, nowMs: number): number =>
  Math.max(Math.ceil(TRASH_RETENTION_DAYS - (nowMs - Date.parse(deletedAt)) / MS_PER_DAY), 0);

const toBodyPreview = (body: string): string =>
  body.length <= BODY_PREVIEW_MAX_LENGTH ? body : `${body.slice(0, BODY_PREVIEW_MAX_LENGTH)}…`;

/** ページとタスクで共通に見せる項目。ゴミ箱ではこの4つしか使わない。 */
interface TrashItem {
  id: string;
  title: string;
  body: string;
  deletedAt: string;
}

/** ノートの「概要」はページの本文にあたるので、共通項目では body として見せる。 */
const notebooksAsTrashItems = (notebooks: DeletedNotebook[]): TrashItem[] =>
  notebooks.map(({ id, title, summary, deletedAt }) => ({ id, title, body: summary, deletedAt }));

const loadErrorOf = (result: PromiseSettledResult<unknown>, subject: string): string | null =>
  result.status === "rejected"
    ? `削除済み${subject}の読み込みに失敗しました: ${String(result.reason)}`
    : null;

interface TrashSectionProps {
  label: string;
  items: TrashItem[];
  nowMs: number;
  restoring: boolean;
  onRestore: (id: string) => void;
}

const TrashSection = ({
  label,
  items,
  nowMs,
  restoring,
  onRestore,
}: TrashSectionProps): JSX.Element | null => {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-solid border-line bg-paper-raised px-4 py-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-display text-base font-semibold">{item.title}</span>
            <p className="m-0 text-sm leading-relaxed text-text-soft">
              {toBodyPreview(item.body)}
            </p>
          </div>
          <span
            className={`shrink-0 self-center font-mono text-xs tabular-nums ${
              remainingDaysOf(item.deletedAt, nowMs) <= SOON_THRESHOLD_DAYS
                ? "text-crit"
                : "text-warn"
            }`}
          >
            あと {remainingDaysOf(item.deletedAt, nowMs)} 日
          </span>
          <button
            type="button"
            disabled={restoring}
            onClick={() => {
              onRestore(item.id);
            }}
            className={BUTTON_PRIMARY}
          >
            {RESTORE_LABEL}
          </button>
        </li>
      ))}
    </ul>
  );
};

export const TrashView = ({ onBack }: TrashViewProps): JSX.Element => {
  const [notes, setNotes] = useState<DeletedNote[]>([]);
  const [tasks, setTasks] = useState<DeletedTask[]>([]);
  const [notebooks, setNotebooks] = useState<DeletedNotebook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  // 一覧を取り直したときだけ現在時刻を更新する。描画のたびに読むと同じ画面で値がぶれる。
  const [nowMs, setNowMs] = useState(() => Date.now());
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
      // 片方が落ちてももう片方は見せる。ゴミ箱は「戻せるものを見つける」ための画面なので、
      // 全部出ないより一部でも出た方が利用者の役に立つ。
      const [noteResult, taskResult, notebookResult] = await Promise.allSettled([
        window.hanamask.listDeletedNotes(),
        window.hanamask.listDeletedTasks(),
        window.hanamask.listDeletedNotebooks(),
      ]);
      if (!current) return;
      if (noteResult.status === "fulfilled") setNotes(noteResult.value);
      if (taskResult.status === "fulfilled") setTasks(taskResult.value);
      if (notebookResult.status === "fulfilled") setNotebooks(notebookResult.value);
      setNowMs(Date.now());
      setError(
        loadErrorOf(noteResult, "ページ") ??
          loadErrorOf(taskResult, "タスク") ??
          loadErrorOf(notebookResult, "ノート"),
      );
    };
    void load();
    return () => {
      current = false;
    };
  }, []);

  const reloadNotes = async (): Promise<void> => {
    const reloaded = await window.hanamask.listDeletedNotes();
    if (!mounted.current) return;
    setNotes(reloaded);
    setNowMs(Date.now());
  };

  const reloadTasks = async (): Promise<void> => {
    const reloaded = await window.hanamask.listDeletedTasks();
    if (!mounted.current) return;
    setTasks(reloaded);
    setNowMs(Date.now());
  };

  const reloadNotebooks = async (): Promise<void> => {
    const reloaded = await window.hanamask.listDeletedNotebooks();
    if (!mounted.current) return;
    setNotebooks(reloaded);
    setNowMs(Date.now());
  };

  interface RestoreParams {
    /** 対象が見つかって復元できたら true。 */
    restore: () => Promise<boolean>;
    reload: () => Promise<void>;
    missingMessage: string;
    failureMessage: string;
  }

  const runRestore = async (params: RestoreParams): Promise<void> => {
    // 復元中は全ての復元ボタンを無効化する。多重復元を許すと、先に完了した方の
    // 再取得結果を後から届いた復元の再取得結果が上書きしうる。
    setRestoring(true);
    try {
      setError(null);
      const restored = await params.restore();
      if (!mounted.current) return;
      if (!restored) {
        setError(params.missingMessage);
        return;
      }
      await params.reload();
    } catch (cause) {
      if (mounted.current) setError(`${params.failureMessage}: ${String(cause)}`);
    } finally {
      if (mounted.current) setRestoring(false);
    }
  };

  const restoreNote = (id: string): void => {
    void runRestore({
      restore: async () => (await window.hanamask.restoreNote(id)) !== null,
      reload: reloadNotes,
      missingMessage: NOTE_MISSING_MESSAGE,
      failureMessage: "ページの復元に失敗しました",
    });
  };

  const restoreTask = (id: string): void => {
    void runRestore({
      restore: async () => (await window.hanamask.restoreTask(id)) !== null,
      reload: reloadTasks,
      missingMessage: TASK_MISSING_MESSAGE,
      failureMessage: "タスクの復元に失敗しました",
    });
  };

  const restoreNotebook = (id: string): void => {
    void runRestore({
      restore: () => window.hanamask.restoreNotebook(id),
      reload: reloadNotebooks,
      missingMessage: NOTEBOOK_MISSING_MESSAGE,
      failureMessage: "ノートの復元に失敗しました",
    });
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
      {notes.length === 0 && tasks.length === 0 && notebooks.length === 0 && (
        <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-text-faint">
          {EMPTY_MESSAGE}
        </p>
      )}
      <TrashSection
        label={NOTE_LIST_LABEL}
        items={notes}
        nowMs={nowMs}
        restoring={restoring}
        onRestore={restoreNote}
      />
      <TrashSection
        label={TASK_LIST_LABEL}
        items={tasks}
        nowMs={nowMs}
        restoring={restoring}
        onRestore={restoreTask}
      />
      <TrashSection
        label={NOTEBOOK_LIST_LABEL}
        items={notebooksAsTrashItems(notebooks)}
        nowMs={nowMs}
        restoring={restoring}
        onRestore={restoreNotebook}
      />
    </section>
  );
};
