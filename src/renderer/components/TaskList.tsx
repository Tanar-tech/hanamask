import { useCallback, useEffect, useState, type JSX } from "react";
import type { Task, TaskStatus } from "../../shared/preload-api";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

interface TaskListProps {
  onSelectTask: (id: string) => void;
}

export const TaskList = ({ onSelectTask }: TaskListProps): JSX.Element => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await window.hanamask.listTasks());
      setError(null);
    } catch (cause) {
      setError(`タスクの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.hanamask.onTasksChanged(() => {
      void reload();
    });
  }, [reload]);

  if (error !== null) {
    return <p role="alert">{error}</p>;
  }

  if (tasks.length === 0) {
    return <p>タスクはまだありません</p>;
  }

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <h2>
            <button
              type="button"
              onClick={() => {
                onSelectTask(task.id);
              }}
            >
              {task.title}
            </button>
          </h2>
          <p>{STATUS_LABELS[task.status]}</p>
          {task.dueDate !== null && <p>{task.dueDate}</p>}
        </li>
      ))}
    </ul>
  );
};
