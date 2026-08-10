import { li as MotionLi } from "motion/react-m";
import { useCallback, useEffect, useState, type JSX } from "react";
import { useNewlyArrived } from "../hooks/useNewlyArrived";
import { ENTRY_MOTION } from "../styles/motion";
import { toBodyPreview } from "../text/bodyPreview";
import type { Task, TaskStatus } from "../../shared/preload-api";
import { DeleteButton } from "./DeleteButton";
import { TagList } from "./TagList";
import { TagGroups, useTagFilter } from "./TagFilter";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  todo: "border-line text-text-soft",
  in_progress: "border-warn text-warn",
  done: "border-ok text-ok",
};

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BARE_BUTTON = `cursor-pointer appearance-none border-0 bg-transparent p-0 font-body ${FOCUS_RING}`;

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

  const deleteTask = useCallback(async (task: Task) => {
    try {
      await window.hanamask.deleteTask(task.id);
    } catch (cause) {
      setError(`タスクの削除に失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.hanamask.onTasksChanged(() => {
      void reload();
    });
  }, [reload]);

  const newlyArrived = useNewlyArrived(tasks.map((task) => task.id));

  const tagFilter = useTagFilter(tasks);

  if (error !== null) {
    return (
      <p
        role="alert"
        className="m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit"
      >
        {error}
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center font-body text-sm text-text-faint">
        タスクはまだありません
      </p>
    );
  }

  const renderList = (items: readonly Task[]): JSX.Element => (
    <ul aria-label="タスク一覧" className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((task) => {
        const preview = toBodyPreview(task.body);
        return (
          <MotionLi
            {...(newlyArrived.has(task.id) ? ENTRY_MOTION : {})}
            key={task.id}
            className="flex flex-col gap-2 rounded-lg border border-line bg-paper-raised px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua"
          >
            <h2 className="m-0 font-display text-base leading-snug font-semibold">
              <button
                type="button"
                className={`${BARE_BUTTON} text-left text-base font-semibold text-ink-aqua-text underline-offset-4 hover:underline`}
                onClick={() => {
                  onSelectTask(task.id);
                }}
              >
                {task.title}
              </button>
            </h2>
            <div className="flex items-center gap-3">
              <p
                className={`m-0 rounded-full border px-2 py-0.5 font-body text-xs font-semibold ${STATUS_BADGE_CLASSES[task.status]}`}
              >
                {STATUS_LABELS[task.status]}
              </p>
              {task.dueDate !== null && (
                <p className="m-0 font-body text-xs text-text-faint">{task.dueDate}</p>
              )}
            </div>
            {preview !== "" && (
              // 一覧でMarkdown/Mermaidを描くと重くレイアウトも崩れるため、記号を落とした素のテキストにする。
              <p className="m-0 line-clamp-2 font-body text-xs text-text-soft">{preview}</p>
            )}
            <TagList tags={task.tags} selected={tagFilter.selected} />
            <DeleteButton
              title={task.title}
              onConfirm={() => {
                void deleteTask(task);
              }}
            />
          </MotionLi>
        );
      })}
    </ul>
  );

  const shown = tagFilter.visible(tasks);

  return (
    <div className="flex flex-col gap-3">
      {tagFilter.control}
      {tagFilter.grouped ? (
        <TagGroups groups={tagFilter.groupsOf(shown)} render={renderList} />
      ) : shown.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center font-body text-sm text-text-faint">
          このタグが付いたタスクはありません
        </p>
      ) : (
        renderList(shown)
      )}
    </div>
  );
};
