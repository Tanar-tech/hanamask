import { useCallback, useEffect, useState, type JSX } from "react";
import type { Note, Notebook } from "../../shared/preload-api";
import {
  filterNavItems,
  pinnedNavItems,
  type NavItem,
  type NavNotebook,
  type NavPage,
} from "../text/navFilter";

export interface NotebookPages {
  notebook: Notebook | null;
  notes: Note[];
}

/* preflight を入れていないため、ブラウザ既定のマージン・リストマーカー・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const NAV_BUTTON = `${FOCUS_RING} m-0 flex w-full cursor-pointer appearance-none items-center gap-2 rounded-md border-0 border-l-2 bg-transparent px-3 py-1.5 text-left font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const NAV_BUTTON_CURRENT = "border-l-ink-aqua bg-ink-aqua/10 font-semibold text-ink-aqua-text";
const NAV_BUTTON_IDLE = "border-l-transparent text-text-soft hover:text-text";
const BADGE =
  "shrink-0 rounded-full border border-line px-2 py-0.5 font-body text-xs text-text-faint";
const EMPTY_TEXT = "m-0 px-3 py-4 font-body text-sm text-text-faint";

/* ピン留め中は常に見える。未ピンは行にマウス／フォーカスが来たときだけ現れる。 */
const PIN_TOGGLE = `${FOCUS_RING} m-0 shrink-0 cursor-pointer appearance-none rounded-md border-0 bg-transparent px-1 py-1 font-body text-xs leading-none transition-opacity duration-[var(--duration-fast)] ease-standard`;
const PIN_TOGGLE_PINNED = "opacity-100";
const PIN_TOGGLE_IDLE = "opacity-0 group-hover:opacity-100 focus-visible:opacity-100";
const PIN_MARK = "📌";
const ROW = "group flex items-center";

const LIST_LABEL = "ノート・ページ";
const PINNED_LABEL = "ピン留め";
const FILTER_LABEL = "ノート・ページを絞り込み";
const EMPTY_MESSAGE = "ノートもページもまだありません";
const NO_MATCH_MESSAGE = "一致するノート・ページはありません";

