/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { KanbanView } from "../../src/renderer/components/KanbanView";
import type { AppSettings, Image, Task } from "../../src/shared/preload-api";

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
  body: "",
  tags: [],
  status: "todo",
  dueDate: null,
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
  const updateTaskStatus = vi.fn(async () => {});
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks,
    getTask: vi.fn(async () => null),
    onTasksChanged,
    updateTaskStatus,
    updateTask: vi.fn(async () => null),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    onNavigate: vi.fn(() => () => {}),
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
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  return { listTasks, onTasksChanged, updateTaskStatus, listeners, unsubscribe };
};

const column = (label: string): HTMLElement => screen.getByRole("region", { name: label });

const dropOnColumn = (label: string, taskId: string): void => {
  fireEvent.drop(column(label), { dataTransfer: { getData: () => taskId } });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("KanbanView", () => {
  it("タスクをステータスごとの3列に振り分けて表示する", async () => {
    mockHanamask([
      [
        makeTask(),
        makeTask({ id: "task-2", title: "テストを書く", status: "in_progress" }),
        makeTask({ id: "task-3", title: "リリースする", status: "done" }),
      ],
    ]);

    render(<KanbanView />);

    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(within(column("未着手")).getByText("MCPサーバーを実装する")).toBeTruthy();
    expect(within(column("進行中")).getByText("テストを書く")).toBeTruthy();
    expect(within(column("完了")).getByText("リリースする")).toBeTruthy();
    expect(within(column("未着手")).queryByText("テストを書く")).toBeNull();
  });

  it("タスクが0件でも3つの列を表示する", async () => {
    mockHanamask([[]]);

    render(<KanbanView />);

    expect(await screen.findByRole("region", { name: "未着手" })).toBeTruthy();
    expect(column("進行中")).toBeTruthy();
    expect(column("完了")).toBeTruthy();
  });

  it("ドラッグ開始時にタスクIDをdataTransferに載せる", async () => {
    mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    const card = await screen.findByText("MCPサーバーを実装する");
    const setData = vi.fn();

    fireEvent.dragStart(card, { dataTransfer: { setData } });

    expect(setData).toHaveBeenCalledWith("text/plain", "task-1");
  });

  it("ドラッグ中は移動先の列にドロップ先が文字で示される", async () => {
    mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    const card = await screen.findByText("MCPサーバーを実装する");

    await act(async () => {
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
    });

    expect(within(column("進行中")).getByText("ここにドロップして「進行中」にする")).toBeTruthy();
    expect(within(column("完了")).getByText("ここにドロップして「完了」にする")).toBeTruthy();
    expect(within(column("未着手")).queryByText("ここにドロップして「未着手」にする")).toBeNull();
  });

  it("ドラッグを終えるとドロップ先の案内は消える", async () => {
    mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    const card = await screen.findByText("MCPサーバーを実装する");

    await act(async () => {
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
    });
    await act(async () => {
      fireEvent.dragEnd(card);
    });

    expect(screen.queryByText("ここにドロップして「完了」にする")).toBeNull();
  });

  it("別の列にドロップするとそのステータスへ更新する", async () => {
    const { updateTaskStatus } = mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    await act(async () => {
      dropOnColumn("進行中", "task-1");
    });

    expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "in_progress");
  });

  it("同じ列にドロップしたときは更新しない", async () => {
    const { updateTaskStatus } = mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    await act(async () => {
      dropOnColumn("未着手", "task-1");
    });

    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it("知らないタスクIDがドロップされても更新しない", async () => {
    const { updateTaskStatus } = mockHanamask([[makeTask()]]);

    render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    await act(async () => {
      dropOnColumn("完了", "unknown-task");
    });

    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it("ステータス更新に失敗したときエラーを表示する", async () => {
    mockHanamask([[makeTask()]]);
    window.hanamask.updateTaskStatus = vi.fn(() => Promise.reject(new Error("IPC失敗")));

    render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    await act(async () => {
      dropOnColumn("完了", "task-1");
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("onTasksChangedのコールバックでタスク一覧を再取得して更新する", async () => {
    const { listTasks, listeners } = mockHanamask([
      [makeTask()],
      [makeTask({ status: "done" })],
    ]);

    render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(listTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(within(column("完了")).getByText("MCPサーバーを実装する")).toBeTruthy();
  });

  it("読み込みに失敗したときエラーを表示する", async () => {
    mockHanamask([[]]);
    window.hanamask.listTasks = vi.fn(() => Promise.reject(new Error("IPC失敗")));

    render(<KanbanView />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeTask()]]);

    const { unmount } = render(<KanbanView />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
