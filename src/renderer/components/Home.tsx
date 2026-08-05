import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";
import type { Note, Task, TaskStatus } from "../../shared/preload-api";

const RECENT_NOTE_LIMIT = 6;
const ACTIVE_TASK_LIMIT = 5;
// この幅より新しい更新を「エージェントが書き換えたばかり」として示す。利用者自身の編集も
// 入りうるが、直後に画面が変わったことに気づけることの方を優先する。
const AGENT_UPDATE_WINDOW_MS = 120_000;
const BODY_PREVIEW_LENGTH = 80;
const AGENT_UPDATE_MARK = "たった今 · エージェントが更新";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

// 進行中を先に見せる。同じ状態同士は更新の新しい順。
const STATUS_ORDER: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2 };

// preflightを入れていないため、ブラウザ既定のマージンや枠は各要素で打ち消す。
const RESET_LIST = "list-none m-0 p-0";
const RESET_TEXT = "m-0";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const TITLE_BUTTON = `${RESET_TEXT} appearance-none border-0 bg-transparent p-0 text-left font-body text-base font-bold text-ink-aqua underline-offset-2 hover:underline cursor-pointer ${FOCUS_RING}`;
const CARD = "rounded-lg border border-line bg-paper-raised p-3";
const SECTION_HEADING = `${RESET_TEXT} font-display text-sm tracking-wide text-text-faint`;

const byUpdatedAtDesc = (a: Note | Task, b: Note | Task): number =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

const recentNotesOf = (notes: Note[]): Note[] =>
  [...notes].sort(byUpdatedAtDesc).slice(0, RECENT_NOTE_LIMIT);

const activeTasksOf = (tasks: Task[]): Task[] =>
  tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byUpdatedAtDesc(a, b))
    .slice(0, ACTIVE_TASK_LIMIT);

const isJustUpdated = (note: Note, atMs: number): boolean =>
  atMs - Date.parse(note.updatedAt) < AGENT_UPDATE_WINDOW_MS;

const toPreview = (body: string): string =>
  body.length > BODY_PREVIEW_LENGTH ? `${body.slice(0, BODY_PREVIEW_LENGTH)}…` : body;

const statusToneOf = (status: TaskStatus): string => {
  if (status === "done") return "border-ok text-ok";
  if (status === "in_progress") return "border-warn text-warn";
  return "border-line text-text-soft";
};

interface HomeProps {
  onSelectNote: (id: string) => void;
  onSelectTask: (id: string) => void;
  onSearch: (query: string) => void;
}

const SearchBar = ({ onSearch }: { onSearch: (query: string) => void }): JSX.Element => {
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") return;
    onSearch(trimmed);
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label htmlFor="home-search" className="font-body text-sm text-text-soft">
        ノートとタスクを検索
      </label>
      <input
        id="home-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className={`min-w-60 flex-1 rounded-md border border-line bg-paper-raised px-3 py-2 font-body text-sm text-text ${FOCUS_RING}`}
      />
      <button
        type="submit"
        className={`rounded-md border border-ink-aqua bg-transparent px-3 py-2 font-body text-sm text-ink-aqua cursor-pointer ${FOCUS_RING}`}
      >
        検索
      </button>
    </form>
  );
};

const NoteCard = ({
  note,
  justUpdated,
  onSelect,
}: {
  note: Note;
  justUpdated: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <li className={`${CARD} border-l-4 ${justUpdated ? "border-l-ink-pink" : "border-l-line"}`}>
    <button type="button" onClick={onSelect} className={TITLE_BUTTON}>
      {note.title}
    </button>
    {justUpdated && (
      <p className={`${RESET_TEXT} mt-1 font-body text-xs text-ink-pink`}>{AGENT_UPDATE_MARK}</p>
    )}
    <p className={`${RESET_TEXT} mt-1 font-body text-sm text-text-soft`}>{toPreview(note.body)}</p>
  </li>
);

const TaskRow = ({ task, onSelect }: { task: Task; onSelect: () => void }): JSX.Element => (
  <li className={`${CARD} flex flex-wrap items-center gap-3`}>
    <span
      className={`rounded-full border px-2 py-0.5 font-body text-xs ${statusToneOf(task.status)}`}
    >
      {STATUS_LABELS[task.status]}
    </span>
    <button type="button" onClick={onSelect} className={`${TITLE_BUTTON} flex-1`}>
      {task.title}
    </button>
    <span className={`${RESET_TEXT} font-body text-xs text-text-faint`}>
      {task.dueDate === null ? "期限なし" : `期限 ${task.dueDate}`}
    </span>
  </li>
);

export const Home = ({ onSelectNote, onSelectTask, onSearch }: HomeProps): JSX.Element => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const reloadNotes = useCallback(async () => {
    try {
      setNotes(await window.hanamask.listNotes());
      setNoteError(null);
    } catch (cause) {
      setNoteError(`ノートの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  const reloadTasks = useCallback(async () => {
    try {
      setTasks(await window.hanamask.listTasks());
      setTaskError(null);
    } catch (cause) {
      setTaskError(`タスクの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reloadNotes();
    return window.hanamask.onNotesChanged(() => {
      void reloadNotes();
    });
  }, [reloadNotes]);

  useEffect(() => {
    void reloadTasks();
    return window.hanamask.onTasksChanged(() => {
      void reloadTasks();
    });
  }, [reloadTasks]);

  const renderedAtMs = Date.now();
  const visibleNotes = recentNotesOf(notes);
  const visibleTasks = activeTasksOf(tasks);

  return (
    <div className="flex flex-col gap-6 p-6 font-body text-text">
      <SearchBar onSearch={onSearch} />

      <section aria-labelledby="home-notes-heading" className="flex flex-col gap-3">
        <h2 id="home-notes-heading" className={SECTION_HEADING}>
          最近のノート
        </h2>
        {noteError !== null && (
          <p role="alert" className={`${RESET_TEXT} font-body text-sm text-crit`}>
            {noteError}
          </p>
        )}
        {noteError === null && visibleNotes.length === 0 && (
          <p className={`${RESET_TEXT} font-body text-sm text-text-soft`}>ノートはまだありません</p>
        )}
        {noteError === null && visibleNotes.length > 0 && (
          <ul className={`${RESET_LIST} grid gap-3 sm:grid-cols-2 lg:grid-cols-3`}>
            {visibleNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                justUpdated={isJustUpdated(note, renderedAtMs)}
                onSelect={() => {
                  onSelectNote(note.id);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="home-tasks-heading" className="flex flex-col gap-3">
        <h2 id="home-tasks-heading" className={SECTION_HEADING}>
          進行中のタスク
        </h2>
        {taskError !== null && (
          <p role="alert" className={`${RESET_TEXT} font-body text-sm text-crit`}>
            {taskError}
          </p>
        )}
        {taskError === null && visibleTasks.length === 0 && (
          <p className={`${RESET_TEXT} font-body text-sm text-text-soft`}>タスクはまだありません</p>
        )}
        {taskError === null && visibleTasks.length > 0 && (
          <ul className={`${RESET_LIST} flex flex-col gap-2`}>
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onSelect={() => {
                  onSelectTask(task.id);
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
