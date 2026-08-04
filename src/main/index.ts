import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db/db.js";
import { searchNotes } from "./db/notes-repo.js";
import type { Note } from "../shared/preload-api.js";
import { onNotesChanged } from "./mcp/change-emitter.js";
import { startMcpServer } from "./mcp/server.js";

const DB_FILE_NAME = "hanamask.sqlite3";
const WINDOW_WIDTH_PX = 1200;
const WINDOW_HEIGHT_PX = 800;
const NOTES_CHANGED_CHANNEL = "notes:changed";
const NOTES_LIST_CHANNEL = "notes:list";

const moduleDir = dirname(fileURLToPath(import.meta.url));
// .cjs, not .js: Electron's sandboxed preload loader only executes CommonJS, and
// package.json's "type": "module" would make a plain .js file ambiguous (see
// scripts/copy-main-assets.mjs).
const PRELOAD_PATH = join(moduleDir, "../preload/index.cjs");
const RENDERER_HTML_PATH = join(moduleDir, "../renderer/index.html");

// Vite dev server URL is injected by the dev script; absent in a packaged build.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

export const broadcastNotesChanged = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(NOTES_CHANGED_CHANNEL);
  });
};

const listNotes = (): Note[] => searchNotes("");

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH_PX,
    height: WINDOW_HEIGHT_PX,
    title: "hanamask",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const loaded =
    devServerUrl === undefined
      ? window.loadFile(RENDERER_HTML_PATH)
      : window.loadURL(devServerUrl);
  loaded.catch((error: unknown) => {
    throw new Error(`Failed to load renderer: ${String(error)}`);
  });
  return window;
};

let stopMcpServer: (() => Promise<void>) | undefined;

// E2E tests point this at a temp file to avoid touching the developer's real note database.
const resolveDbFilePath = (): string => {
  const override = process.env.HANAMASK_DB_PATH;
  if (override !== undefined && override !== "") return override;
  return join(app.getPath("userData"), DB_FILE_NAME);
};

const start = async (): Promise<void> => {
  openDb(resolveDbFilePath());
  createMainWindow();
  onNotesChanged(broadcastNotesChanged);
  const mcpServer = await startMcpServer();
  stopMcpServer = mcpServer.close;
};

ipcMain.handle(NOTES_LIST_CHANNEL, listNotes);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  stopMcpServer?.().catch((error: unknown) => {
    throw new Error(`Failed to stop MCP server: ${String(error)}`);
  });
});

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    throw new Error(`Failed to start hanamask: ${String(error)}`);
  });
