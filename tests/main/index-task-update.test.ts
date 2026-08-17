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
  Tray: class {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  },
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
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
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks, updateTask }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: () => () => {},
  emitTasksChanged: vi.fn(),
  onTasksChanged: () => () => {},
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

type TaskUpdatePayload = { title?: string; body?: string };

const findUpdateTaskHandler = (): ((
  event: unknown,
  id: string,
  input: TaskUpdatePayload,
) => Task | null) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === "tasks:update");
  if (registration === undefined) {
    throw new Error("tasks:update handler was not registered");
  }
  return registration[1];
};

const sampleTask: Task = {
  id: "task-1",
  title: "新しいタイトル",
  body: "新しい本文",
  tags: [],
  status: "todo",
  dueDate: null,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
};

describe("main process tasks:update handler", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(openWindows.length).toBe(1);
    });
  });

  beforeEach(() => {
    updateTask.mockReset();
  });

  it("tasks:update IPCハンドラを登録する", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:update", expect.any(Function));
  });

  it("タイトルと本文を更新して結果を返す", () => {
    updateTask.mockReturnValue(sampleTask);

    const updated = findUpdateTaskHandler()(undefined, "task-1", {
      title: "新しいタイトル",
      body: "新しい本文",
    });

    expect(updateTask).toHaveBeenCalledWith("task-1", {
      title: "新しいタイトル",
      body: "新しい本文",
    });
    expect(updated).toEqual(sampleTask);
  });

  it("存在しないタスクの更新ではnullを返す", () => {
    updateTask.mockReturnValue(null);

    expect(findUpdateTaskHandler()(undefined, "missing-task", { title: "x" })).toBeNull();
  });

  it("既存のtasks:update-statusハンドラも残っている", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:update-status", expect.any(Function));
  });
});
