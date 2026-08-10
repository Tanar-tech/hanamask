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
const showErrorBox = vi.fn();
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
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showErrorBox },
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
 * DBが壊れていて開けないとき、これまでは例外が投げ直されるだけで、利用者の画面には
 * 何も出なかった。「起動しない」ことしか分からず、退避があることにも辿り着けない。
 */
describe("起動に失敗したときの案内", () => {
  beforeEach(() => {
    openDb.mockClear();
    openDb.mockReset();
    quit.mockClear();
    appOn.mockClear();
    showErrorBox.mockClear();
    BrowserWindowMock.mockClear();
    openWindows.length = 0;
  });

  it("DBを開けないとき、理由と退避先を画面に出す", async () => {
    openDb.mockImplementation(() => {
      throw new Error("file is not a database");
    });

    await loadMain();
    // whenReady() の解決後に start が走るので、マイクロタスクを流す。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showErrorBox).toHaveBeenCalledTimes(1);
    const [title, message] = showErrorBox.mock.calls[0] ?? [];
    expect(String(title)).toContain("hanamask");
    // 何が起きたか・どこを見ればよいかが伝わること。
    expect(String(message)).toContain("file is not a database");
    expect(String(message)).toContain("backups");
  });

  it("正常に起動したときは何も出さない", async () => {
    openDb.mockImplementation(() => undefined);

    await loadMain();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showErrorBox).not.toHaveBeenCalled();
  });
});
