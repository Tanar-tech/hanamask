import { useCallback, useEffect, useState, type ChangeEvent, type JSX } from "react";
import type { Task, TaskStatus } from "../../shared/preload-api";

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

  useEffect(() => {
    // タスク切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
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

  const changeStatus = useCallback(async (id: string, status: TaskStatus) => {
    try {
      await window.hanamask.updateTaskStatus(id, status);
      setTask((current) => (current === null ? current : { ...current, status }));
      setError(null);
    } catch (cause) {
      setError(`タスクの更新に失敗しました: ${String(cause)}`);
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
        </>
      )}
    </article>
  );
};
