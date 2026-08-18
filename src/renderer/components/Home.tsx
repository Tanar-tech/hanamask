import { li as MotionLi } from "motion/react-m";
import { useCallback, useEffect, useState, type FormEvent, type JSX } from "react";
import { summarizeActivity } from "./activity-summary";
import type { Activity } from "../../shared/preload-api";
import { useNewlyArrived } from "../hooks/useNewlyArrived";
import { TagList } from "./TagList";
import { ENTRY_MOTION } from "../styles/motion";
import type { Note, Task, TaskStatus } from "../../shared/preload-api";

const RECENT_NOTE_LIMIT = 6;
const ACTIVE_TASK_LIMIT = 5;
// この幅より新しい更新を「エージェントが書き換えたばかり」として示す。利用者自身の編集も
// 入りうるが、直後に画面が変わったことに気づけることの方を優先する。
const AGENT_UPDATE_WINDOW_MS = 120_000;
// しきい値を跨いだことに気づくまでの遅れをこの間隔以内に抑える。表示中に「更新直後」の
// ノートが1件も無い間はタイマーを止めるので、常時動き続けることはない。
const AGENT_UPDATE_TICK_MS = AGENT_UPDATE_WINDOW_MS / 8;
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
const TITLE_BUTTON = `${RESET_TEXT} appearance-none border-0 bg-transparent p-0 text-left font-body text-base font-bold text-ink-aqua-text underline-offset-2 hover:underline cursor-pointer ${FOCUS_RING}`;
const CARD = "rounded-lg border border-line bg-paper-raised p-3";
const ACTIVITY_LINE = "m-0 font-body text-sm text-text-faint";
// 途絶えは目立たせるが、警告色（crit）は使わない。書かない日があるのは普通のことなので叱責に見せない。
const ACTIVITY_LINE_STALE = "m-0 font-body text-sm font-bold text-text";
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
        className={`rounded-md border border-ink-aqua bg-transparent px-3 py-2 font-body text-sm text-ink-aqua-text cursor-pointer ${FOCUS_RING}`}
      >
        検索
      </button>
    </form>
  );
};

const NoteCard = ({
  note,
  justUpdated,
  justArrived,
  onSelect,
}: {
  note: Note;
  justUpdated: boolean;
  justArrived: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <MotionLi
    {...(justArrived ? ENTRY_MOTION : {})}
    className={`${CARD} border-l-4 ${justUpdated ? "border-l-ink-pink" : "border-l-line"}`}
  >
    <button type="button" onClick={onSelect} className={TITLE_BUTTON}>
      {note.title}
    </button>
    {justUpdated && (
      <p className={`${RESET_TEXT} mt-1 font-body text-xs text-ink-pink`}>{AGENT_UPDATE_MARK}</p>
    )}
    <p className={`${RESET_TEXT} mt-1 font-body text-sm text-text-soft`}>{toPreview(note.body)}</p>
    <div className="mt-2">
      <TagList tags={note.tags} />
    </div>
  </MotionLi>
);

const TaskRow = ({
  task,
  justArrived,
  onSelect,
}: {
  task: Task;
  justArrived: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <MotionLi
    {...(justArrived ? ENTRY_MOTION : {})}
    className={`${CARD} flex flex-wrap items-center gap-3`}
  >
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
    <TagList tags={task.tags} />
  </MotionLi>
);

const ActivityLine = ({ activity, nowMs }: { activity: Activity; nowMs: number }): JSX.Element => {
  const { text, highlight } = summarizeActivity(activity, nowMs);
  return <p className={highlight ? ACTIVITY_LINE_STALE : ACTIVITY_LINE}>{text}</p>;
};

export const Home = ({ onSelectNote, onSelectTask, onSearch }: HomeProps): JSX.Element => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activity, setActivity] = useState<Activity | null>(null);

  const reloadNotes = useCallback(async () => {
    try {
      setNotes(await window.hanamask.listNotes());
      // 取得のたびに現在時刻を取り直す。タイマーが止まっている間に時間が進むと、
      // 古い基準では「更新直後」の判定が実際より長く続いてしまうため。
      setNowMs(Date.now());
      setNoteError(null);
    } catch (cause) {
      setNoteError(`ノートの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  // 記録が途絶えていないかは、ノート・タスクどちらが増えても変わる。両方の通知で読み直す。
  const reloadActivity = useCallback(async () => {
    try {
      setActivity(await window.hanamask.readActivity());
      setNowMs(Date.now());
    } catch {
      setActivity(null);
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
    void reloadActivity();
    return window.hanamask.onNotesChanged(() => {
      void reloadNotes();
      void reloadActivity();
    });
  }, [reloadNotes, reloadActivity]);

  useEffect(() => {
    void reloadTasks();
    return window.hanamask.onTasksChanged(() => {
      void reloadTasks();
      void reloadActivity();
    });
  }, [reloadTasks, reloadActivity]);

  const visibleNotes = recentNotesOf(notes);
  const visibleTasks = activeTasksOf(tasks);
  const hasJustUpdatedNote = visibleNotes.some((note) => isJustUpdated(note, nowMs));
  // 判定は表示している範囲で行う。押し出されて戻ってきた項目も「現れた」として扱う。
  const arrivedNotes = useNewlyArrived(visibleNotes.map((note) => note.id));
  const arrivedTasks = useNewlyArrived(visibleTasks.map((task) => task.id));

  useEffect(() => {
    if (!hasJustUpdatedNote) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, AGENT_UPDATE_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [hasJustUpdatedNote]);

  return (
    <div className="flex flex-col gap-6 p-6 font-body text-text">
      <SearchBar onSearch={onSearch} />

      {activity !== null && <ActivityLine activity={activity} nowMs={nowMs} />}

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
                justUpdated={isJustUpdated(note, nowMs)}
                justArrived={arrivedNotes.has(note.id)}
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
                justArrived={arrivedTasks.has(task.id)}
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
