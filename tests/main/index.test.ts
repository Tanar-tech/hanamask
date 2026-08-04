import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, Task } from "../../src/shared/preload-api";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
}

const ipcHandle = vi.fn();
const searchNotes = vi.fn();
const openDb = vi.fn();
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const listTasks = vi.fn();
const notesChangedListeners: Array<() => void> = [];
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
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks }));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: (listener: () => void) => {
    notesChangedListeners.push(listener);
    return () => {};
  },
  emitTasksChanged: vi.fn(),
  onTasksChanged: (listener: () => void) => {
    tasksChangedListeners.push(listener);
    return () => {};
  },
}));

const findListNotesHandler = (): (() => Note[]) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === "notes:list");
  if (registration === undefined) {
    throw new Error("notes:list handler was not registered");
  }
  return registration[1];
};

const emitNotesChangedFromMcp = (): void => {
  if (notesChangedListeners.length === 0) {
    throw new Error("no notes-changed listener was registered");
  }
  notesChangedListeners.forEach((listener) => {
    listener();
  });
};

const findListTasksHandler = (): (() => Task[]) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === "tasks:list");
  if (registration === undefined) {
    throw new Error("tasks:list handler was not registered");
  }
  return registration[1];
};

const emitTasksChangedFromMcp = (): void => {
  if (tasksChangedListeners.length === 0) {
    throw new Error("no tasks-changed listener was registered");
  }
  tasksChangedListeners.forEach((listener) => {
    listener();
  });
};

const sampleTask: Task = {
  id: "task-1",
  title: "タスク",
  status: "todo",
  dueDate: null,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

const sampleNote: Note = {
  id: "note-1",
  title: "title",
  body: "body",
  tags: ["a"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("main process entry", () => {
  // The module starts the app as an import side effect, so it is imported once.
  let main: typeof import("../../src/main/index");

  beforeAll(async () => {
    main = await import("../../src/main/index");
    // start() runs after app.whenReady() resolves, i.e. on a later microtask.
    await vi.waitFor(() => {
      expect(openWindows.length).toBe(1);
    });
  });

  beforeEach(() => {
    searchNotes.mockReset();
    listTasks.mockReset();
  });

  it("registers a notes:list IPC handler", () => {
    expect(ipcHandle).toHaveBeenCalledWith("notes:list", expect.any(Function));
  });

  it("returns every note from the notes:list handler", () => {
    searchNotes.mockReturnValue([sampleNote]);

    expect(findListNotesHandler()()).toEqual([sampleNote]);
    expect(searchNotes).toHaveBeenCalledWith("");
  });

  it("opens the database and starts the MCP server on startup", () => {
    expect(openDb).toHaveBeenCalledTimes(1);
    expect(startMcpServer).toHaveBeenCalledTimes(1);
  });

  it("broadcasts notes:changed to every open window", () => {
    main.broadcastNotesChanged();

    openWindows.forEach((window) => {
      expect(window.webContents.send).toHaveBeenCalledWith("notes:changed");
    });
  });

  it("registers a tasks:list IPC handler that returns every task", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:list", expect.any(Function));
    listTasks.mockReturnValue([sampleTask]);

    expect(findListTasksHandler()()).toEqual([sampleTask]);
  });

  it("broadcasts tasks:changed to every open window", () => {
    const window = openWindows[0];
    if (window === undefined) throw new Error("no window was created");
    window.webContents.send.mockClear();

    emitTasksChangedFromMcp();

    expect(window.webContents.send).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledWith("tasks:changed");
  });

  it("forwards an MCP-triggered change notification to the open window", () => {
    const window = openWindows[0];
    if (window === undefined) throw new Error("no window was created");
    window.webContents.send.mockClear();

    emitNotesChangedFromMcp();

    expect(window.webContents.send).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledWith("notes:changed");
  });
});
