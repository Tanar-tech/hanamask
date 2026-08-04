import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../src/shared/preload-api";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
}

const ipcHandle = vi.fn();
const openDb = vi.fn();
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const listTasks = vi.fn();
const updateTask = vi.fn();
const tasksChangedListeners: Array<() => void> = [];
const openWindows: FakeWindow[] = [];

// Declared as a function expression because the module under test calls it with `new`.
const BrowserWindowMock = vi.fn(function createFakeWindow(): FakeWindow {
  const window: FakeWindow = {
    webContents: { send: vi.fn() },
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
  };
  openWindows.push(window);
  return window;
});

vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(BrowserWindowMock, {
    getAllWindows: () => openWindows,
  }),
  ipcMain: { handle: ipcHandle },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn(), softDeleteNote: vi.fn() }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks, updateTask }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: () => () => {},
  emitTasksChanged: () => {
    tasksChangedListeners.forEach((listener) => {
      listener();
    });
  },
  onTasksChanged: (listener: () => void) => {
    tasksChangedListeners.push(listener);
    return () => {};
  },
}));

const findUpdateTaskStatusHandler = (): ((event: unknown, id: string, status: string) => void) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === "tasks:update-status");
  if (registration === undefined) {
    throw new Error("tasks:update-status handler was not registered");
  }
  return registration[1];
};

const sampleTask: Task = {
  id: "task-1",
  title: "タスク",
  status: "in_progress",
  dueDate: null,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("main process tasks:update-status handler", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(openWindows.length).toBe(1);
    });
  });

  beforeEach(() => {
    updateTask.mockReset();
    openWindows.forEach((window) => {
      window.webContents.send.mockClear();
    });
  });

  it("tasks:update-status IPCハンドラを登録する", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:update-status", expect.any(Function));
  });

  it("ステータスを更新して全ウィンドウにtasks:changedを通知する", () => {
    updateTask.mockReturnValue(sampleTask);

    findUpdateTaskStatusHandler()(undefined, "task-1", "in_progress");

    expect(updateTask).toHaveBeenCalledWith("task-1", { status: "in_progress" });
    openWindows.forEach((window) => {
      expect(window.webContents.send).toHaveBeenCalledWith("tasks:changed");
    });
  });

  it("存在しないタスクの更新では通知しない", () => {
    updateTask.mockReturnValue(null);

    findUpdateTaskStatusHandler()(undefined, "missing-task", "done");

    openWindows.forEach((window) => {
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });
});
