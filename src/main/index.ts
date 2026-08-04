import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db/db.js";
import { purgeSoftDeletedRecords } from "./db/purge.js";
import {
  getNote,
  listDeletedNotes,
  listNoteVersions,
  restoreNote,
  restoreNoteVersion,
  searchNotes,
  softDeleteNote,
  updateNote,
  type NoteUpdateInput,
} from "./db/notes-repo.js";
import { getTask, listTasks, updateTask } from "./db/tasks-repo.js";
import { listImages } from "./db/images-repo.js";
import { createLink, deleteLink, listLinks, type LinkInput } from "./db/links-repo.js";
import { attachImage, setImagesDirPath } from "./images/attach-image.js";
import type {
  EntityType,
  Image,
  Link,
  NavigateTarget,
  Note,
  NoteVersion,
  Task,
  TaskStatus,
} from "../shared/preload-api.js";
import { setUiNavigator } from "./ui/navigate.js";
import {
  emitNotesChanged,
  emitTasksChanged,
  onLinksChanged,
  onNotesChanged,
  onTasksChanged,
} from "./mcp/change-emitter.js";
import { startMcpServer } from "./mcp/server.js";

const DB_FILE_NAME = "hanamask.sqlite3";
const WINDOW_WIDTH_PX = 1200;
const WINDOW_HEIGHT_PX = 800;
const NOTES_CHANGED_CHANNEL = "notes:changed";
const NOTES_LIST_CHANNEL = "notes:list";
const NOTES_SEARCH_CHANNEL = "notes:search";
const TASKS_CHANGED_CHANNEL = "tasks:changed";
const TASKS_LIST_CHANNEL = "tasks:list";
const NOTES_DELETE_CHANNEL = "notes:delete";
const NOTES_GET_CHANNEL = "notes:get";
const NOTES_UPDATE_CHANNEL = "notes:update";
const NOTES_LIST_VERSIONS_CHANNEL = "notes:list-versions";
const NOTES_RESTORE_VERSION_CHANNEL = "notes:restore-version";
const NOTES_LIST_DELETED_CHANNEL = "notes:list-deleted";
const NOTES_RESTORE_CHANNEL = "notes:restore";
const TASKS_GET_CHANNEL = "tasks:get";
const TASKS_UPDATE_STATUS_CHANNEL = "tasks:update-status";
const IMAGES_ATTACH_CHANNEL = "images:attach";
const IMAGES_LIST_CHANNEL = "images:list";
const LINKS_LIST_CHANNEL = "links:list";
const LINKS_CREATE_CHANNEL = "links:create";
const LINKS_DELETE_CHANNEL = "links:delete";
const LINKS_CHANGED_CHANNEL = "links:changed";
const IMAGES_DIR_NAME = "images";
const UI_NAVIGATE_CHANNEL = "ui:navigate";
const RENDERER_READY_EVENT = "did-finish-load";

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

export const broadcastTasksChanged = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(TASKS_CHANGED_CHANNEL);
  });
};

export const broadcastLinksChanged = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(LINKS_CHANGED_CHANNEL);
  });
};

const listNotes = (): Note[] => searchNotes("");

const findNotes = (_event: IpcMainInvokeEvent, query: string): Note[] => searchNotes(query);

const findNote = (_event: IpcMainInvokeEvent, id: string): Note | null => getNote(id);

const findTask = (_event: IpcMainInvokeEvent, id: string): Task | null => getTask(id);

// MCPツール経由の削除と同じ通知経路を通すため、broadcastではなくemitNotesChangedを呼ぶ。
const deleteNote = (_event: IpcMainInvokeEvent, id: string): void => {
  if (softDeleteNote(id)) emitNotesChanged();
};

// MCPツール経由の更新と同じ通知経路を通すため、broadcastではなくemitNotesChangedを呼ぶ。
const editNote = (
  _event: IpcMainInvokeEvent,
  id: string,
  input: NoteUpdateInput,
): Note | null => {
  const updated = updateNote(id, input);
  if (updated !== null) emitNotesChanged();
  return updated;
};

const findNoteVersions = (_event: IpcMainInvokeEvent, noteId: string): NoteVersion[] =>
  listNoteVersions(noteId);

// 復元は本文の更新なので、MCPツール経由の更新と同じ通知経路（emitNotesChanged）を通す。
const restoreVersion = (_event: IpcMainInvokeEvent, versionId: string): Note | null => {
  const restored = restoreNoteVersion(versionId);
  if (restored !== null) emitNotesChanged();
  return restored;
};

