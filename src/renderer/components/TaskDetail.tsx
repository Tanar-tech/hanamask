import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import type { Task, TaskStatus } from "../../shared/preload-api";
import { EntityLinks } from "./EntityLinks";
import { MarkdownDocument } from "./MarkdownDocument";
import { TagList } from "./TagList";

interface TaskDetailProps {
  taskId: string;
  onBack: () => void;
}

interface TaskDraft {
  title: string;
  body: string;
}

const STATUS_OPTIONS: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "未着手" },
  { status: "in_progress", label: "進行中" },
  { status: "done", label: "完了" },
];

const NOT_FOUND_MESSAGE = "タスクが見つかりません";
const UPDATE_FAILED_MESSAGE = "タスクの更新に失敗しました";
const EXTERNAL_UPDATE_MESSAGE = "このタスクは別の場所で更新されました";
const DISCARD_LABEL = "破棄して最新を読み込む";
const BODY_TEXTAREA_ROWS = 12;
const STATUS_SELECT_ID = "task-detail-status";
const TITLE_FIELD_ID = "task-detail-title";
const BODY_FIELD_ID = "task-detail-body";

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
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border bg-transparent px-3 py-2 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
// アクア＝利用者の操作。主たる操作だけ面を薄く敷いて他と見分けられるようにする。
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua bg-ink-aqua/10 font-semibold text-ink-aqua-text`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
const FIELD_LABEL = "font-display text-xs tracking-wide text-text-faint";
// box-border: preflight を入れていないため box-sizing は content-box のまま。
// w-full と padding/border が足し算になり、指定しないと入力欄が画面からはみ出す。
const FIELD = `${FOCUS_RING} m-0 box-border w-full rounded-md border border-line bg-paper-raised px-3 py-2 font-body text-sm text-text`;
const EMPTY_BODY_MESSAGE = "本文はまだありません";
// 一覧の空状態と同じ見た目。無地の余白だと読み込み失敗と区別が付かない。
const EMPTY_BODY = `${RESET_TEXT} rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center font-body text-sm text-text-faint`;

const toTaskStatus = (value: string): TaskStatus | null =>
  STATUS_OPTIONS.find((option) => option.status === value)?.status ?? null;

const labelOf = (status: TaskStatus): string =>
  STATUS_OPTIONS.find((option) => option.status === status)?.label ?? status;

const toDraft = (task: Task): TaskDraft => ({ title: task.title, body: task.body });

// ピンク＝自分以外の手で変わったこと。読む前に「外から来た知らせ」だと分かるようにする。
const ExternalUpdateNotice = ({ onDiscard }: { onDiscard: () => void }): JSX.Element => (
  <div
    role="status"
    className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-pink bg-ink-pink/10 px-4 py-3"
  >
    <p className={`${RESET_TEXT} flex-1 font-body text-sm text-ink-pink`}>
      {EXTERNAL_UPDATE_MESSAGE}
    </p>
    <button type="button" onClick={onDiscard} className={BUTTON_SECONDARY}>
      {DISCARD_LABEL}
    </button>
  </div>
);

interface TaskEditFormProps {
  draft: TaskDraft;
  error: string | null;
  onChange: (patch: Partial<TaskDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const TaskEditForm = ({
  draft,
  error,
  onChange,
  onSave,
  onCancel,
}: TaskEditFormProps): JSX.Element => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <label htmlFor={TITLE_FIELD_ID} className={FIELD_LABEL}>
        タイトル
      </label>
      <input
        id={TITLE_FIELD_ID}
        className={`${FIELD} font-display text-lg font-semibold`}
        value={draft.title}
        onChange={(event) => {
          onChange({ title: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor={BODY_FIELD_ID} className={FIELD_LABEL}>
        本文
      </label>
      <textarea
        id={BODY_FIELD_ID}
        className={`${FIELD} resize-y leading-relaxed`}
        rows={BODY_TEXTAREA_ROWS}
        value={draft.body}
        onChange={(event) => {
          onChange({ body: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onSave} className={BUTTON_PRIMARY}>
        保存
      </button>
      <button type="button" onClick={onCancel} className={BUTTON_SECONDARY}>
        キャンセル
      </button>
    </div>
    {error !== null && (
      <p role="alert" className={ALERT}>
        {error}
      </p>
    )}
  </div>
);

export const TaskDetail = ({ taskId, onBack }: TaskDetailProps): JSX.Element => {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalTask, setExternalTask] = useState<Task | null>(null);

  const editing = draft !== null;
  // 変更通知のコールバックは購読時のstateを閉じ込めてしまうため、判断材料は都度refから読む。
  // 描画に使わないのでstateにはしない。stateにするとsetStateからeffectでのref同期までの間に
  // 通知が届いたとき古い値で判断してしまう（`editing`は描画に使うため別）。
  // mutationCountは利用者の操作で表示中の内容が変わるたびに増える。取得の前後で値が変われば、
  // その取得は操作前の内容なので捨てる。changingStatusの再判定では塞げない（取得が解決する頃には
  // 操作が完了していてフラグは既に降りているため）。
  const liveStateRef = useRef({ changingStatus: false, editing, mutationCount: 0 });
  useEffect(() => {
    liveStateRef.current.editing = editing;
  }, [editing]);

  useEffect(() => {
    // タスク切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    setReloadError(null);
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.getTask(taskId);
        if (!current) return;
        setTask(loaded);
        setDraft(null);
        setSaveError(null);
        setStatusError(null);
        setExternalTask(null);
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
    // 編集中の入力を失わせないため、反映せず通知だけ出して利用者に選ばせる。
    if (liveStateRef.current.editing) setExternalTask(latest);
    else setTask(latest);
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
      setStatusError(null);
    } catch (cause) {
      // 操作の失敗を画面上部の読み込みエラーと同じ場所に出すと、画面全体が壊れたように見える。
      setStatusError(`${UPDATE_FAILED_MESSAGE}: ${String(cause)}`);
    } finally {
      liveStateRef.current.changingStatus = false;
    }
  }, []);

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const status = toTaskStatus(event.target.value);
    if (task === null || status === null) return;
    void changeStatus(task.id, status);
  };

  const patchDraft = (patch: Partial<TaskDraft>): void => {
    setDraft((current) => (current === null ? null : { ...current, ...patch }));
  };

  const discardDraft = (): void => {
    if (externalTask !== null) setTask(externalTask);
    setExternalTask(null);
    setDraft(null);
    setSaveError(null);
  };

  const saveDraft = async (): Promise<void> => {
    if (draft === null) return;
    try {
      setSaveError(null);
      liveStateRef.current.mutationCount += 1;
      const updated = await window.hanamask.updateTask(taskId, {
        title: draft.title,
        body: draft.body,
      });
      if (updated === null) {
        setSaveError(NOT_FOUND_MESSAGE);
        return;
      }
      setTask(updated);
      setDraft(null);
      setExternalTask(null);
    } catch (cause) {
      setSaveError(`${UPDATE_FAILED_MESSAGE}: ${String(cause)}`);
    }
  };

  return (
    <article className="flex flex-col gap-5 font-body text-text">
      <div>
        <button type="button" onClick={onBack} className={BUTTON_SECONDARY}>
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
      {task !== null && draft !== null && (
        <>
          {externalTask !== null && <ExternalUpdateNotice onDiscard={discardDraft} />}
          <TaskEditForm
            draft={draft}
            error={saveError}
            onChange={patchDraft}
            onSave={() => {
              void saveDraft();
            }}
            onCancel={discardDraft}
          />
        </>
      )}
      {task !== null && draft === null && (
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
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                setDraft(toDraft(task));
              }}
            >
              編集
            </button>
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
            {statusError !== null && (
              <p role="alert" className={`${ALERT} w-full`}>
                {statusError}
              </p>
            )}
          </div>

          <TagList tags={task.tags} />

          {task.body.trim() === "" ? (
            <p className={EMPTY_BODY}>{EMPTY_BODY_MESSAGE}</p>
          ) : (
            <MarkdownDocument content={task.body} />
          )}

          <EntityLinks entityType="task" entityId={taskId} />
        </>
      )}
    </article>
  );
};
