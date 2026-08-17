import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  session,
  type IpcMainInvokeEvent,
  type Tray,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
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
import {
  getTask,
  listDeletedTasks,
  listTasks,
  restoreTask,
  softDeleteTask,
  updateTask,
  type TaskUpdateInput,
} from "./db/tasks-repo.js";
import { listImages } from "./db/images-repo.js";
import { createLink, deleteLink, listLinks, type LinkInput } from "./db/links-repo.js";
import { attachImage, setImagesDirPath } from "./images/attach-image.js";
import { abortChat, sendChatMessage } from "./chat/session.js";
import { CHAT_ENABLED } from "../shared/preload-api.js";
import type { ChatMessage } from "../shared/preload-api.js";
import { readAppSettings, saveAppSettings, setAppSettingsPath } from "./settings/app-settings.js";
import {
  createTray,
  decideOnWindowClose,
  shouldAnnounceTray,
  TRAY_ANNOUNCEMENT,
} from "./tray.js";
import {
  clearApiKey,
  readChatSettings,
  saveApiKey,
  saveChatModel,
  setChatSettingsPath,
} from "./settings/chat-settings.js";
import type {
  AppSettings,
  BackupExportResult,
  BackupImportResult,
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
import { createBackupArchive } from "./backup/export-backup.js";
import {
  applyBackupArchive,
  removeImportLeftovers,
  type ImportPaths,
} from "./backup/import-backup.js";
import {
  emitNotesChanged,
  emitTasksChanged,
  onLinksChanged,
  onNotesChanged,
  onTasksChanged,
  type EntityChange,
} from "./mcp/change-emitter.js";
import { createChangeNotifier, type ChangeNotification } from "./notify/change-notifier.js";
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
const TASKS_UPDATE_CHANNEL = "tasks:update";
const TASKS_DELETE_CHANNEL = "tasks:delete";
const TASKS_LIST_DELETED_CHANNEL = "tasks:list-deleted";
const TASKS_RESTORE_CHANNEL = "tasks:restore";
const IMAGES_ATTACH_CHANNEL = "images:attach";
const CHAT_SETTINGS_READ_CHANNEL = "chat:read-settings";
const CHAT_SEND_CHANNEL = "chat:send";
const CHAT_ABORT_CHANNEL = "chat:abort";
const CHAT_EVENT_CHANNEL = "chat:event";
const CHAT_SETTINGS_SAVE_KEY_CHANNEL = "chat:save-api-key";
const CHAT_SETTINGS_CLEAR_KEY_CHANNEL = "chat:clear-api-key";
const CHAT_SETTINGS_SAVE_MODEL_CHANNEL = "chat:save-model";
const IMAGES_LIST_CHANNEL = "images:list";
const LINKS_LIST_CHANNEL = "links:list";
const LINKS_CREATE_CHANNEL = "links:create";
const LINKS_DELETE_CHANNEL = "links:delete";
const LINKS_CHANGED_CHANNEL = "links:changed";
const IMAGES_DIR_NAME = "images";
const BACKUPS_DIR_NAME = "backups";
const BACKUP_EXPORT_CHANNEL = "backup:export";
const BACKUP_IMPORT_CHANNEL = "backup:import";
const BACKUP_FILE_EXTENSION = "zip";
const BACKUP_FILE_FILTER = { name: "hanamask バックアップ", extensions: [BACKUP_FILE_EXTENSION] };
const BACKUP_EXPORT_DIALOG_TITLE = "ノートを書き出す";
const BACKUP_IMPORT_DIALOG_TITLE = "ノートを取り込む";
const CHAT_SETTINGS_FILE_NAME = "chat-settings.json";
const APP_SETTINGS_FILE_NAME = "app-settings.json";
const APP_SETTINGS_READ_CHANNEL = "app:read-settings";
const APP_SETTINGS_SAVE_CHANNEL = "app:save-settings";
const OPEN_AT_LOGIN_ARG = "--hanamask-autostart";
const UI_NAVIGATE_CHANNEL = "ui:navigate";
const RENDERER_READY_EVENT = "did-finish-load";

const moduleDir = dirname(fileURLToPath(import.meta.url));
// electron-builder の files は dist/** しか含めないため、ビルド時に dist へ複製したものを使う（scripts/copy-main-assets.mjs）。
const TRAY_ICON_PATH = join(moduleDir, "tray-icon.png");
// .cjs, not .js: Electron's sandboxed preload loader only executes CommonJS, and
// package.json's "type": "module" would make a plain .js file ambiguous (see
// scripts/copy-main-assets.mjs).
const PRELOAD_PATH = join(moduleDir, "../preload/index.cjs");
const RENDERER_HTML_PATH = join(moduleDir, "../renderer/index.html");

// Vite dev server URL is injected by the dev script; absent in a packaged build.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const CSP_HEADER_NAME = "Content-Security-Policy";

interface CspDirectives {
  "default-src": string;
  "script-src": string;
  "style-src": string;
  "img-src": string;
  "font-src": string;
  "connect-src": string;
  "base-uri": string;
  "form-action": string;
  "frame-ancestors": string;
  "object-src": string;
}

// style-src の 'unsafe-inline': mermaid は図ごとに内容の変わる <style> と style 属性を
// 生成SVGに埋め込むため、これが無いと図がスタイルを失い黒い矩形になる（内容が可変なので
// hash指定では代替できない）。スクリプト実行は 'self' のみで 'unsafe-eval' も無く、
// どのディレクティブでも外部オリジンを許可していないため、緩和の影響は見た目に限られる。
// img-src に裸の file: は入れない。本番は文書自体が file:// なので添付画像は 'self' で届き、
// 許可するとノート本文に紛れた <img src="file:///..."> で任意のローカルファイルを読ませうる。
// 開発時のみ文書オリジンが dev server になり 'self' で届かないため、そちらで足す。
const PRODUCTION_DIRECTIVES: CspDirectives = {
  "default-src": "'none'",
  "script-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data:",
  "font-src": "'self' data:",
  "connect-src": "'self'",
  "base-uri": "'none'",
  "form-action": "'none'",
  "frame-ancestors": "'none'",
  "object-src": "'none'",
};

// Vite の dev server は Fast Refresh のpreambleをインラインscriptとして差し込み、HMRを
// WebSocketで繋ぐ。本番（file://読み込み）には不要な緩和なので dev server 使用時だけ足す。
const withDevServerSources = (devServerUrl: string): CspDirectives => {
  const { origin } = new URL(devServerUrl);
  const socketOrigin = origin.replace(/^http/, "ws");
  return {
    ...PRODUCTION_DIRECTIVES,
    // 開発時は文書オリジンが dev server になるため、添付画像の file:// URL が 'self' から外れる。
    "img-src": `${PRODUCTION_DIRECTIVES["img-src"]} file:`,
    "script-src": `${PRODUCTION_DIRECTIVES["script-src"]} 'unsafe-inline' ${origin}`,
    "style-src": `${PRODUCTION_DIRECTIVES["style-src"]} ${origin}`,
    "connect-src": `${PRODUCTION_DIRECTIVES["connect-src"]} ${origin} ${socketOrigin}`,
  };
};

export const buildContentSecurityPolicy = (devServerUrl: string | undefined): string => {
  const directives =
    devServerUrl === undefined ? PRODUCTION_DIRECTIVES : withDevServerSources(devServerUrl);
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources}`)
    .join("; ");
};

// レンダラーは file:// で読み込むためHTML側のmetaタグでも設定できるが、それだと開発時と
// 本番で同じindex.htmlが配られ、dev server用の緩和を本番にも持ち込んでしまう。
const applyContentSecurityPolicy = (): void => {
  const policy = buildContentSecurityPolicy(devServerUrl);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, [CSP_HEADER_NAME]: [policy] },
    });
  });
};

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

// MCPツール経由の更新と同じ通知経路を通すため、broadcastではなくemitTasksChangedを呼ぶ。
const editTask = (
  _event: IpcMainInvokeEvent,
  id: string,
  input: TaskUpdateInput,
): Task | null => {
  const updated = updateTask(id, input);
  if (updated !== null) emitTasksChanged();
  return updated;
};

// MCPツール経由の削除と同じ通知経路を通すため、broadcastではなくemitTasksChangedを呼ぶ。
const deleteTask = (_event: IpcMainInvokeEvent, id: string): void => {
  if (softDeleteTask(id)) emitTasksChanged();
};

// MCPツール経由の復元と同じ通知経路を通すため、broadcastではなくemitTasksChangedを呼ぶ。
const undeleteTask = (_event: IpcMainInvokeEvent, id: string): Task | null => {
  const restored = restoreTask(id);
  if (restored !== null) emitTasksChanged();
  return restored;
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

const isMainWindowFocused = (): boolean =>
  BrowserWindow.getAllWindows().some((window) => window.isFocused());

const showOsNotification = ({ title, body, onClick }: ChangeNotification): void => {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  notification.on("click", onClick);
  notification.show();
};

const changeNotifier = createChangeNotifier({
  isWindowFocused: isMainWindowFocused,
  showNotification: showOsNotification,
  showWindow: () => {
    showMainWindow();
  },
  navigate: navigateMainWindow,
});

// 画面の更新は変更の中身に関わらず必要だが、OS通知は何が変わったか分かるときだけ出す。
const handleNotesChanged = (change?: EntityChange): void => {
  broadcastNotesChanged();
  if (change !== undefined) changeNotifier.recordChange(change);
};

const handleTasksChanged = (change?: EntityChange): void => {
  broadcastTasksChanged();
  if (change !== undefined) changeNotifier.recordChange(change);
};

// Trayは参照を保持しないとGCされてアイコンが消える。
let tray: Tray | null = null;
let stopMcpServer: (() => Promise<void>) | undefined;

// E2E tests point this at a temp file to avoid touching the developer's real note database.
const dbPathOverride = (): string | undefined => {
  const override = process.env.HANAMASK_DB_PATH;
  return override === undefined || override === "" ? undefined : override;
};

const resolveDbFilePath = (): string =>
  dbPathOverride() ?? join(app.getPath("userData"), DB_FILE_NAME);

/*
 * HANAMASK_DB_PATH を指定した起動（E2E）は、画像・バックアップ・設定も
 * そのDBの隣に置く。DBだけを別にしても、画像は利用者の userData を指したままで、
 * E2Eが実データのディレクトリへ書き込む。取り込みは画像ディレクトリを丸ごと
 * 差し替えるため、そのままE2Eを書くと利用者の画像を消すことになる。
 */
const resolveDataDirPath = (): string => {
  const override = dbPathOverride();
  return override === undefined ? app.getPath("userData") : dirname(override);
};

const resolveImagesDirPath = (): string => join(resolveDataDirPath(), IMAGES_DIR_NAME);

const resolveBackupPaths = (): ImportPaths => ({
  dbFilePath: resolveDbFilePath(),
  imagesDirPath: resolveImagesDirPath(),
  backupsDirPath: join(resolveDataDirPath(), BACKUPS_DIR_NAME),
});

const defaultBackupFileName = (): string =>
  `hanamask-${new Date().toISOString().slice(0, 10)}.${BACKUP_FILE_EXTENSION}`;

const exportBackupToFile = async (): Promise<BackupExportResult> => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: BACKUP_EXPORT_DIALOG_TITLE,
    defaultPath: defaultBackupFileName(),
    filters: [BACKUP_FILE_FILTER],
  });
  if (canceled || filePath === undefined || filePath === "") return { status: "cancelled" };
  const { archive, counts } = createBackupArchive(resolveBackupPaths());
  writeFileSync(filePath, archive);
  return { status: "saved", filePath, counts };
};

// 取り込みはDBを丸ごと置き換えるため、開いている画面が古いデータを指したままにならないよう
// MCPツール経由の変更と同じ通知経路で全画面に取り直させる。
const importBackupFromFile = async (): Promise<BackupImportResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: BACKUP_IMPORT_DIALOG_TITLE,
    properties: ["openFile"],
    filters: [BACKUP_FILE_FILTER],
  });
  const [pickedPath] = filePaths;
  if (canceled || pickedPath === undefined) return { status: "cancelled" };
  const { counts, safetyCopyPath } = applyBackupArchive(
    readFileSync(pickedPath),
    resolveBackupPaths(),
  );
  emitNotesChanged();
  emitTasksChanged();
  broadcastLinksChanged();
  return { status: "imported", counts, safetyCopyPath };
};

const start = async (): Promise<void> => {
  openDb(resolveDbFilePath());
  removeImportLeftovers(resolveImagesDirPath());
  setImagesDirPath(resolveImagesDirPath());
  setChatSettingsPath(join(resolveDataDirPath(), CHAT_SETTINGS_FILE_NAME));
  setAppSettingsPath(join(resolveDataDirPath(), APP_SETTINGS_FILE_NAME));
  purgeSoftDeletedRecords(new Date());
  applyContentSecurityPolicy();
  tray = createTray({
    iconPath: TRAY_ICON_PATH,
    onOpen: () => {
      showMainWindow();
    },
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  // ログインのたびに窓が出てくると邪魔なので、自動起動で立ち上がったときは通知領域だけに入る。
  if (!process.argv.includes(OPEN_AT_LOGIN_ARG)) createMainWindow();
  setUiNavigator({
    showWindow: () => {
      showMainWindow();
    },
    navigate: navigateMainWindow,
  });
  onNotesChanged(handleNotesChanged);
  onTasksChanged(handleTasksChanged);
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
ipcMain.handle(TASKS_UPDATE_CHANNEL, editTask);
ipcMain.handle(TASKS_DELETE_CHANNEL, deleteTask);
ipcMain.handle(TASKS_LIST_DELETED_CHANNEL, () => listDeletedTasks());
ipcMain.handle(TASKS_RESTORE_CHANNEL, undeleteTask);
ipcMain.handle(IMAGES_ATTACH_CHANNEL, attachImageToNote);
/*
 * チャットのIPCは CHAT_ENABLED が false の間まったく登録しない。画面から消すだけでは
 * 「使えない」ことにならず、レンダラーへの経路が残っていると呼び出せてしまう。
 * 実装（src/main/chat/）はそのまま残してあるので、フラグを戻せば復活する。
 */
const registerChatHandlers = (): void => {
  ipcMain.handle(CHAT_SETTINGS_READ_CHANNEL, () => readChatSettings());
  ipcMain.handle(
    CHAT_SEND_CHANNEL,
    (event: IpcMainInvokeEvent, history: ChatMessage[], userText: string) =>
      // 経過はイベントで逐次送る。完了まで何も出ないと、動いているのか分からない。
      sendChatMessage({
        history,
        userText,
        onEvent: (chatEvent) => {
          event.sender.send(CHAT_EVENT_CHANNEL, chatEvent);
        },
      }),
  );
  ipcMain.handle(CHAT_ABORT_CHANNEL, () => {
    abortChat();
  });
  ipcMain.handle(CHAT_SETTINGS_SAVE_KEY_CHANNEL, (_event: IpcMainInvokeEvent, apiKey: string) => {
    saveApiKey(apiKey);
    return readChatSettings();
  });
  ipcMain.handle(CHAT_SETTINGS_CLEAR_KEY_CHANNEL, () => {
    clearApiKey();
    return readChatSettings();
  });
  ipcMain.handle(CHAT_SETTINGS_SAVE_MODEL_CHANNEL, (_event: IpcMainInvokeEvent, model: string) => {
    saveChatModel(model);
    return readChatSettings();
  });
};

if (CHAT_ENABLED) registerChatHandlers();
ipcMain.handle(IMAGES_LIST_CHANNEL, findImages);
ipcMain.handle(LINKS_LIST_CHANNEL, findLinks);
ipcMain.handle(LINKS_CREATE_CHANNEL, addLink);
ipcMain.handle(LINKS_DELETE_CHANNEL, removeLink);
ipcMain.handle(BACKUP_EXPORT_CHANNEL, exportBackupToFile);
ipcMain.handle(BACKUP_IMPORT_CHANNEL, importBackupFromFile);
/*
 * レンダラーから来る値は信用せず、booleanだけを受け付ける。ログイン項目の書き換えは
 * OSに副作用が残るため、保存が通ったときだけ反映する。
 */
const isAppSettings = (value: unknown): value is AppSettings =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>).closeToTray === "boolean" &&
  typeof (value as Record<string, unknown>).openAtLogin === "boolean";

const applyOpenAtLogin = (openAtLogin: boolean): void => {
  app.setLoginItemSettings({ openAtLogin, args: [OPEN_AT_LOGIN_ARG] });
};

const applyAppSettings = (value: unknown): AppSettings => {
  if (!isAppSettings(value)) {
    throw new Error("設定の形式が正しくありません");
  }
  const saved = saveAppSettings(value);
  applyOpenAtLogin(saved.openAtLogin);
  return saved;
};

ipcMain.handle(APP_SETTINGS_READ_CHANNEL, () => readAppSettings());
ipcMain.handle(APP_SETTINGS_SAVE_CHANNEL, (_event, settings: unknown) => applyAppSettings(settings));

/*
 * ウィンドウを閉じてもMCPサーバーを生かしておく。閉じた瞬間にプロセスごと終われば、
 * エージェントから見てhanamaskは存在しなくなる（それが常駐を入れた理由）。
 */
let isQuitting = false;
let trayAnnounced = false;

app.on("window-all-closed", () => {
  const { closeToTray } = readAppSettings();
  if (decideOnWindowClose({ closeToTray, isQuitting }) === "quit") {
    app.quit();
    return;
  }
  if (shouldAnnounceTray({ closeToTray, alreadyAnnounced: trayAnnounced })) {
    trayAnnounced = true;
    showOsNotification({ ...TRAY_ANNOUNCEMENT, onClick: () => { showMainWindow(); } });
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  tray?.destroy();
  tray = null;
  stopMcpServer?.().catch((error: unknown) => {
    throw new Error(`Failed to stop MCP server: ${String(error)}`);
  });
});

/*
 * 起動に失敗したとき、これまでは例外を投げ直すだけだった。利用者の画面には何も出ず、
 * 「起動しない」ことしか分からない。DBが壊れている場合、取り込み前の退避が
 * backups に残っていることも伝わらないので、そこまで案内する。
 */
const reportStartupFailure = (error: unknown): void => {
  const dataDir = resolveDataDirPath();
  dialog.showErrorBox(
    "hanamask を起動できませんでした",
    [
      String(error),
      "",
      `データの場所: ${dataDir}`,
      `取り込み前の退避: ${join(dataDir, BACKUPS_DIR_NAME)}`,
      "",
      "データが壊れている場合は、退避したzipを設定画面から取り込むと戻せます。",
      "退避が無い場合は、上のフォルダを丸ごと控えてから再インストールしてください。",
    ].join("\n"),
  );
};

const launch = (): void => {
  app.on("second-instance", () => {
    showMainWindow();
  });
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      reportStartupFailure(error);
      app.quit();
    });
};

/*
 * 同じDBを2プロセスが開くと、起動時のマイグレーションが互いの適用と競合し、後発の起動が
 * 失敗する。ロックを取れなかった側は起動せず、先に動いているウィンドウを前に出すだけにする。
 * HANAMASK_DB_PATH 指定時（E2E）は各起動が自分のDBを見ており、worktreeごとに同時起動する
 * ため対象外にする。
 */
const usesSharedUserData = dbPathOverride() === undefined;

if (usesSharedUserData && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  launch();
}
