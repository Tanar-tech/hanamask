import { useCallback, useEffect, useId, useMemo, useState, type JSX } from "react";
import type {
  CommentAnchor,
  CommentAuthor,
  CommentEntityType,
  CommentMessage,
  CommentStatus,
  CommentThread,
} from "../../shared/preload-api";
import { locateAnchor } from "../text-quote";
import { toDateLabel } from "../text/dateLabel";

/*
 * コメントの本文と引用は利用者・エージェントの書いた信頼できない文字（SECURITY.md）。
 * React のテキストノードとしてだけ描き、HTML や Markdown として解釈させない。
 */

const HEADING = "コメント";
const EMPTY_MESSAGE = "コメントはありません";
const WRITE_ENTITY_COMMENT_LABEL = "記録へのコメントを書く";
const NEW_COMMENT_FIELD_LABEL = "コメント本文";
const NEW_COMMENT_SUBMIT_LABEL = "コメントする";
const REPLY_LABEL = "返信";
const REPLY_FIELD_LABEL = "返信の本文";
const REPLY_SUBMIT_LABEL = "返信する";
const CANCEL_LABEL = "やめる";
const DELETE_LABEL = "削除";
const DELETE_CONFIRM_MESSAGE = "このスレッドを削除しますか？";
const DELETE_CONFIRM_LABEL = "削除する";
const GONE_MESSAGE = "元の箇所が変わりました";
const ENTITY_COMMENT_LABEL = "記録へのコメント";
const HIDE_RESOLVED_LABEL = "解決済みを隠す";
const THREAD_LIST_LABEL = "コメント一覧";
const DELETE_MISSING_MESSAGE = "対象のコメントが見つかりません";
const STATUS_ACTION_LABELS: Record<CommentStatus, string> = {
  open: "解決にする",
  resolved: "再開する",
};
const NEXT_STATUS: Record<CommentStatus, CommentStatus> = {
  open: "resolved",
  resolved: "open",
};
const AUTHOR_LABELS: Record<CommentAuthor, string> = {
  user: "あなた",
  agent: "エージェント",
};
const AUTHOR_COLORS: Record<CommentAuthor, string> = {
  user: "text-ink-aqua-text",
  agent: "text-ink-pink",
};

