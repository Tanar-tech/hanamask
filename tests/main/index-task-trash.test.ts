import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeletedTask, Task } from "../../src/shared/preload-api";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
}

const ipcHandle = vi.fn();
const openDb = vi.fn();
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const listTasks = vi.fn();
const listDeletedTasks = vi.fn();
const softDeleteTask = vi.fn();
const restoreTask = vi.fn();
const openWindows: FakeWindow[] = [];
const tasksChangedListeners: Array<() => void> = [];

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
    requestSingleInstanceLock: () => true,
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(BrowserWindowMock, {
    getAllWindows: () => openWindows,
  }),
  ipcMain: { handle: ipcHandle },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn(), softDeleteNote: vi.fn() }));
vi.mock("../../src/main/db/tasks-repo", () => ({
  listTasks,
  listDeletedTasks,
  softDeleteTask,
  restoreTask,
}));
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
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

const findHandler = (channel: string) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === channel);
  if (registration === undefined) {
    throw new Error(`${channel} handler was not registered`);
  }
  return registration[1];
};

const findDeleteTaskHandler = (): ((event: unknown, id: string) => void) =>
  findHandler("tasks:delete");

const findListDeletedTasksHandler = (): (() => DeletedTask[]) => findHandler("tasks:list-deleted");

const findRestoreTaskHandler = (): ((event: unknown, id: string) => Task | null) =>
  findHandler("tasks:restore");

const sampleTask: Task = {
  id: "task-1",
  title: "タスク",
  body: "",
  tags: [],
  status: "todo",
  dueDate: null,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const sampleDeletedTask: DeletedTask = {
  ...sampleTask,
  deletedAt: "2026-08-05T00:00:00.000Z",
};

describe("main process タスクのゴミ箱ハンドラ", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(openWindows.length).toBe(1);
    });
  });

  beforeEach(() => {
    listDeletedTasks.mockReset();
    softDeleteTask.mockReset();
    restoreTask.mockReset();
    openWindows.forEach((window) => {
      window.webContents.send.mockClear();
    });
  });

  it("tasks:delete ハンドラはソフトデリートして全ウィンドウへ通知する", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:delete", expect.any(Function));
    softDeleteTask.mockReturnValue(true);

    findDeleteTaskHandler()(undefined, "task-1");

    expect(softDeleteTask).toHaveBeenCalledWith("task-1");
    openWindows.forEach((window) => {
      expect(window.webContents.send).toHaveBeenCalledWith("tasks:changed");
    });
  });

  it("tasks:delete ハンドラは削除できなかったときは通知しない", () => {
    softDeleteTask.mockReturnValue(false);

    findDeleteTaskHandler()(undefined, "missing-task");

    openWindows.forEach((window) => {
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });

  it("tasks:list-deleted ハンドラは削除済みタスクを返し通知しない", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:list-deleted", expect.any(Function));
    listDeletedTasks.mockReturnValue([sampleDeletedTask]);

    expect(findListDeletedTasksHandler()()).toEqual([sampleDeletedTask]);
    openWindows.forEach((window) => {
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });

  it("tasks:restore ハンドラはタスクを復元し全ウィンドウへ通知する", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:restore", expect.any(Function));
    restoreTask.mockReturnValue(sampleTask);

    expect(findRestoreTaskHandler()(undefined, "task-1")).toEqual(sampleTask);
    expect(restoreTask).toHaveBeenCalledWith("task-1");
    openWindows.forEach((window) => {
      expect(window.webContents.send).toHaveBeenCalledWith("tasks:changed");
    });
  });

  it("tasks:restore ハンドラは復元できないタスクではnullを返し通知しない", () => {
    restoreTask.mockReturnValue(null);

    expect(findRestoreTaskHandler()(undefined, "missing-task")).toBeNull();
    openWindows.forEach((window) => {
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });
});
