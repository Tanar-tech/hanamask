/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "../../src/renderer/App";
import type { Image, NavigateTarget, Note, NoteVersion, Task } from "../../src/shared/preload-api";

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

const deletedNote: Note = {
  id: "note-2",
  title: "消したメモ",
  body: "削除済みノートの本文",
  tags: [],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const task: Task = {
  id: "task-1",
  title: "MCPサーバーを実装する",
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
    listNotes: vi.fn(async () => [note]),
    searchNotes: vi.fn(async () => [note]),
    getNote: vi.fn(async () => note),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => [deletedNote]),
    restoreNote: vi.fn(async () => deletedNote),
    listTasks: vi.fn(async () => [task]),
    getTask: vi.fn(async () => task),
    updateTaskStatus: vi.fn(async () => {}),
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App のナビゲーション", () => {
  it("初期表示ではホーム画面を表示する", async () => {
    mockHanamask();

    render(<App />);

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCPサーバーを実装する" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のノート" })).toBeTruthy();
  });

  it("ノートタイトルをクリックすると詳細画面に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();

    await clickButton("戻る");

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のノート" })).toBeTruthy();
  });

  it("タスクタイトルをクリックするとタスク詳細画面に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("MCPサーバーを実装する");

    expect(await screen.findByRole("combobox", { name: "ステータス" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "設計メモ" })).toBeNull();

    await clickButton("戻る");

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "ステータス" })).toBeNull();
  });

  it("詳細画面では選択したノートのIDで取得する", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("設計メモ");

    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    expect(window.hanamask.getNote).toHaveBeenCalledWith("note-1");
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

  it("「ノート」でノート一覧を開き、ホームは表示しない", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");

    expect(await screen.findByRole("list", { name: "ノート一覧" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
  });

  it("「タスク」でタスク一覧とカンバンを開く", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("タスク");

    expect(await screen.findByRole("list", { name: "タスク一覧" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "進行中" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
  });

  // Home と NoteList/TaskList は空状態の文言が同一なので、同時に描画されると E2E の
  // getByText が多重ヒットして落ちる。排他描画がその唯一の防波堤なのでテストで固定する。
  it("ホーム表示中はノート一覧・タスク一覧を描画しない", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("heading", { name: "最近のノート" });

    expect(screen.queryByRole("list", { name: "ノート一覧" })).toBeNull();
    expect(screen.queryByRole("list", { name: "タスク一覧" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "進行中" })).toBeNull();
  });

  it("「ノート」へ移動するとホームとタスク一覧を描画しない", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");
    await screen.findByRole("list", { name: "ノート一覧" });

    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "進行中のタスク" })).toBeNull();
    expect(screen.queryByRole("list", { name: "タスク一覧" })).toBeNull();
  });

  it("空状態の文言はホームでも一覧でも1件しかヒットしない", async () => {
    mockHanamask();
    window.hanamask.listNotes = vi.fn(async () => []);
    window.hanamask.listTasks = vi.fn(async () => []);

    render(<App />);
    await screen.findByRole("heading", { name: "最近のノート" });

    expect(screen.getAllByText("ノートはまだありません")).toHaveLength(1);
    expect(screen.getAllByText("タスクはまだありません")).toHaveLength(1);

    await clickButton("ノート");

    expect(screen.getAllByText("ノートはまだありません")).toHaveLength(1);
    expect(screen.queryByText("タスクはまだありません")).toBeNull();

    await clickButton("タスク");

    expect(screen.getAllByText("タスクはまだありません")).toHaveLength(1);
    expect(screen.queryByText("ノートはまだありません")).toBeNull();
  });

  it("ノート一覧から詳細を開いて戻ると、ホームではなくノート一覧に戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ノート");
    await clickButton("設計メモ");
    await screen.findByText("MCPサーバーの設計についてのメモ本文");

    await clickButton("戻る");

    expect(await screen.findByRole("list", { name: "ノート一覧" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
  });
});

describe("App のゴミ箱画面", () => {
  it("ゴミ箱ボタンで削除済みノート一覧に遷移し、戻るでホームに戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ゴミ箱");

    expect(await screen.findByText("消したメモ")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
    expect(screen.getByRole("button", { name: "ゴミ箱" }).getAttribute("aria-current")).toBe("page");

    await clickButton("戻る");

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最近のノート" })).toBeTruthy();
  });
});

describe("App のMCP経由の画面遷移", () => {
  it("noteの遷移指示でノート詳細画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("button", { name: "設計メモ" });
    await emitNavigate({ kind: "note", id: "note-1" });

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(window.hanamask.getNote).toHaveBeenCalledWith("note-1");
  });

  it("taskの遷移指示でタスク詳細画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("button", { name: "設計メモ" });
    await emitNavigate({ kind: "task", id: "task-1" });

    expect(await screen.findByRole("combobox", { name: "ステータス" })).toBeTruthy();
    expect(window.hanamask.getTask).toHaveBeenCalledWith("task-1");
  });

  it("searchの遷移指示で検索結果画面を開く", async () => {
    mockHanamask();

    render(<App />);
    await screen.findByRole("button", { name: "設計メモ" });
    await emitNavigate({ kind: "search", query: "設計" });

    expect(await screen.findByRole("heading", { name: "「設計」の検索結果" })).toBeTruthy();
    expect(window.hanamask.searchNotes).toHaveBeenCalledWith("設計");
    expect(screen.queryByRole("heading", { name: "最近のノート" })).toBeNull();
  });

  it("検索結果画面からノートを選ぶとノート詳細を開く", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "search", query: "設計" });
    await clickButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
  });

  it("listの遷移指示でホーム画面に戻る", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "note", id: "note-1" });
    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    await emitNavigate({ kind: "list" });

    expect(await screen.findByRole("heading", { name: "最近のノート" })).toBeTruthy();
  });

  it("アンマウント時に遷移指示の購読を解除する", async () => {
    mockHanamask();

    const { unmount } = render(<App />);
    await screen.findByRole("button", { name: "設計メモ" });
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
    await clickButton("設計メモ");
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
