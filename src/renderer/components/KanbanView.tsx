import { useCallback, useEffect, useState, type DragEvent, type JSX } from "react";
import type { Task, TaskStatus } from "../../shared/preload-api";

interface Column {
  status: TaskStatus;
  label: string;
}

const COLUMNS: readonly Column[] = [
  { status: "todo", label: "未着手" },
  { status: "in_progress", label: "進行中" },
  { status: "done", label: "完了" },
];

const DRAG_DATA_FORMAT = "text/plain";

// dropイベントはdragoverでpreventDefaultしない限り発火しない（HTML5 DnDの仕様）。
const allowDrop = (event: DragEvent<HTMLElement>): void => {
  event.preventDefault();
};

export const KanbanView = (): JSX.Element => {
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

  const moveTask = useCallback(async (id: string, status: TaskStatus) => {
    try {
      await window.hanamask.updateTaskStatus(id, status);
    } catch (cause) {
      setError(`タスクの更新に失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.hanamask.onTasksChanged(() => {
      void reload();
    });
  }, [reload]);

  const handleDrop = (status: TaskStatus) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const droppedId = event.dataTransfer.getData(DRAG_DATA_FORMAT);
    const dropped = tasks.find((task) => task.id === droppedId);
    if (dropped === undefined || dropped.status === status) return;
    void moveTask(dropped.id, status);
  };

  const handleDragStart = (task: Task) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, task.id);
  };

  return (
    <div>
      {error !== null && <p role="alert">{error}</p>}
      {COLUMNS.map(({ status, label }) => (
        <section
          key={status}
          aria-labelledby={`kanban-column-${status}`}
          onDragOver={allowDrop}
          onDrop={handleDrop(status)}
        >
          <h2 id={`kanban-column-${status}`}>{label}</h2>
          <ul>
            {tasks
              .filter((task) => task.status === status)
              .map((task) => (
                <li key={task.id} draggable onDragStart={handleDragStart(task)}>
                  <span>{task.title}</span>
                  {task.dueDate !== null && <span>{task.dueDate}</span>}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