const countPagesByNotebook = (notes: readonly Note[]): Map<string, number> =>
  notes.reduce((counts, note) => {
    const notebookId = note.notebookId ?? null;
    if (notebookId !== null) counts.set(notebookId, (counts.get(notebookId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

const toNavItems = (notebooks: readonly Notebook[], notes: readonly Note[]): NavItem[] => {
  const pageCounts = countPagesByNotebook(notes);
  const titleById = new Map(notebooks.map((notebook) => [notebook.id, notebook.title]));
  return [
    ...notebooks.map<NavItem>(({ id, title, updatedAt, pinnedAt }) => ({
      kind: "notebook",
      notebook: {
        id,
        title,
        updatedAt,
        pageCount: pageCounts.get(id) ?? 0,
        pinnedAt: pinnedAt ?? null,
      },
    })),
    ...notes.map<NavItem>(({ id, title, updatedAt, notebookId, pinnedAt }) => ({
      kind: "page",
      page: {
        id,
        title,
        updatedAt,
        notebookTitle: titleById.get(notebookId ?? "") ?? null,
        pinnedAt: pinnedAt ?? null,
      },
    })),
  ];
};

const PinToggle = ({
  title,
  pinned,
  onToggle,
}: {
  title: string;
  pinned: boolean;
  onToggle: () => void;
}): JSX.Element => (
  <button
    type="button"
    // 行ボタンの名前（タイトル）と衝突しないよう、動作を含めた名前にする。
    aria-label={pinned ? `${title}のピン留めを解除` : `${title}をピン留め`}
    aria-pressed={pinned}
    onClick={onToggle}
    className={`${PIN_TOGGLE} ${pinned ? PIN_TOGGLE_PINNED : PIN_TOGGLE_IDLE}`}
  >
    <span aria-hidden="true">{PIN_MARK}</span>
  </button>
);

const NotebookRow = ({
  notebook,
  current,
  onSelect,
  onTogglePin,
}: {
  notebook: NavNotebook;
  current: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}): JSX.Element => (
  <li className={ROW}>
    <button
      type="button"
      aria-label={`${notebook.title}（ページ${String(notebook.pageCount)}件）`}
      aria-current={current ? "page" : undefined}
      onClick={onSelect}
      className={`${NAV_BUTTON} min-w-0 flex-1 ${current ? NAV_BUTTON_CURRENT : NAV_BUTTON_IDLE}`}
    >
      <span className="min-w-0 flex-1 truncate">{notebook.title}</span>
      <span className={BADGE}>{notebook.pageCount}</span>
    </button>
    <PinToggle title={notebook.title} pinned={notebook.pinnedAt !== null} onToggle={onTogglePin} />
  </li>
);

const pageLabelOf = (page: NavPage): string =>
  page.notebookTitle === null ? page.title : `${page.notebookTitle} > ${page.title}`;

const PageRow = ({
  page,
  onSelect,
  onTogglePin,
}: {
  page: NavPage;
  onSelect: () => void;
  onTogglePin: () => void;
}): JSX.Element => (
  <li className={ROW}>
    <button
      type="button"
      // 見た目はノート名を薄く分けるが、読み上げは1つの名前として届くようにする。
      aria-label={pageLabelOf(page)}
      onClick={onSelect}
      className={`${NAV_BUTTON} min-w-0 flex-1 ${NAV_BUTTON_IDLE}`}
    >
      <span className="min-w-0 flex-1 truncate">
        {/* 絞り込みで出てきた所属ページは、どのノートの中にあるかが分からないと開けない。 */}
        {page.notebookTitle !== null && (
          <span className="text-text-faint">{`${page.notebookTitle} > `}</span>
        )}
        {page.title}
      </span>
    </button>
    <PinToggle title={page.title} pinned={page.pinnedAt !== null} onToggle={onTogglePin} />
  </li>
);

interface NotebookNavProps {
  selectedNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
  onSelectPage: (id: string) => void;
}

export const NotebookNav = ({
  selectedNotebookId,
  onSelectNotebook,
  onSelectPage,
}: NotebookNavProps): JSX.Element => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loadedNotebooks, loadedNotes] = await Promise.all([
        window.hanamask.listNotebooks(),
        window.hanamask.listNotes(),
      ]);
      setNotebooks(loadedNotebooks);
      setNotes(loadedNotes);
      setError(null);
    } catch (cause) {
      setError(`ノート・ページの読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void reload();
    const stopNotes = window.hanamask.onNotesChanged(() => {
      void reload();
    });
    const stopNotebooks = window.hanamask.onNotebooksChanged(() => {
      void reload();
    });
    return () => {
      stopNotes();
      stopNotebooks();
    };
  }, [reload]);

  const togglePin = useCallback(async (item: NavItem): Promise<void> => {
    try {
      if (item.kind === "notebook") {
        await window.hanamask.setNotebookPinned(item.notebook.id, item.notebook.pinnedAt === null);
      } else {
        await window.hanamask.setNotePinned(item.page.id, item.page.pinnedAt === null);
      }
    } catch (cause) {
      setError(`ピン留めの切り替えに失敗しました: ${String(cause)}`);
    }
  }, []);

  const items = toNavItems(notebooks, notes);
  const shown = filterNavItems(query, items);
  const notebookRows = shown.filter((item) => item.kind === "notebook");
  const pageRows = shown.filter((item) => item.kind === "page");
  // 絞り込み中は結果を一本のリストで見せたいので、ピン留めセクションは畳む。
  const pinned = query.trim() === "" ? pinnedNavItems(items) : [];

  const renderRow = (item: NavItem): JSX.Element => {
    const onTogglePin = () => {
      void togglePin(item);
    };
    return item.kind === "notebook" ? (
      <NotebookRow
        key={`notebook-${item.notebook.id}`}
        notebook={item.notebook}
        current={item.notebook.id === selectedNotebookId}
        onSelect={() => {
          onSelectNotebook(item.notebook.id);
        }}
        onTogglePin={onTogglePin}
      />
    ) : (
      <PageRow
        key={`page-${item.page.id}`}
        page={item.page}
        onSelect={() => {
          onSelectPage(item.page.id);
        }}
        onTogglePin={onTogglePin}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="notebook-nav-filter">
        {FILTER_LABEL}
      </label>
      <input
        id="notebook-nav-filter"
        type="search"
        value={query}
        placeholder={FILTER_LABEL}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        className={`w-full rounded-md border border-line bg-paper px-3 py-1.5 font-body text-sm text-text ${FOCUS_RING}`}
      />
      {error !== null && (
        <p role="alert" className="m-0 px-3 py-2 font-body text-sm text-crit">
          {error}
        </p>
      )}
      {error === null && shown.length === 0 && (
        <p className={EMPTY_TEXT}>{query.trim() === "" ? EMPTY_MESSAGE : NO_MATCH_MESSAGE}</p>
      )}
      {pinned.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="m-0 px-3 font-body text-xs tracking-wide text-text-faint">{PINNED_LABEL}</p>
          <ul aria-label={PINNED_LABEL} className="m-0 flex list-none flex-col gap-0.5 p-0">
            {pinned.map(renderRow)}
          </ul>
        </div>
      )}
      <ul aria-label={LIST_LABEL} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {notebookRows.map(renderRow)}
        {/* ノートの束と無所属ページの境目。点線1本で「ここから先は束に入っていない」を示す。 */}
        {notebookRows.length > 0 && pageRows.length > 0 && (
          <li aria-hidden="true" className="my-1 border-0 border-t border-dashed border-line" />
        )}
        {pageRows.map(renderRow)}
      </ul>
    </div>
  );
};
