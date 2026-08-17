import { afterEach, describe, expect, it, vi } from "vitest";

const openDb = vi.fn();
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));

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
  // Declared as a function expression because the module under test calls it with `new`.
  BrowserWindow: Object.assign(
    vi.fn(function createFakeWindow() {
      return {
        webContents: { send: vi.fn() },
        loadFile: vi.fn(() => Promise.resolve()),
        loadURL: vi.fn(() => Promise.resolve()),
      };
    }),
    { getAllWindows: () => [] },
  ),
  ipcMain: { handle: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}));

vi.mock("../../src/main/db/db", () => ({ openDb, closeDb: vi.fn() }));
vi.mock("../../src/main/db/notes-repo", () => ({ searchNotes: vi.fn() }));
vi.mock("../../src/main/db/tasks-repo", () => ({ listTasks: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({
  purgeSoftDeletedRecords: vi.fn(() => ({ notesPurged: 0, tasksPurged: 0 })),
}));
vi.mock("../../src/main/mcp/server", () => ({ startMcpServer }));
vi.mock("../../src/main/mcp/change-emitter", () => ({
  emitNotesChanged: vi.fn(),
  onNotesChanged: vi.fn(() => () => {}),
  emitTasksChanged: vi.fn(),
  onTasksChanged: vi.fn(() => () => {}),
  emitLinksChanged: vi.fn(),
  onLinksChanged: vi.fn(() => () => {}),
}));

describe("main process HANAMASK_DB_PATH override", () => {
  afterEach(() => {
    delete process.env.HANAMASK_DB_PATH;
  });

  it("opens the database at the overridden path when HANAMASK_DB_PATH is set", async () => {
    process.env.HANAMASK_DB_PATH = "/tmp/hanamask-e2e-test.sqlite3";

    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(openDb).toHaveBeenCalled();
    });

    expect(openDb).toHaveBeenCalledWith("/tmp/hanamask-e2e-test.sqlite3");
  });
});
