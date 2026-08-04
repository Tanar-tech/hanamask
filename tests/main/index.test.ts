import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { Image, Note, Task } from "../../src/shared/preload-api";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
}

const ipcHandle = vi.fn();
const searchNotes = vi.fn();
const softDeleteNote = vi.fn();
const getNote = vi.fn();
const getTask = vi.fn();
const openDb = vi.fn();
const purgeSoftDeletedRecords = vi.fn(() => ({ notesPurged: 0, tasksPurged: 0 }));
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const listTasks = vi.fn();
const createImage = vi.fn();
const listImages = vi.fn();
const writeFileSync = vi.fn();
const mkdirSync = vi.fn();
const existsSync = vi.fn(() => false);
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
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes, softDeleteNote, getNote }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks, getTask }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords }));
vi.mock("../../src/main/db/images-repo", () => ({ createImage, listImages }));
// Only the three calls the image handler makes are faked; the rest of node:fs stays real
// because other modules loaded in this process still need it.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, default: actual, writeFileSync, mkdirSync, existsSync };
});
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: () => {
    notesChangedListeners.forEach((listener) => {
      listener();
    });
  },
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

const findHandler = (channel: string) => {
  const registration = ipcHandle.mock.calls.find((call) => call[0] === channel);
  if (registration === undefined) {
    throw new Error(`${channel} handler was not registered`);
  }
  return registration[1];
};

const findListNotesHandler = (): (() => Note[]) => findHandler("notes:list");

const findDeleteNoteHandler = (): ((event: unknown, id: string) => void) =>
  findHandler("notes:delete");

const findGetNoteHandler = (): ((event: unknown, id: string) => Note | null) =>
  findHandler("notes:get");

const findGetTaskHandler = (): ((event: unknown, id: string) => Task | null) =>
  findHandler("tasks:get");

const findAttachImageHandler =
  (): ((
    event: unknown,
    noteId: string,
    fileName: string,
    dataBase64: string,
    mimeType: string,
  ) => Image) =>
    findHandler("images:attach");

const findListImagesHandler = (): ((event: unknown, noteId: string) => Image[]) =>
  findHandler("images:list");

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

const sampleImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/tmp/hanamask-userdata/images/image-1.png",
  fileUrl: "file:///tmp/hanamask-userdata/images/image-1.png",
  mimeType: "image/png",
};

