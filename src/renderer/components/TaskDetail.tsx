import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import type { Task, TaskStatus } from "../../shared/preload-api";
import { EntityLinks } from "./EntityLinks";

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

const STATUS_OPTIONS: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "未着手" },
  { status: "in_progress", label: "進行中" },
  { status: "done", label: "完了" },
];

const NOT_FOUND_MESSAGE = "タスクが見つかりません";
const STATUS_SELECT_ID = "task-detail-status";

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "border-line text-text-soft",
  in_progress: "border-warn text-warn",
  done: "border-ok text-ok",
};

// preflight を入れていないため、ブラウザ既定のマージンとボタン外観は各所で打ち消している。
const RESET_TEXT = "m-0";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const ALERT = `${RESET_TEXT} rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit`;

const toTaskStatus = (value: string): TaskStatus | null =>
  STATUS_OPTIONS.find((option) => option.status === value)?.status ?? null;

const labelOf = (status: TaskStatus): string =>
  STATUS_OPTIONS.find((option) => option.status === status)?.label ?? status;

export const TaskDetail = ({ taskId, onBack }: TaskDetailProps): JSX.Element => {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  // 変更通知のコールバックは購読時のstateを閉じ込めてしまうため、判断材料は都度refから読む。
  // 描画に使わないのでstateにはしない。stateにするとsetStateからeffectでのref同期までの間に
  // 通知が届いたとき古い値で判断してしまう（NoteDetailの`editing`/`restoring`は描画に使うため別）。
  // mutationCountは利用者の操作で表示中の内容が変わるたびに増える。取得の前後で値が変われば、
  // その取得は操作前の内容なので捨てる。changingStatusの再判定では塞げない（取得が解決する頃には
  // 操作が完了していてフラグは既に降りているため）。
  const liveStateRef = useRef({ changingStatus: false, mutationCount: 0 });

  useEffect(() => {
    // タスク切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    setReloadError(null);
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getTask(taskId);
        if (!current) return;
        setTask(loaded);
        setError(loaded === null ? NOT_FOUND_MESSAGE : null);
      } catch (cause) {
        if (current) setError(`タスクの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [taskId]);

  const reloadTask = useCallback(async (): Promise<void> => {
    // ステータス変更の応答待ち中に取得すると変更前の内容が後から届き、変更結果を打ち消しうる。
    if (liveStateRef.current.changingStatus) return;
    const startedAtMutationCount = liveStateRef.current.mutationCount;
    const latest = await window.hanamask.getTask(taskId);
    setReloadError(null);
    if (latest === null) return;
    if (liveStateRef.current.mutationCount !== startedAtMutationCount) return;
    setTask(latest);
  }, [taskId]);

  // MCPツール経由の更新は同じ画面を開いたまま起きるため、変更通知で取り直す。
  useEffect(
    () =>
      window.hanamask.onTasksChanged(() => {
        void reloadTask().catch((cause: unknown) => {
          setReloadError(`最新の内容の取得に失敗しました: ${String(cause)}`);
        });
      }),
    [reloadTask],
  );

  const changeStatus = useCallback(async (id: string, status: TaskStatus) => {
    liveStateRef.current.changingStatus = true;
    liveStateRef.current.mutationCount += 1;
    try {
      await window.hanamask.updateTaskStatus(id, status);
      setTask((current) => (current === null ? current : { ...current, status }));
      setError(null);
    } catch (cause) {
      setError(`タスクの更新に失敗しました: ${String(cause)}`);
    } finally {
      liveStateRef.current.changingStatus = false;
    }
  }, []);

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const status = toTaskStatus(event.target.value);
    if (task === null || status === null) return;
    void changeStatus(task.id, status);
  };

  return (
    <article className="flex flex-col gap-5 font-body text-text">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={`cursor-pointer rounded-md border border-line bg-paper-raised px-3 py-2 font-body text-sm text-text-soft transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua hover:text-ink-aqua-text-text ${FOCUS_RING}`}
        >
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
      {task !== null && (
        <>
          <header className="flex flex-wrap items-center gap-3">
            <h2 className={`${RESET_TEXT} font-display text-xl leading-snug font-bold`}>
              {task.title}
            </h2>
            <span
              className={`rounded-full border px-2 py-0.5 font-body text-xs font-semibold ${STATUS_TONE[task.status]}`}
            >
              {labelOf(task.status)}
            </span>
          </header>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper-raised px-4 py-3">
            <label htmlFor={STATUS_SELECT_ID} className="font-body text-sm text-text-soft">
              ステータス
            </label>
            <select
              id={STATUS_SELECT_ID}
              value={task.status}
              onChange={handleStatusChange}
              className={`cursor-pointer rounded-md border border-ink-aqua bg-paper px-3 py-2 font-body text-sm text-text ${FOCUS_RING}`}
            >
              {STATUS_OPTIONS.map(({ status, label }) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
            {task.dueDate === null ? (
              <p className={`${RESET_TEXT} font-body text-sm text-text-faint`}>期限なし</p>
            ) : (
              <p className={`${RESET_TEXT} font-body text-sm text-text-faint`}>
                <span className="mr-1">期限</span>
                <span>{task.dueDate}</span>
              </p>
            )}
          </div>

          <EntityLinks entityType="task" entityId={taskId} />
        </>
      )}
    </article>
  );
};
