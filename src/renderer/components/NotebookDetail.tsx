import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Note, Notebook } from "../../shared/preload-api";
import { EntityLinks } from "./EntityLinks";
import { MarkdownBody } from "./MarkdownBody";
import { TagList } from "./TagList";
import { toBodyPreview } from "../text/bodyPreview";
import { toUpdatedLabel } from "../text/dateLabel";

interface NotebookDetailProps {
  notebookId: string;
  onSelectPage: (id: string) => void;
  onBack: () => void;
}

interface NotebookDraft {
  title: string;
  summary: string;
  tagsText: string;
}

const NOT_FOUND_MESSAGE = "ノートが見つかりません";
const EXTERNAL_UPDATE_MESSAGE = "このノートは別の場所で更新されました";
const DISCARD_LABEL = "破棄して最新を読み込む";
const SUMMARY_HEADING = "概要（AIが自動で追従更新）";
const SUMMARY_FIELD_LABEL = "概要";
const EMPTY_SUMMARY_MESSAGE = "概要はまだありません";
const RECENT_HEADING = "最近更新されたページ";
// ページ一覧はナビゲーション側だけが持つ（SPEC 案1）。ここは入口を思い出すための数件に留める。
const RECENT_HINT = "一覧はナビゲーションに";
const RECENT_LIMIT = 3;
const EMPTY_PAGES_MESSAGE = "ページはありません";
const TAG_SEPARATOR = ",";
const SUMMARY_TEXTAREA_ROWS = 10;
const TITLE_FIELD_ID = "notebook-detail-title";
const SUMMARY_FIELD_ID = "notebook-detail-summary";
const TAGS_FIELD_ID = "notebook-detail-tags";

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border bg-transparent px-3 py-2 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua bg-ink-aqua/10 font-semibold text-ink-aqua-text`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
const BARE_BUTTON = `${FOCUS_RING} cursor-pointer appearance-none border-0 bg-transparent p-0 font-body`;
const ALERT =
  "m-0 rounded-md border border-crit bg-paper-raised px-4 py-3 font-body text-sm text-crit";
const FIELD_LABEL = "font-display text-xs tracking-wide text-text-faint";
// box-border: preflight を入れていないため box-sizing は content-box のまま。
const FIELD = `${FOCUS_RING} m-0 box-border w-full rounded-md border border-line bg-paper-raised px-3 py-2 font-body text-sm text-text`;
const SECTION_HEADING = "m-0 font-display text-sm tracking-wide text-text-faint";
const EMPTY_BLOCK =
  "m-0 rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center font-body text-sm text-text-faint";

const toDraft = (notebook: Notebook): NotebookDraft => ({
  title: notebook.title,
  summary: notebook.summary,
  tagsText: notebook.tags.join(`${TAG_SEPARATOR} `),
});

const parseTags = (tagsText: string): string[] =>
  tagsText
    .split(TAG_SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

const toRecentPages = (notes: readonly Note[]): Note[] =>
  [...notes]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, RECENT_LIMIT);

const toMetaLabel = (notebook: Notebook, pageCount: number): string =>
  ["ノート", `ページ ${String(pageCount)} 件`, toUpdatedLabel(notebook.updatedAt)]
    .filter((part) => part !== "")
    .join(" · ");

// ピンク＝自分以外の手で変わったこと。読む前に「外から来た知らせ」だと分かるようにする。
const ExternalUpdateNotice = ({ onDiscard }: { onDiscard: () => void }): JSX.Element => (
  <div
    role="status"
    className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-pink bg-ink-pink/10 px-4 py-3"
  >
    <p className="m-0 flex-1 font-body text-sm text-ink-pink">{EXTERNAL_UPDATE_MESSAGE}</p>
    <button type="button" onClick={onDiscard} className={BUTTON_SECONDARY}>
      {DISCARD_LABEL}
    </button>
  </div>
);

interface NotebookEditFormProps {
  draft: NotebookDraft;
  error: string | null;
  onChange: (patch: Partial<NotebookDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const NotebookEditForm = ({
  draft,
  error,
  onChange,
  onSave,
  onCancel,
}: NotebookEditFormProps): JSX.Element => (
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
      <label htmlFor={SUMMARY_FIELD_ID} className={FIELD_LABEL}>
        {SUMMARY_FIELD_LABEL}
      </label>
      <textarea
        id={SUMMARY_FIELD_ID}
        className={`${FIELD} resize-y leading-relaxed`}
        rows={SUMMARY_TEXTAREA_ROWS}
        value={draft.summary}
        onChange={(event) => {
          onChange({ summary: event.target.value });
        }}
      />
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor={TAGS_FIELD_ID} className={FIELD_LABEL}>
        タグ
      </label>
      <input
        id={TAGS_FIELD_ID}
        className={FIELD}
        value={draft.tagsText}
        onChange={(event) => {
          onChange({ tagsText: event.target.value });
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

interface PageRowProps {
  note: Note;
  onSelect: () => void;
}

const PageRow = ({ note, onSelect }: PageRowProps): JSX.Element => {
  const preview = toBodyPreview(note.body);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line bg-paper-raised px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          className={`${BARE_BUTTON} text-left text-base font-semibold text-ink-aqua-text underline-offset-4 hover:underline`}
          onClick={onSelect}
        >
          {note.title}
        </button>
        <span className="font-body text-xs text-text-faint">{toUpdatedLabel(note.updatedAt)}</span>
      </div>
      {preview !== "" && (
        <p className="m-0 font-body text-sm leading-relaxed text-text-soft">{preview}</p>
      )}
    </li>
  );
};

interface RecentPagesProps {
  notes: readonly Note[];
  onSelectPage: (id: string) => void;
}

const RecentPages = ({ notes, onSelectPage }: RecentPagesProps): JSX.Element => (
  <section className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className={SECTION_HEADING}>{RECENT_HEADING}</h3>
      <span className="font-body text-xs text-text-faint">{RECENT_HINT}</span>
    </div>
    {notes.length === 0 ? (
      <p className={EMPTY_BLOCK}>{EMPTY_PAGES_MESSAGE}</p>
    ) : (
      <ul aria-label={RECENT_HEADING} className="m-0 flex list-none flex-col gap-2 p-0">
        {toRecentPages(notes).map((note) => (
          <PageRow
            key={note.id}
            note={note}
            onSelect={() => {
              onSelectPage(note.id);
            }}
          />
        ))}
      </ul>
    )}
  </section>
);

interface NotebookViewProps {
  notebook: Notebook;
  notes: readonly Note[];
  onEdit: () => void;
  onSelectPage: (id: string) => void;
}

const NotebookView = ({
  notebook,
  notes,
  onEdit,
  onSelectPage,
}: NotebookViewProps): JSX.Element => (
  <>
    <header className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-line pb-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-2xl leading-tight font-bold break-words text-text">
          {notebook.title}
        </h2>
        <p className="m-0 font-body text-xs text-text-faint">
          {toMetaLabel(notebook, notes.length)}
        </p>
      </div>
      <button type="button" className={BUTTON_PRIMARY} onClick={onEdit}>
        編集
      </button>
    </header>
    <TagList tags={notebook.tags} />
    <section className="flex flex-col gap-2">
      <h3 className={SECTION_HEADING}>{SUMMARY_HEADING}</h3>
      {notebook.summary.trim() === "" ? (
        <p className={EMPTY_BLOCK}>{EMPTY_SUMMARY_MESSAGE}</p>
      ) : (
        <MarkdownBody content={notebook.summary} />
      )}
    </section>
    <RecentPages notes={notes} onSelectPage={onSelectPage} />
    <EntityLinks entityType="notebook" entityId={notebook.id} />
  </>
);

interface LoadedNotebook {
  notebook: Notebook | null;
  notes: Note[];
}

const EMPTY_LOADED: LoadedNotebook = { notebook: null, notes: [] };

export const NotebookDetail = ({
  notebookId,
  onSelectPage,
  onBack,
}: NotebookDetailProps): JSX.Element => {
  const [loaded, setLoaded] = useState<LoadedNotebook>(EMPTY_LOADED);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NotebookDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [external, setExternal] = useState<LoadedNotebook | null>(null);
  // 取り直しの失敗で表示中の内容まで消さないよう、初回読み込みの失敗とは分けて持つ。
  const [reloadError, setReloadError] = useState<string | null>(null);

  const editing = draft !== null;
  // 変更通知のコールバックは購読時のstateを閉じ込めてしまうため、判断材料は都度refから読む。
  // mutationCountは保存のたびに増える。取得の前後で値が変われば、その取得は保存前の内容を
  // 運んでいるので捨てる。加算は保存の開始時なので、保存が失敗すると待機中だった正当な取得を
  // 1回だけ捨てる。次の変更通知で取り直されるため許容している（NoteDetail と同じ仕組み）。
  const liveStateRef = useRef({ editing, mutationCount: 0 });
  useEffect(() => {
    liveStateRef.current.editing = editing;
  }, [editing]);

  const reload = useCallback(async (): Promise<void> => {
    const startedAtMutationCount = liveStateRef.current.mutationCount;
    const latest = await window.hanamask.getNotebook(notebookId);
    setReloadError(null);
    if (liveStateRef.current.mutationCount !== startedAtMutationCount) return;
    if (latest.notebook === null) {
      // 閲覧中に外部で削除された。編集中は入力を守り、通知バナーに任せる。
      if (!liveStateRef.current.editing) {
        setError(NOT_FOUND_MESSAGE);
      }
      return;
    }
    // 編集中の入力を失わせないため、反映せず通知だけ出して利用者に選ばせる。
    if (liveStateRef.current.editing) setExternal(latest);
    else setLoaded(latest);
  }, [notebookId]);

  useEffect(() => {
    // ノート切替時に古い取得結果が後から届いて上書きするのを防ぐ。
    let current = true;
    setReloadError(null);
    const load = async (): Promise<void> => {
      try {
        const latest = await window.hanamask.getNotebook(notebookId);
        if (!current) return;
        setLoaded(latest);
        setDraft(null);
        setSaveError(null);
        setExternal(null);
        setError(latest.notebook === null ? NOT_FOUND_MESSAGE : null);
      } catch (cause) {
        if (current) setError(`ノートの読み込みに失敗しました: ${String(cause)}`);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [notebookId]);

  // MCPツール経由の更新は同じ画面を開いたまま起きるため、変更通知で取り直す。
  // create_page / move_page はページ側の通知しか流さないので、両方を購読しないと
  // 件数と「最近更新されたページ」だけが古いまま残る。
  useEffect(() => {
    const refresh = (): void => {
      void reload().catch((cause: unknown) => {
        setReloadError(`最新の内容の取得に失敗しました: ${String(cause)}`);
      });
    };
    const stopNotebooks = window.hanamask.onNotebooksChanged(refresh);
    const stopNotes = window.hanamask.onNotesChanged(refresh);
    return () => {
      stopNotebooks();
      stopNotes();
    };
  }, [reload]);

  const discardDraft = (): void => {
    if (external !== null) setLoaded(external);
    setExternal(null);
    setDraft(null);
    setSaveError(null);
  };

  const saveDraft = async (): Promise<void> => {
    if (draft === null) return;
    try {
      setSaveError(null);
      liveStateRef.current.mutationCount += 1;
      const updated = await window.hanamask.updateNotebook(notebookId, {
        title: draft.title,
        summary: draft.summary,
        tags: parseTags(draft.tagsText),
      });
      if (updated === null) {
        setSaveError(NOT_FOUND_MESSAGE);
        return;
      }
      setLoaded((current) => ({ notebook: updated, notes: external?.notes ?? current.notes }));
      setDraft(null);
      setExternal(null);
    } catch (cause) {
      setSaveError(`ノートの更新に失敗しました: ${String(cause)}`);
    }
  };

  const patchDraft = (patch: Partial<NotebookDraft>): void => {
    setDraft((current) => (current === null ? null : { ...current, ...patch }));
  };

  const { notebook, notes } = loaded;

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
      {notebook !== null && error === null && draft !== null && (
        <>
          {external !== null && <ExternalUpdateNotice onDiscard={discardDraft} />}
          <NotebookEditForm
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
      {notebook !== null && error === null && draft === null && (
        <NotebookView
          notebook={notebook}
          notes={notes}
          onSelectPage={onSelectPage}
          onEdit={() => {
            setDraft(toDraft(notebook));
          }}
        />
      )}
    </article>
  );
};