const openCountLabel = (count: number): string => `未解決 ${count}`;
const showResolvedLabel = (count: number): string => `解決済み ${count}件を表示`;

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1 font-body text-xs transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10`;
const BUTTON_QUIET = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
// 削除はスレッドごと消す破壊的操作なので、他のボタンと色で区別する。
const BUTTON_DESTRUCTIVE = `${BUTTON_BASE} border-crit text-crit hover:bg-crit/10`;
const PLAIN_TEXT = "m-0 whitespace-pre-wrap break-words";
const QUOTE_BASE = `${PLAIN_TEXT} border-0 border-l-4 border-solid px-3 py-1 text-left font-body text-xs`;
const QUOTE_LIVE = `${QUOTE_BASE} ${FOCUS_RING} w-full cursor-pointer appearance-none border-l-ink-aqua bg-ink-aqua/5 text-text-soft hover:bg-ink-aqua/10`;
const QUOTE_GONE = `${QUOTE_BASE} border-l-line bg-paper text-text-faint`;

const pad = (value: number): string => String(value).padStart(2, "0");

const toTimeLabel = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${toDateLabel(iso)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

// 本文をまだ読めていない間（null）は、引用を探しようがないので「変わった」とは言わない。
const isGone = (thread: CommentThread, bodyText: string | null): boolean =>
  bodyText !== null && thread.anchor !== null && locateAnchor(bodyText, thread.anchor) === null;

// 引用の探し直しは本文の長さに比例して重いので、スレッドか本文が変わったときだけやり直す。
const useGoneThreadIds = (
  threads: CommentThread[],
  bodyText: string | null,
): ReadonlySet<string> =>
  useMemo(
    () => new Set(threads.filter((thread) => isGone(thread, bodyText)).map((thread) => thread.id)),
    [threads, bodyText],
  );

const QuoteText = ({ anchor }: { anchor: CommentAnchor }): JSX.Element => (
  <p className={QUOTE_LIVE}>{anchor.quote}</p>
);

interface ThreadQuoteProps {
  anchor: CommentAnchor | null;
  gone: boolean;
  onSelect: () => void;
}

const ThreadQuote = ({ anchor, gone, onSelect }: ThreadQuoteProps): JSX.Element => {
  if (anchor === null) return <p className="m-0 text-xs text-text-faint">{ENTITY_COMMENT_LABEL}</p>;
  if (gone) {
    return (
      <div className="flex flex-col gap-1">
        <p className={QUOTE_GONE}>{anchor.quote}</p>
        <p className="m-0 text-xs text-warn">{GONE_MESSAGE}</p>
      </div>
    );
  }
  return (
    <button type="button" className={QUOTE_LIVE} onClick={onSelect}>
      {anchor.quote}
    </button>
  );
};

const MessageItem = ({ message }: { message: CommentMessage }): JSX.Element => (
  <li className="flex flex-col gap-1">
    <p className="m-0 flex items-baseline gap-2 font-mono text-[0.625rem] tracking-[0.08em]">
      <span className={AUTHOR_COLORS[message.author]}>{AUTHOR_LABELS[message.author]}</span>
      <time dateTime={message.createdAt} className="text-text-faint">
        {toTimeLabel(message.createdAt)}
      </time>
    </p>
    <p className={`${PLAIN_TEXT} font-body text-sm text-text`}>{message.body}</p>
  </li>
);

interface ComposerProps {
  fieldLabel: string;
  submitLabel: string;
  /** 送れたら true。失敗したときは入力を残す。 */
  onSubmit: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

const Composer = ({ fieldLabel, submitLabel, onSubmit, onCancel }: ComposerProps): JSX.Element => {
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const body = draft.trim();
  const submit = async (): Promise<void> => {
    if (body !== "" && (await onSubmit(body))) setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        id={fieldId}
        aria-label={fieldLabel}
        value={draft}
        rows={3}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        className={`${FOCUS_RING} m-0 resize-y rounded-md border border-solid border-line bg-paper-raised px-3 py-2 font-body text-sm text-text`}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={body === ""}
          onClick={() => void submit()}
          className={BUTTON_PRIMARY}
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={BUTTON_QUIET}>
          {CANCEL_LABEL}
        </button>
      </div>
    </div>
  );
};

interface DeleteConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirm = ({ onConfirm, onCancel }: DeleteConfirmProps): JSX.Element => (
  <div className="flex flex-wrap items-center gap-2 rounded-md border border-solid border-crit px-3 py-2">
    <p className="m-0 flex-1 text-xs text-crit">{DELETE_CONFIRM_MESSAGE}</p>
    <button type="button" onClick={onConfirm} className={BUTTON_DESTRUCTIVE}>
      {DELETE_CONFIRM_LABEL}
    </button>
    <button type="button" onClick={onCancel} className={BUTTON_QUIET}>
      {CANCEL_LABEL}
    </button>
  </div>
);

interface ThreadHandlers {
  onSelect: (thread: CommentThread) => void;
  onReply: (thread: CommentThread, body: string) => Promise<boolean>;
  onToggleStatus: (thread: CommentThread) => void;
  onDelete: (thread: CommentThread) => void;
}

type ThreadMode = "idle" | "replying" | "confirmingDelete";

interface ThreadButtonsProps {
  status: CommentStatus;
  onReply: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

const ThreadButtons = ({
  status,
  onReply,
  onToggleStatus,
  onDelete,
}: ThreadButtonsProps): JSX.Element => (
  <div className="flex flex-wrap gap-2">
    <button type="button" onClick={onReply} className={BUTTON_QUIET}>
      {REPLY_LABEL}
    </button>
    <button type="button" onClick={onToggleStatus} className={BUTTON_PRIMARY}>
      {STATUS_ACTION_LABELS[status]}
    </button>
    <button type="button" onClick={onDelete} className={BUTTON_DESTRUCTIVE}>
      {DELETE_LABEL}
    </button>
  </div>
);

const ThreadActions = ({
  thread,
  handlers,
}: {
  thread: CommentThread;
  handlers: ThreadHandlers;
}): JSX.Element => {
  const [mode, setMode] = useState<ThreadMode>("idle");
  const backToIdle = (): void => {
    setMode("idle");
  };
  if (mode === "replying") {
    const reply = async (body: string): Promise<boolean> => {
      const sent = await handlers.onReply(thread, body);
      if (sent) backToIdle();
      return sent;
    };
    return (
      <Composer
        fieldLabel={REPLY_FIELD_LABEL}
        submitLabel={REPLY_SUBMIT_LABEL}
        onSubmit={reply}
        onCancel={backToIdle}
      />
    );
  }
  if (mode === "confirmingDelete") {
    return <DeleteConfirm onConfirm={() => handlers.onDelete(thread)} onCancel={backToIdle} />;
  }
  return (
    <ThreadButtons
      status={thread.status}
      onReply={() => setMode("replying")}
      onToggleStatus={() => handlers.onToggleStatus(thread)}
      onDelete={() => setMode("confirmingDelete")}
    />
  );
};

interface ThreadCardProps {
  thread: CommentThread;
  gone: boolean;
  active: boolean;
  handlers: ThreadHandlers;
}

const ThreadCard = ({ thread, gone, active, handlers }: ThreadCardProps): JSX.Element => (
  <li>
    <article
      aria-current={active ? "true" : undefined}
      className={`flex flex-col gap-3 rounded-md border border-solid bg-paper-raised px-4 py-3 ${
        active ? "border-ink-aqua" : "border-line"
      } ${thread.status === "resolved" ? "opacity-80" : ""}`}
    >
      <ThreadQuote anchor={thread.anchor} gone={gone} onSelect={() => handlers.onSelect(thread)} />
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {thread.messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </ul>
      <ThreadActions thread={thread} handlers={handlers} />
    </article>
  </li>
);

interface ThreadListProps {
  threads: CommentThread[];
  bodyText: string | null;
  activeThreadId: string | null;
  handlers: ThreadHandlers;
}

const ThreadList = ({
  threads,
  bodyText,
  activeThreadId,
  handlers,
}: ThreadListProps): JSX.Element => {
  const goneIds = useGoneThreadIds(threads, bodyText);
  return (
    <ul aria-label={THREAD_LIST_LABEL} className="m-0 flex list-none flex-col gap-2 p-0">
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          gone={goneIds.has(thread.id)}
          active={thread.id === activeThreadId}
          handlers={handlers}
        />
      ))}
    </ul>
  );
};

const ResolvedSection = (props: ThreadListProps): JSX.Element | null => {
  const [shown, setShown] = useState(false);
  if (props.threads.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        className={`${BUTTON_QUIET} self-start`}
      >
        {shown ? HIDE_RESOLVED_LABEL : showResolvedLabel(props.threads.length)}
      </button>
      {shown && <ThreadList {...props} />}
    </div>
  );
};

const PanelHeader = ({ openCount }: { openCount: number }): JSX.Element => (
  <div className="flex items-center gap-2">
    <h3 className="m-0 font-display text-sm tracking-wide text-text-faint">{HEADING}</h3>
    <span className="rounded-full border border-solid border-ink-aqua px-2 py-0.5 font-mono text-[0.625rem] text-ink-aqua-text">
      {openCountLabel(openCount)}
    </span>
  </div>
);

const ErrorAlert = ({ message }: { message: string }): JSX.Element => (
  <p
    role="alert"
    className="m-0 rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
  >
    {message}
  </p>
);

const useCommentThreads = (entityType: CommentEntityType, entityId: string) => {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 対象切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    const load = async (): Promise<void> => {
      try {
        const loaded = await window.hanamask.listComments(entityType, entityId);
        if (!current) return;
        setThreads(loaded);
        setError(null);
      } catch (cause) {
        if (current) setError(`コメントの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    const unsubscribe = window.hanamask.onCommentsChanged(() => {
      void load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [entityType, entityId]);

  const reload = useCallback(async (): Promise<void> => {
    setThreads(await window.hanamask.listComments(entityType, entityId));
  }, [entityType, entityId]);

  return { threads, error, setError, reload };
};

