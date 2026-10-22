/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { App } from "../../src/renderer/App";
import type { AppSettings, DeletedNote, Image, NavigateTarget, Note, Notebook, NoteVersion, Task } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
  mimeType: "image/png",
};

const note: Note = {
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const deletedNote: DeletedNote = {
  id: "note-2",
  title: "消したメモ",
  body: "削除済みノートの本文",
  tags: [],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  deletedAt: "2026-08-03T12:00:00.000Z",
};

const notebook: Notebook = {
  id: "notebook-1",
  title: "ローカルLLM組み込み",
  summary: "推論エンジンをアプリに同梱する案件",
  tags: ["ローカルLLM"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const pageInNotebook: Note = {
  id: "note-3",
  title: "埋め込みモデル選定",
  body: "埋め込みモデルの本文",
  tags: [],
  notebookId: notebook.id,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const task: Task = {
  id: "task-1",
  title: "MCPサーバーを実装する",
  body: "",
  tags: [],
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const navigateListeners: Array<(view: NavigateTarget) => void> = [];
const unsubscribeNavigate = vi.fn();

const mockHanamask = () => {
  navigateListeners.length = 0;
  unsubscribeNavigate.mockClear();
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listNotes: vi.fn(async () => [note]),
    searchNotes: vi.fn(async () => [note]),
    getNote: vi.fn(async () => note),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    setNotePinned: vi.fn(async () => null),
    onNotesChanged: vi.fn(() => () => {}),
    onNotebooksChanged: vi.fn(() => () => undefined),
    listDeletedNotebooks: vi.fn(async () => []),
    listNotebooks: vi.fn(async () => []),
    getNotebook: vi.fn(async () => ({ notebook: null, notes: [] })),
    updateNotebook: vi.fn(async () => null),
    restoreNotebook: vi.fn(async () => true),
    setNotebookPinned: vi.fn(async () => null),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => [deletedNote]),
    restoreNote: vi.fn(async () => deletedNote),
    listTasks: vi.fn(async () => [task]),
    getTask: vi.fn(async () => task),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    onNavigate: vi.fn((callback: (view: NavigateTarget) => void) => {
      navigateListeners.push(callback);
      return unsubscribeNavigate;
    }),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
    readMcpEndpoint: vi.fn(async () => ({ port: 39217, url: "http://127.0.0.1:39217/mcp" })),
    readAppSettings: vi.fn(async () => ({ closeToTray: true, openAtLogin: false })),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [], notebooks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
    listChatEntries: vi.fn(async () => []),
    postChatEntry: vi.fn(async () => {
      throw new Error("postChatEntry is not stubbed");
    }),
    getChatPresence: vi.fn(async () => ({ waitingAgents: 0 })),
    onChatEntriesChanged: vi.fn(() => () => {}),
    onChatPresenceChanged: vi.fn(() => () => {}),
  };
};

const emitNavigate = async (view: NavigateTarget): Promise<void> => {
  if (navigateListeners.length === 0) throw new Error("onNavigate was not subscribed");
  await act(async () => {
    navigateListeners.forEach((listener) => {
      listener(view);
    });
  });
};

const clickButton = async (name: string): Promise<void> => {
  const button = await screen.findByRole("button", { name });
  await act(async () => {
    button.click();
  });
};

// ツリーは全セクションで左列に出たままなので、ページ名のボタンは Main View 側と二重にヒットする。
// どちらの経路を押したかが分かるよう、主部に絞る。
const mainView = (): HTMLElement => screen.getByRole("main");

const findMainButton = (name: string): Promise<HTMLElement> =>
  within(mainView()).findByRole("button", { name });

const clickMainButton = async (name: string): Promise<void> => {
  const button = await findMainButton(name);
  await act(async () => {
    button.click();
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App のナビゲーション", () => {
  it("初期表示ではホーム画面を表示する", async () => {
    mockHanamask();

    render(<App />);

    expect(await findMainButton("設計メモ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCPサーバーを実装する" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のページ" })).toBeTruthy();
  });

  it("ノートタイトルをクリックすると詳細画面に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickMainButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();

    await clickButton("戻る");

    expect(await findMainButton("設計メモ")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のページ" })).toBeTruthy();
  });

  it("タスクタイトルをクリックするとタスク詳細画面に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("MCPサーバーを実装する");

    expect(await screen.findByRole("combobox", { name: "ステータス" })).toBeTruthy();
    expect(within(mainView()).queryByRole("button", { name: "設計メモ" })).toBeNull();

    await clickButton("戻る");

    expect(await findMainButton("設計メモ")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "ステータス" })).toBeNull();
  });

  it("詳細画面では選択したノートのIDで取得する", async () => {
    mockHanamask();

    render(<App />);
    await clickMainButton("設計メモ");

    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    expect(window.hanamask.getNote).toHaveBeenCalledWith("note-1");
  });
});

/*
 * AIチャットは動作しないため利用者から見えない状態にした（CHAT_ENABLED）。
 * 画面から消えていることと、設定画面にも出ないことを対で確かめる。
 * 実装は残してあるので、フラグを戻せば復活する。
 */
describe("AIチャットを出さない", () => {
  it("ホームにチャットの枠を出さない", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("button", { name: "ホーム" });

    expect(screen.queryByRole("complementary", { name: "AIチャット" })).toBeNull();
    expect(screen.queryByText("ノートやタスクの操作を頼めます。")).toBeNull();
  });

  it("設定画面にチャットの設定を出さない", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("設定");

    // 設定画面自体は開く（書き出し・取り込みはここにある）。
    expect(await screen.findByRole("heading", { name: "データの書き出しと取り込み" })).toBeTruthy();
    expect(screen.queryByLabelText(/APIキー/)).toBeNull();
  });
});

describe("App の左レール", () => {
  it("現在地を aria-current=page で示す", async () => {
    mockHanamask();

    render(<App />);

    expect((await screen.findByRole("button", { name: "ホーム" })).getAttribute("aria-current")).toBe(
      "page",
    );

    await clickButton("ノート");

    expect(screen.getByRole("button", { name: "ノート" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "ホーム" }).getAttribute("aria-current")).toBeNull();
  });

  it("タスク詳細を開いている間は「タスク」を現在地として示す", async () => {
    mockHanamask();

    render(<App />);
    // ノートを選んでから、MCPのopen_taskと同じ経路でタスク詳細へ飛ばす。
    await clickButton("ノート");
    await emitNavigate({ kind: "task", id: task.id });

    expect(await screen.findByRole("heading", { name: task.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: "タスク" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "ノート" }).getAttribute("aria-current")).toBeNull();
  });

  it("ノート詳細を開いている間は「ノート」を現在地として示す", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("タスク");
    await emitNavigate({ kind: "note", id: note.id });

    expect(await screen.findByRole("heading", { name: note.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ノート" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "タスク" }).getAttribute("aria-current")).toBeNull();
  });

  it("「ノート」でノート一覧を開き、ホームは表示しない", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");

    expect(await screen.findByRole("list", { name: "ページ一覧" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
  });

  it("「タスク」でタスク一覧とカンバンを開く", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("タスク");

    expect(await screen.findByRole("list", { name: "タスク一覧" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "進行中" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
  });

  /*
   * カンバンを先に見せる。タスク画面で最初に知りたいのは「いま何がどの段階にあるか」で、
   * 一覧はその後で個別のタスクを開くためのもの。並び順が意味を持つので固定する。
   */
  it("タスク画面ではカンバンが一覧より上に出る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("タスク");

    const kanban = await screen.findByRole("heading", { name: "カンバン" });
    const list = screen.getByRole("list", { name: "タスク一覧" });

    // DOCUMENT_POSITION_FOLLOWING: kanban より後ろに list がある。
    expect(kanban.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Home と NoteList/TaskList は空状態の文言が同一なので、同時に描画されると E2E の
  // getByText が多重ヒットして落ちる。排他描画がその唯一の防波堤なのでテストで固定する。
  it("ホーム表示中はノート一覧・タスク一覧を描画しない", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("heading", { name: "最近のページ" });

    expect(screen.queryByRole("list", { name: "ページ一覧" })).toBeNull();
    expect(screen.queryByRole("list", { name: "タスク一覧" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "進行中" })).toBeNull();
  });

  it("「ノート」へ移動するとホームとタスク一覧を描画しない", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");
    await screen.findByRole("list", { name: "ページ一覧" });

    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "進行中のタスク" })).toBeNull();
    expect(screen.queryByRole("list", { name: "タスク一覧" })).toBeNull();
  });

  it("空状態の文言はホームでも一覧でも1件しかヒットしない", async () => {
    mockHanamask();
    window.hanamask.listNotes = vi.fn(async () => []);
    window.hanamask.listTasks = vi.fn(async () => []);

    render(<App />);
    await screen.findByRole("heading", { name: "最近のページ" });

    expect(screen.getAllByText("ページはまだありません")).toHaveLength(1);
    expect(screen.getAllByText("タスクはまだありません")).toHaveLength(1);

    await clickButton("ノート");

    expect(screen.getAllByText("ページはまだありません")).toHaveLength(1);
    expect(screen.queryByText("タスクはまだありません")).toBeNull();

    await clickButton("タスク");

    expect(screen.getAllByText("タスクはまだありません")).toHaveLength(1);
    expect(screen.queryByText("ページはまだありません")).toBeNull();
  });

  it("ノート一覧から詳細を開いて戻ると、ホームではなくノート一覧に戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");
    // ナビにも同じページが並ぶため、どちらの経路かが分かるよう一覧側に絞る。
    const list = await screen.findByRole("list", { name: "ページ一覧" });
    await act(async () => {
      within(list).getByRole("button", { name: note.title }).click();
    });
    await screen.findByText("MCPサーバーの設計についてのメモ本文");

    await clickButton("戻る");

    expect(await screen.findByRole("list", { name: "ページ一覧" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
  });
});

describe("App のノート（Explorerナビ）", () => {
  const NOTEBOOK_ROW = "ローカルLLM組み込み（ページ1件）";
  const SUB_PANE = "ローカルLLM組み込み のページ";

  const mockWithNotebook = (): void => {
    mockHanamask();
    window.hanamask.listNotes = vi.fn(async () => [note, pageInNotebook]);
    window.hanamask.listNotebooks = vi.fn(async () => [notebook]);
    window.hanamask.getNotebook = vi.fn(async () => ({ notebook, notes: [pageInNotebook] }));
    window.hanamask.getNote = vi.fn(async () => pageInNotebook);
  };

  it("ツリーはホームでもタスクでも左列に出したままにする", async () => {
    mockWithNotebook();

    render(<App />);
    await screen.findByRole("heading", { name: "最近のページ" });
    const nav = await screen.findByRole("list", { name: "ノート・ページ" });
    expect(within(nav).getByRole("button", { name: NOTEBOOK_ROW })).toBeTruthy();

    await clickButton("タスク");

    expect(screen.getByRole("list", { name: "ノート・ページ" })).toBeTruthy();
  });

  it("ホームからツリーのノートを選ぶとノートのMain Viewへ遷移する", async () => {
    mockWithNotebook();

    render(<App />);
    await screen.findByRole("heading", { name: "最近のページ" });

    await clickButton(NOTEBOOK_ROW);

    expect(await screen.findByRole("heading", { name: notebook.title })).toBeTruthy();
  });

  it("ナビのノートを選ぶとサブペインとノートのMain Viewを出し、ページ一覧は出さない", async () => {
    mockWithNotebook();

    render(<App />);
    await clickButton("ノート");
    await clickButton(NOTEBOOK_ROW);

    expect(await screen.findByRole("heading", { name: notebook.title })).toBeTruthy();
    expect(screen.getByRole("list", { name: SUB_PANE })).toBeTruthy();
    expect(window.hanamask.getNotebook).toHaveBeenCalledWith(notebook.id);
    // 案1: ページ一覧はナビ側だけが持つ。Main View に重ねて出さない。
    expect(screen.queryByRole("list", { name: "ページ一覧" })).toBeNull();
  });

  it("サブペインのページを選ぶとページ詳細を開く", async () => {
    mockWithNotebook();

    render(<App />);
    await clickButton("ノート");
    await clickButton(NOTEBOOK_ROW);
    const pane = await screen.findByRole("list", { name: SUB_PANE });
    const page = within(pane).getByRole("button", { name: pageInNotebook.title });
    await act(async () => {
      page.click();
    });

    expect(await screen.findByText(pageInNotebook.body)).toBeTruthy();
    expect(window.hanamask.getNote).toHaveBeenCalledWith(pageInNotebook.id);
  });

  it("ノートのMain Viewから戻るとページ一覧に戻り、ナビは残る", async () => {
    mockWithNotebook();

    render(<App />);
    await clickButton("ノート");
    await clickButton(NOTEBOOK_ROW);
    await screen.findByRole("heading", { name: notebook.title });

    await clickButton("戻る");

    expect(await screen.findByRole("list", { name: "ページ一覧" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "ノート・ページ" })).toBeTruthy();
  });

  it("notebookの遷移指示でノートのMain Viewを開き、現在地は「ノート」になる", async () => {
    mockWithNotebook();

    render(<App />);
    await screen.findByRole("heading", { name: "最近のページ" });
    await emitNavigate({ kind: "notebook", id: notebook.id });

    expect(await screen.findByRole("heading", { name: notebook.title })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ノート" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("list", { name: SUB_PANE })).toBeTruthy();
  });
});

describe("App のゴミ箱画面", () => {
  it("ゴミ箱ボタンで削除済みノート一覧に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ゴミ箱");

    expect(await screen.findByText("消したメモ")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
    expect(screen.getByRole("button", { name: "ゴミ箱" }).getAttribute("aria-current")).toBe("page");

    await clickButton("戻る");

    expect(await findMainButton("設計メモ")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のページ" })).toBeTruthy();
  });
});

describe("App のMCP経由の画面遷移", () => {
  it("noteの遷移指示でノート詳細画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await findMainButton("設計メモ");
    await emitNavigate({ kind: "note", id: "note-1" });

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(window.hanamask.getNote).toHaveBeenCalledWith("note-1");
  });

  it("taskの遷移指示でタスク詳細画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await findMainButton("設計メモ");
    await emitNavigate({ kind: "task", id: "task-1" });

    expect(await screen.findByRole("combobox", { name: "ステータス" })).toBeTruthy();
    expect(window.hanamask.getTask).toHaveBeenCalledWith("task-1");
  });

  it("searchの遷移指示で検索結果画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await findMainButton("設計メモ");
    await emitNavigate({ kind: "search", query: "設計" });

    expect(await screen.findByRole("heading", { name: "「設計」の検索結果" })).toBeTruthy();
    expect(window.hanamask.searchNotes).toHaveBeenCalledWith("設計");
    expect(screen.queryByRole("heading", { name: "最近のページ" })).toBeNull();
  });

  it("検索結果画面からノートを選ぶとノート詳細を開く", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "search", query: "設計" });
    await clickMainButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
  });

  it("listの遷移指示でホーム画面に戻る", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "note", id: "note-1" });
    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    await emitNavigate({ kind: "list" });

    expect(await screen.findByRole("heading", { name: "最近のページ" })).toBeTruthy();
  });

  it("アンマウント時に遷移指示の購読を解除する", async () => {
    mockHanamask();

    const { unmount } = render(<App />);
    await findMainButton("設計メモ");
    unmount();

    expect(unsubscribeNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("App のノート切替時の復元レース", () => {
  const otherNote: Note = {
    id: "note-3",
    title: "別のメモ",
    body: "別ノートの本文",
    tags: [],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };

  const restoredNote: Note = {
    ...note,
    title: "復元後のメモ",
    body: "復元後の本文",
  };

  const noteVersion: NoteVersion = {
    id: "version-1",
    noteId: "note-1",
    entityType: "note",
    title: "旧タイトル",
    body: "旧本文",
    tags: ["design"],
    createdAt: "2026-08-03T09:00:00.000Z",
  };

  it("復元の応答待ち中に別ノートへ遷移すると、応答が解決しても表示中のノートを上書きしない", async () => {
    mockHanamask();
    const notesById: Record<string, Note> = { "note-1": note, "note-3": otherNote };
    window.hanamask.getNote = vi.fn(async (id: string) => notesById[id] ?? null);
    window.hanamask.listNoteVersions = vi.fn(async (noteId: string) =>
      noteId === "note-1" ? [noteVersion] : [],
    );
    let resolveRestore: (restored: Note) => void = () => {};
    window.hanamask.restoreNoteVersion = vi.fn(
      async () =>
        new Promise<Note>((resolve) => {
          resolveRestore = resolve;
        }),
    );
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<App />);
    await clickMainButton("設計メモ");
    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    await clickButton("このバージョンに戻す");

    await emitNavigate({ kind: "note", id: "note-3" });
    expect(await screen.findByText("別ノートの本文")).toBeTruthy();

    await act(async () => {
      resolveRestore(restoredNote);
    });

    expect(screen.getByText("別ノートの本文")).toBeTruthy();
    expect(screen.queryByText("復元後の本文")).toBeNull();
    expect(screen.queryByRole("heading", { name: "復元後のメモ" })).toBeNull();
  });
});
