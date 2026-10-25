import { beforeAll, describe, expect, it, vi } from "vitest";

const loadEmbeddingProvider = vi.fn(async () => ({ state: "unavailable", reason: "テスト" }));
const ipcHandle = vi.fn();
const fakeUpdater = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: false,
  logger: null,
  on: vi.fn(),
  checkForUpdates: vi.fn(async () => null),
  quitAndInstall: vi.fn(),
}));

delete process.env.HANAMASK_DB_PATH;
Object.defineProperty(process, "resourcesPath", { value: "/opt/hanamask/resources", configurable: true });

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
    isPackaged: true,
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  // Declared as a function expression because the module under test calls it with `new`.
  BrowserWindow: Object.assign(
    vi.fn(function createFakeWindow() {
      return {
        webContents: { send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() },
        loadFile: vi.fn(() => Promise.resolve()),
        loadURL: vi.fn(() => Promise.resolve()),
      };
    }),
    { getAllWindows: () => [] },
  ),
  ipcMain: { handle: ipcHandle },
}));

// 配布ビルドとして起動するので自動更新も動き出す。本物の更新器はElectronの実体を要するため差し替える。
vi.mock("electron-updater", () => ({
  autoUpdater: { on: vi.fn(), checkForUpdates: vi.fn(async () => null), quitAndInstall: vi.fn() },
}));
vi.mock("electron-updater", () => ({ autoUpdater: fakeUpdater }));
vi.mock("../../src/main/db/db", () => ({ openDb: vi.fn(), closeDb: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({
  startMcpServer: vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) })),
}));
vi.mock("../../src/main/llm/llama-embedding-provider", () => ({ loadEmbeddingProvider }));

describe("配布ビルドの自動更新", () => {
  beforeAll(async () => {
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(loadEmbeddingProvider).toHaveBeenCalled();
    });
  });

  it("更新器を有効にして、確認・適用のIPCを用意する", () => {
    expect(fakeUpdater.autoDownload).toBe(true);
    expect(fakeUpdater.autoInstallOnAppQuit).toBe(true);
    const channels = ipcHandle.mock.calls.map(([channel]: unknown[]) => channel);
    expect(channels).toEqual(
      expect.arrayContaining(["update:read-status", "update:check", "update:install"]),
    );
  });
});