/** 操作して取り直す。成功したら true。失敗の理由は警告欄に出す。 */
const useCommentAction = (
  reload: () => Promise<void>,
  setError: (message: string | null) => void,
) =>
  useCallback(
    async (action: () => Promise<unknown>, failure: string): Promise<boolean> => {
      try {
        setError(null);
        await action();
        // UI 操作の結果を通知に頼らず自分で取り直す。通知が来るかどうかは main 側の都合に依存させない。
        await reload();
        return true;
      } catch (cause) {
        setError(`${failure}: ${String(cause)}`);
        return false;
      }
    },
    [reload, setError],
  );

const useThreadHandlers = (
  run: (action: () => Promise<unknown>, failure: string) => Promise<boolean>,
  onSelectThread: (thread: CommentThread) => void,
  setError: (message: string | null) => void,
): ThreadHandlers => ({
  onSelect: onSelectThread,
  onReply: (thread, body) =>
    run(() => window.hanamask.replyComment(thread.id, body), "返信に失敗しました"),
  onToggleStatus: (thread) => {
    const next = NEXT_STATUS[thread.status];
    void run(() => window.hanamask.setCommentStatus(thread.id, next), "状態の変更に失敗しました");
  },
  onDelete: (thread) => {
    void run(async () => {
      if (!(await window.hanamask.deleteComment(thread.id))) setError(DELETE_MISSING_MESSAGE);
    }, "削除に失敗しました");
  },
});

