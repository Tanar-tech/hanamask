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

// preflight を入れていないため、ブラウザ既定のマージンとリストマーカーを各所で打ち消している。
const RESET_LIST = "m-0 list-none p-0";
const RESET_TEXT = "m-0";

const COLUMN_TONE: Record<TaskStatus, string> = {
  todo: "border-t-line",
  in_progress: "border-t-warn",
  done: "border-t-ok",
};

const COUNT_TONE: Record<TaskStatus, string> = {
  todo: "border-line text-text-soft",
  in_progress: "border-warn text-warn",
  done: "border-ok text-ok",
};

// dropイベントはdragoverでpreventDefaultしない限り発火しない（HTML5 DnDの仕様）。
const allowDrop = (event: DragEvent<HTMLElement>): void => {
  event.preventDefault();
};

export const KanbanView = (): JSX.Element => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

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
    setDraggingTaskId(null);
    const droppedId = event.dataTransfer.getData(DRAG_DATA_FORMAT);
    const dropped = tasks.find((task) => task.id === droppedId);
    if (dropped === undefined || dropped.status === status) return;
    void moveTask(dropped.id, status);
  };

  const handleDragStart = (task: Task) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, task.id);
    setDraggingTaskId(task.id);
  };

  const draggingTask = tasks.find((task) => task.id === draggingTaskId) ?? null;

  return (
    <section aria-labelledby="kanban-heading" className="flex flex-col gap-3 font-body text-text">
      <h2
        id="kanban-heading"
        className={`${RESET_TEXT} font-display text-sm tracking-wide text-text-faint`}
      >
        カンバン
      </h2>
      <p className={`${RESET_TEXT} font-body text-sm text-text-soft`}>
        カードをつかんで別の列に落とすと、タスクの状態が変わります。
      </p>
      {error !== null && (
        <p
          role="alert"
          className={`${RESET_TEXT} rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit`}
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map(({ status, label }) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          const isDropTarget = draggingTask !== null && draggingTask.status !== status;
          return (
            <section
              key={status}
              aria-labelledby={`kanban-column-${status}`}
              onDragOver={allowDrop}
              onDrop={handleDrop(status)}
              className={`flex flex-col gap-3 rounded-lg border border-t-4 border-line bg-paper p-3 transition-colors duration-[var(--duration-fast)] ease-standard ${COLUMN_TONE[status]} ${isDropTarget ? "border-ink-aqua" : ""}`}
            >
              <div className="flex items-center gap-2">
                <h3
                  id={`kanban-column-${status}`}
                  className={`${RESET_TEXT} font-display text-sm font-bold`}
                >
                  {label}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 font-body text-xs ${COUNT_TONE[status]}`}
                >
                  {columnTasks.length}件
                </span>
              </div>

              <ul className={`${RESET_LIST} flex flex-col gap-2`}>
                {columnTasks.map((task) => (
                  <li
                    key={task.id}
                    draggable
                    onDragStart={handleDragStart(task)}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                    }}
                    className={`flex cursor-grab flex-col gap-1 rounded-md border border-line bg-paper-raised px-3 py-2 transition-colors duration-[var(--duration-fast)] ease-standard select-none hover:border-ink-aqua active:cursor-grabbing ${task.id === draggingTaskId ? "border-ink-aqua opacity-60" : ""}`}
                  >
                    <span className="font-body text-sm font-semibold">{task.title}</span>
                    {task.dueDate !== null && (
                      <span className="font-body text-xs text-text-faint">
                        <span className="mr-1">期限</span>
                        <span>{task.dueDate}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {isDropTarget && (
                <p
                  className={`${RESET_TEXT} rounded-md border border-dashed border-ink-aqua px-3 py-3 text-center font-body text-xs text-ink-aqua-text`}
                >
                  {`ここにドロップして「${label}」にする`}
                </p>
              )}
              {!isDropTarget && draggingTask !== null && (
                <p
                  className={`${RESET_TEXT} rounded-md border border-dashed border-line px-3 py-3 text-center font-body text-xs text-text-faint`}
                >
                  いまこの列にあります
                </p>
              )}
              {draggingTask === null && columnTasks.length === 0 && (
                <p
                  className={`${RESET_TEXT} rounded-md border border-dashed border-line px-3 py-3 text-center font-body text-xs text-text-faint`}
                >
                  ここにタスクはありません
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
};
