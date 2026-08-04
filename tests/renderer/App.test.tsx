/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "../../src/renderer/App";
import type { Image, NavigateTarget, Note, Task } from "../../src/shared/preload-api";

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
  vi.restoreAllMocks();
});

describe("App のナビゲーション", () => {
  it("初期表示ではノート一覧・タスク一覧・カンバンを表示する", async () => {
    mockHanamask();

    render(<App />);

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCPサーバーを実装する" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "進行中" })).toBeTruthy();
  });

  it("ノートタイトルをクリックすると詳細画面に遷移し、戻るで一覧に戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "進行中" })).toBeNull();

    await clickButton("戻る");

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "進行中" })).toBeTruthy();
  });

  it("タスクタイトルをクリックするとタスク詳細画面に遷移し、戻るで一覧に戻る", async () => {
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

describe("App のゴミ箱画面", () => {
  it("ゴミ箱ボタンで削除済みノート一覧に遷移し、戻るで一覧に戻る", async () => {
    mockHanamask();

    render(<App />);
    await clickButton("ゴミ箱");

    expect(await screen.findByText("消したメモ")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "進行中" })).toBeNull();

    await clickButton("戻る");

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "進行中" })).toBeTruthy();
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
    expect(screen.queryByRole("heading", { name: "進行中" })).toBeNull();
  });

  it("検索結果画面からノートを選ぶとノート詳細を開く", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "search", query: "設計" });
    await clickButton("設計メモ");

    expect(await screen.findByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
  });

  it("listの遷移指示で一覧画面に戻る", async () => {
    mockHanamask();

    render(<App />);
    await emitNavigate({ kind: "note", id: "note-1" });
    await screen.findByText("MCPサーバーの設計についてのメモ本文");
    await emitNavigate({ kind: "list" });

    expect(await screen.findByRole("heading", { name: "進行中" })).toBeTruthy();
  });

  it("アンマウント時に遷移指示の購読を解除する", async () => {
    mockHanamask();

    const { unmount } = render(<App />);
    await screen.findByRole("button", { name: "設計メモ" });
    unmount();

    expect(unsubscribeNavigate).toHaveBeenCalledTimes(1);
  });
});