// MCPツール経由の復元と同じ通知経路を通すため、broadcastではなくemitNotesChangedを呼ぶ。
const undeleteNote = (_event: IpcMainInvokeEvent, id: string): Note | null => {
  const restored = restoreNote(id);
  if (restored !== null) emitNotesChanged();
  return restored;
};

// MCPツール経由の更新と同じ通知経路を通すため、broadcastではなくemitTasksChangedを呼ぶ。
const updateTaskStatus = (_event: IpcMainInvokeEvent, id: string, status: TaskStatus): void => {
  if (updateTask(id, { status }) !== null) emitTasksChanged();
};

const attachImageToNote = (
  _event: IpcMainInvokeEvent,
  noteId: string,
  fileName: string,
  dataBase64: string,
  mimeType: string,
): Image => attachImage({ noteId, fileName, dataBase64, mimeType });

const findImages = (_event: IpcMainInvokeEvent, noteId: string): Image[] => listImages(noteId);

// UI操作由来の作成・削除は呼び出し元（レンダラー）が自分で取り直すため、ここでは通知しない。
// links:changed はMCPツール経由の操作だけが出す。
const findLinks = (
  _event: IpcMainInvokeEvent,
  entityType: EntityType,
  entityId: string,
): Link[] => listLinks(entityType, entityId);

const addLink = (_event: IpcMainInvokeEvent, input: LinkInput): Link => createLink(input);

const removeLink = (_event: IpcMainInvokeEvent, id: string): boolean => deleteLink(id);

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

// MCPツール（open_app等）から呼ばれるため、ウィンドウが閉じられている場合は作り直す。
const showMainWindow = (): BrowserWindow => {
  const [existing] = BrowserWindow.getAllWindows();
  if (existing === undefined) return createMainWindow();
  if (existing.isMinimized()) existing.restore();
  existing.show();
  existing.focus();
  return existing;
};

// A window that is still loading has no renderer to receive the event yet, so the
// navigation has to wait for the first paint or it is silently dropped.
const sendNavigate = (window: BrowserWindow, target: NavigateTarget): void => {
  if (!window.webContents.isLoading()) {
    window.webContents.send(UI_NAVIGATE_CHANNEL, target);
    return;
  }
  window.webContents.once(RENDERER_READY_EVENT, () => {
    window.webContents.send(UI_NAVIGATE_CHANNEL, target);
  });
};

const navigateMainWindow = (target: NavigateTarget): void => {
  sendNavigate(showMainWindow(), target);
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
  setImagesDirPath(join(app.getPath("userData"), IMAGES_DIR_NAME));
  purgeSoftDeletedRecords(new Date());
  createMainWindow();
  setUiNavigator({
    showWindow: () => {
      showMainWindow();
    },
    navigate: navigateMainWindow,
  });
  onNotesChanged(broadcastNotesChanged);
  onTasksChanged(broadcastTasksChanged);
  onLinksChanged(broadcastLinksChanged);
  const mcpServer = await startMcpServer();
  stopMcpServer = mcpServer.close;
};

ipcMain.handle(NOTES_LIST_CHANNEL, listNotes);
ipcMain.handle(NOTES_SEARCH_CHANNEL, findNotes);
ipcMain.handle(TASKS_LIST_CHANNEL, () => listTasks());
ipcMain.handle(NOTES_GET_CHANNEL, findNote);
ipcMain.handle(TASKS_GET_CHANNEL, findTask);
ipcMain.handle(NOTES_UPDATE_CHANNEL, editNote);
ipcMain.handle(NOTES_LIST_VERSIONS_CHANNEL, findNoteVersions);
ipcMain.handle(NOTES_RESTORE_VERSION_CHANNEL, restoreVersion);
ipcMain.handle(NOTES_DELETE_CHANNEL, deleteNote);
ipcMain.handle(NOTES_LIST_DELETED_CHANNEL, () => listDeletedNotes());
ipcMain.handle(NOTES_RESTORE_CHANNEL, undeleteNote);
ipcMain.handle(TASKS_UPDATE_STATUS_CHANNEL, updateTaskStatus);
ipcMain.handle(IMAGES_ATTACH_CHANNEL, attachImageToNote);
ipcMain.handle(IMAGES_LIST_CHANNEL, findImages);
ipcMain.handle(LINKS_LIST_CHANNEL, findLinks);
ipcMain.handle(LINKS_CREATE_CHANNEL, addLink);
ipcMain.handle(LINKS_DELETE_CHANNEL, removeLink);

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
