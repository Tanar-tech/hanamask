import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> };
  loadFile: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
}

const openDb = vi.fn();
const quit = vi.fn();
const appOn = vi.fn();
const requestSingleInstanceLock = vi.fn(() => true);
const startMcpServer = vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) }));
const openWindows: FakeWindow[] = [];

// Declared as a function expression because the module under test calls it with `new`.
const BrowserWindowMock = vi.fn(function createFakeWindow(): FakeWindow {
  const window: FakeWindow = {
    webContents: { send: vi.fn() },
    loadFile: vi.fn(() => Promise.resolve()),
    loadURL: vi.fn(() => Promise.resolve()),
    show: vi.fn(),
    focus: vi.fn(),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
  };
  openWindows.push(window);
  return window;
});

vi.mock("electron", () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: appOn,
    quit,
    requestSingleInstanceLock,
    getPath: vi.fn(() => "/tmp/hanamask-userdata"),
  },
  BrowserWindow: Object.assign(BrowserWindowMock, { getAllWindows: () => openWindows }),
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

const loadMain = async (): Promise<void> => {
  vi.resetModules();
  await import("../../src/main/index");
};

const findAppListener = (eventName: string): ((...args: unknown[]) => void) => {
  const registration = appOn.mock.calls.find((call) => call[0] === eventName);
  if (registration === undefined) {
    throw new Error(`${eventName} listener was not registered`);
  }
  return registration[1];
};

/*
 * 2つ目のプロセスが同じuserDataを開くと、マイグレーションやDB書き込みが競合する。
 * Electronの単一インスタンスロックで後発を終わらせ、既存ウィンドウを前に出す。
 */
describe("二重起動の抑止", () => {
  beforeEach(() => {
    openDb.mockClear();
    quit.mockClear();
    appOn.mockClear();
    BrowserWindowMock.mockClear();
    openWindows.length = 0;
  });

  it("ロックを取れなかったらDBを開かずに終了する", async () => {
    requestSingleInstanceLock.mockReturnValue(false);

    await loadMain();
    await Promise.resolve();

    expect(quit).toHaveBeenCalled();
    expect(openDb).not.toHaveBeenCalled();
    expect(BrowserWindowMock).not.toHaveBeenCalled();
  });

  it("ロックを取れたら通常どおり起動する", async () => {
    requestSingleInstanceLock.mockReturnValue(true);

    await loadMain();
    await vi.waitFor(() => {
      expect(openDb).toHaveBeenCalled();
    });

    expect(quit).not.toHaveBeenCalled();
  });

  it("2つ目の起動を検知したら既存のウィンドウを前面に出す", async () => {
    requestSingleInstanceLock.mockReturnValue(true);
    await loadMain();
    await vi.waitFor(() => {
      expect(openWindows).toHaveLength(1);
    });

    findAppListener("second-instance")();

    expect(openWindows[0]?.focus).toHaveBeenCalled();
  });
});