interface CommentPanelProps {
  entityType: CommentEntityType;
  entityId: string;
  /** 「元の箇所が変わりました」の判定に使う本文の文字。描画した本文の textContent で渡す。読めていなければ null。 */
  bodyText: string | null;
  pendingAnchor: CommentAnchor | null;
  onClearPending: () => void;
  activeThreadId: string | null;
  onSelectThread: (thread: CommentThread) => void;
}

interface NewCommentProps {
  anchor: CommentAnchor | null;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel: () => void;
}

const NewComment = ({ anchor, onSubmit, onCancel }: NewCommentProps): JSX.Element => (
  <div className="flex flex-col gap-2 rounded-md border border-dashed border-ink-aqua bg-paper px-4 py-3">
    {anchor !== null && <QuoteText anchor={anchor} />}
    <Composer
      fieldLabel={NEW_COMMENT_FIELD_LABEL}
      submitLabel={NEW_COMMENT_SUBMIT_LABEL}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  </div>
);

const useNewCommentForm = (props: CommentPanelProps, run: ReturnType<typeof useCommentAction>) => {
  const { entityType, entityId, pendingAnchor, onClearPending } = props;
  const [composing, setComposing] = useState(false);
  const close = (): void => {
    setComposing(false);
    onClearPending();
  };
  const submit = async (body: string): Promise<boolean> => {
    const input = { entityType, entityId, body, anchor: pendingAnchor };
    const created = await run(
      () => window.hanamask.createComment(input),
      "コメントの作成に失敗しました",
    );
    if (created) close();
    return created;
  };
  return {
    open: composing || pendingAnchor !== null,
    start: () => setComposing(true),
    close,
    submit,
  };
};

export const CommentPanel = (props: CommentPanelProps): JSX.Element => {
  const { threads, error, setError, reload } = useCommentThreads(props.entityType, props.entityId);
  const run = useCommentAction(reload, setError);
  const form = useNewCommentForm(props, run);
  const handlers = useThreadHandlers(run, props.onSelectThread, setError);
  const open = threads.filter((thread) => thread.status === "open");
  const resolved = threads.filter((thread) => thread.status === "resolved");
  const listProps = {
    bodyText: props.bodyText,
    activeThreadId: props.activeThreadId,
    handlers,
  };

  return (
    <section aria-label={HEADING} className="flex flex-col gap-3 font-body text-text">
      <PanelHeader openCount={open.length} />
      {error !== null && <ErrorAlert message={error} />}
      {form.open ? (
        <NewComment anchor={props.pendingAnchor} onSubmit={form.submit} onCancel={form.close} />
      ) : (
        <button type="button" onClick={form.start} className={`${BUTTON_QUIET} self-start`}>
          {WRITE_ENTITY_COMMENT_LABEL}
        </button>
      )}
      {threads.length === 0 && <p className="m-0 text-sm text-text-faint">{EMPTY_MESSAGE}</p>}
      {open.length > 0 && <ThreadList threads={open} {...listProps} />}
      <ResolvedSection threads={resolved} {...listProps} />
    </section>
  );
};
