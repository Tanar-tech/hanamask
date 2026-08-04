/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TaskList } from "../../src/renderer/components/TaskList";
import type { Image, Task } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
  mimeType: "image/png",
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "MCPサーバーを実装する",
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (tasksByCall: Task[][]) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const listTasks = vi.fn(
    async () =>
      tasksByCall[Math.min(listTasks.mock.calls.length - 1, tasksByCall.length - 1)] ?? [],
  );
  const onTasksChanged = vi.fn((callback: () => void) => {
    listeners.push(callback);
    return unsubscribe;
  });
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks,
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged,
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
  };
  return { listTasks, onTasksChanged, listeners, unsubscribe };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TaskList", () => {
  it("初期表示でタスクのタイトル・ステータス・期限をレンダリングする", async () => {
    mockHanamask([
      [
        makeTask(),
        makeTask({ id: "task-2", title: "テストを書く", status: "done", dueDate: null }),
      ],
    ]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(screen.getByText("テストを書く")).toBeTruthy();
    expect(screen.getByText("未着手")).toBeTruthy();
    expect(screen.getByText("完了")).toBeTruthy();
    expect(screen.getByText("2026-08-10")).toBeTruthy();
  });

  it("onTasksChangedのコールバックでタスク一覧を再取得して更新する", async () => {
    const { listTasks, listeners } = mockHanamask([
      [makeTask()],
      [makeTask(), makeTask({ id: "task-2", title: "追加されたタスク" })],
    ]);

    render(<TaskList onSelectTask={vi.fn()} />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(listTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたタスク")).toBeTruthy();
  });

  it("タスクが0件のとき空状態メッセージを表示する", async () => {
    mockHanamask([[]]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("タスクはまだありません")).toBeTruthy();
  });

  it("読み込みに失敗したときエラーを表示する", async () => {
    mockHanamask([[]]);
    window.hanamask.listTasks = vi.fn(() => Promise.reject(new Error("IPC失敗")));

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeTask()]]);

    const { unmount } = render(<TaskList onSelectTask={vi.fn()} />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