const imagesDirPath = join("/tmp/hanamask-userdata", "images");
const pngDataBase64 = Buffer.from("fake-png-bytes").toString("base64");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    softDeleteNote.mockReset();
    getNote.mockReset();
    getTask.mockReset();
    createImage.mockReset();
    listImages.mockReset();
    writeFileSync.mockReset();
    mkdirSync.mockReset();
    existsSync.mockReset();
    existsSync.mockReturnValue(false);
    openWindows.forEach((window) => {
      window.webContents.send.mockClear();
    });
  });

  it("registers a notes:list IPC handler", () => {
    expect(ipcHandle).toHaveBeenCalledWith("notes:list", expect.any(Function));
  });

  it("returns every note from the notes:list handler", () => {
    searchNotes.mockReturnValue([sampleNote]);

    expect(findListNotesHandler()()).toEqual([sampleNote]);
    expect(searchNotes).toHaveBeenCalledWith("");
  });

  it("registers a notes:delete IPC handler", () => {
    expect(ipcHandle).toHaveBeenCalledWith("notes:delete", expect.any(Function));
  });

  it("soft deletes the note and notifies every window from the notes:delete handler", () => {
    softDeleteNote.mockReturnValue(true);

    findDeleteNoteHandler()(undefined, "note-1");

    expect(softDeleteNote).toHaveBeenCalledWith("note-1");
    openWindows.forEach((window) => {
      expect(window.webContents.send).toHaveBeenCalledWith("notes:changed");
    });
  });

  it("does not notify when the note was already deleted", () => {
    softDeleteNote.mockReturnValue(false);

    findDeleteNoteHandler()(undefined, "missing-note");

    openWindows.forEach((window) => {
      expect(window.webContents.send).not.toHaveBeenCalled();
    });
  });

  it("notes:get ハンドラは指定IDのノートを返す", () => {
    expect(ipcHandle).toHaveBeenCalledWith("notes:get", expect.any(Function));
    getNote.mockReturnValue(sampleNote);

    expect(findGetNoteHandler()(undefined, "note-1")).toEqual(sampleNote);
    expect(getNote).toHaveBeenCalledWith("note-1");
  });

  it("notes:get ハンドラは存在しないIDに対してnullを返す", () => {
    getNote.mockReturnValue(null);

    expect(findGetNoteHandler()(undefined, "missing-note")).toBeNull();
  });

  it("tasks:get ハンドラは指定IDのタスクを返す", () => {
    expect(ipcHandle).toHaveBeenCalledWith("tasks:get", expect.any(Function));
    getTask.mockReturnValue(sampleTask);

    expect(findGetTaskHandler()(undefined, "task-1")).toEqual(sampleTask);
    expect(getTask).toHaveBeenCalledWith("task-1");
  });

  it("tasks:get ハンドラは存在しないIDに対してnullを返す", () => {
    getTask.mockReturnValue(null);

    expect(findGetTaskHandler()(undefined, "missing-task")).toBeNull();
  });

  it("opens the database and starts the MCP server on startup", () => {
    expect(openDb).toHaveBeenCalledTimes(1);
    expect(startMcpServer).toHaveBeenCalledTimes(1);
  });

  it("purges expired soft-deleted records on startup, after opening the database", () => {
    expect(purgeSoftDeletedRecords).toHaveBeenCalledTimes(1);
    expect(purgeSoftDeletedRecords).toHaveBeenCalledWith(expect.any(Date));
    expect(openDb.mock.invocationCallOrder[0] ?? Number.NaN).toBeLessThan(
      purgeSoftDeletedRecords.mock.invocationCallOrder[0] ?? Number.NaN,
    );
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

  it("images:list ハンドラは指定ノートの画像を返す", () => {
    expect(ipcHandle).toHaveBeenCalledWith("images:list", expect.any(Function));
    listImages.mockReturnValue([sampleImage]);

    expect(findListImagesHandler()(undefined, "note-1")).toEqual([sampleImage]);
    expect(listImages).toHaveBeenCalledWith("note-1");
  });

  it("images:attach ハンドラはファイルを保存しDBレコードを返す", () => {
    expect(ipcHandle).toHaveBeenCalledWith("images:attach", expect.any(Function));
    createImage.mockReturnValue(sampleImage);

    const attached = findAttachImageHandler()(
      undefined,
      "note-1",
      "shot.png",
      pngDataBase64,
      "image/png",
    );

    expect(attached).toEqual(sampleImage);
    expect(mkdirSync).toHaveBeenCalledWith(imagesDirPath, { recursive: true });
    const [writtenPath, writtenData] = writeFileSync.mock.calls[0] ?? [];
    expect(String(writtenPath).startsWith(`${imagesDirPath}/`)).toBe(true);
    expect(String(writtenPath).endsWith(".png")).toBe(true);
    expect(writtenData).toEqual(Buffer.from(pngDataBase64, "base64"));
    expect(createImage).toHaveBeenCalledWith({
      noteId: "note-1",
      filePath: writtenPath,
      mimeType: "image/png",
    });
  });

  it("images:attach ハンドラは画像ディレクトリが既にあれば作り直さない", () => {
    existsSync.mockReturnValue(true);
    createImage.mockReturnValue(sampleImage);

    findAttachImageHandler()(undefined, "note-1", "shot.png", pngDataBase64, "image/png");

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it("images:attach ハンドラは対応形式すべてを受け付ける", () => {
    createImage.mockReturnValue(sampleImage);

    ["image/png", "image/jpeg", "image/gif", "image/webp"].forEach((mimeType) => {
      expect(() =>
        findAttachImageHandler()(undefined, "note-1", "shot", pngDataBase64, mimeType),
      ).not.toThrow();
    });
  });

  it("images:attach ハンドラは非対応のMIMEタイプを拒否する", () => {
    expect(() =>
      findAttachImageHandler()(undefined, "note-1", "doc.pdf", pngDataBase64, "application/pdf"),
    ).toThrow(/application\/pdf/);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(createImage).not.toHaveBeenCalled();
  });

  it("images:attach ハンドラは10MBを超える画像を拒否する", () => {
    const oversizedBase64 = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64");

    expect(() =>
      findAttachImageHandler()(undefined, "note-1", "big.png", oversizedBase64, "image/png"),
    ).toThrow();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(createImage).not.toHaveBeenCalled();
  });

  it("images:attach ハンドラはちょうど10MBの画像を受け付ける", () => {
    createImage.mockReturnValue(sampleImage);
    const maxSizeBase64 = Buffer.alloc(MAX_IMAGE_BYTES).toString("base64");

    expect(() =>
      findAttachImageHandler()(undefined, "note-1", "max.png", maxSizeBase64, "image/png"),
    ).not.toThrow();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
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
