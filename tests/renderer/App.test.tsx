/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { App } from "../../src/renderer/App";
import type { Image, Note, Task } from "../../src/shared/preload-api";

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

const task: Task = {
  id: "task-1",
  title: "MCPサーバーを実装する",
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const mockHanamask = () => {
  window.hanamask = {
    listNotes: vi.fn(async () => [note]),
    getNote: vi.fn(async () => note),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => [task]),
    getTask: vi.fn(async () => task),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
  };
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
