import { beforeAll, describe, expect, it, vi } from "vitest";
import { join } from "node:path";

const loadEmbeddingProvider = vi.fn(async () => ({ state: "unavailable", reason: "テスト" }));

const OVERRIDE_DIR = "/tmp/hanamask-models-override";
const RESOURCES_PATH = "/opt/hanamask/resources";

process.env.HANAMASK_MODELS_DIR = OVERRIDE_DIR;
// Electron が実行時に足すプロパティなので、テストでは同じ名前で用意する。
Object.defineProperty(process, "resourcesPath", { value: RESOURCES_PATH, configurable: true });

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
        webContents: { send: vi.fn() },
        loadFile: vi.fn(() => Promise.resolve()),
        loadURL: vi.fn(() => Promise.resolve()),
      };
    }),
    { getAllWindows: () => [] },
  ),
  ipcMain: { handle: vi.fn() },
}));

vi.mock("../../src/main/db/db", () => ({ openDb: vi.fn(), closeDb: vi.fn() }));
vi.mock("../../src/main/db/purge", () => ({ purgeSoftDeletedRecords: vi.fn() }));
vi.mock("../../src/main/mcp/server", () => ({
  startMcpServer: vi.fn(async () => ({ port: 39217, close: vi.fn(async () => {}) })),
}));
vi.mock("../../src/main/llm/llama-embedding-provider", () => ({ loadEmbeddingProvider }));

/*
 * 配布ビルドではモデルの置き場を外から差し替えられないことを固定する。開発・E2E は
 * パッケージされていない実行なので、環境変数での上書きは今までどおり効く。
 */
describe("配布ビルドのモデル置き場", () => {
  beforeAll(async () => {
    // The module starts the app as an import side effect.
    await import("../../src/main/index");
    await vi.waitFor(() => {
      expect(loadEmbeddingProvider).toHaveBeenCalled();
    });
  });

  it("HANAMASK_MODELS_DIR を無視して同梱物の中を読む", () => {
    expect(loadEmbeddingProvider).toHaveBeenCalledWith(join(RESOURCES_PATH, "models"));
    expect(loadEmbeddingProvider).not.toHaveBeenCalledWith(OVERRIDE_DIR);
  });
});
