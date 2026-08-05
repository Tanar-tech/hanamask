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

const toTaskStatus = (value: string): TaskStatus | null =>
  STATUS_OPTIONS.find((option) => option.status === value)?.status ?? null;

export const TaskDetail = ({ taskId, onBack }: TaskDetailProps): JSX.Element => {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  // 変更通知のコールバックは購読時のstateを閉じ込めてしまうため、判断材料は都度refから読む。
  // 描画に使わないのでstateにはしない。stateにするとsetStateからeffectでのref同期までの間に
  // 通知が届いたとき古い値で判断してしまう（NoteDetailの`editing`/`restoring`は描画に使うため別）。
  const liveStateRef = useRef({ changingStatus: false });

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
    const latest = await window.hanamask.getTask(taskId);
    setReloadError(null);
    if (latest === null) return;
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
    <article>
      <button type="button" onClick={onBack}>
        戻る
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {reloadError !== null && <p role="alert">{reloadError}</p>}
      {task !== null && (
        <>
          <h2>{task.title}</h2>
          <label htmlFor={STATUS_SELECT_ID}>ステータス</label>
          <select id={STATUS_SELECT_ID} value={task.status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map(({ status, label }) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
          <p>{task.dueDate ?? "期限なし"}</p>
          <EntityLinks entityType="task" entityId={taskId} />
        </>
      )}
    </article>
  );
};
