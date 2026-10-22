import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ChatEntriesChange,
  ChatEvent,
  ChatMessage,
  ChatPresence,
  EmbeddingStatus,
  HanamaskPreloadApi,
  NavigateTarget,
} from "../shared/preload-api.js";

const NOTES_CHANGED_CHANNEL = "notes:changed";
const NOTES_LIST_CHANNEL = "notes:list";
const NOTES_SEARCH_CHANNEL = "notes:search";
const UI_NAVIGATE_CHANNEL = "ui:navigate";
const NOTES_DELETE_CHANNEL = "notes:delete";
const NOTES_GET_CHANNEL = "notes:get";
const NOTES_UPDATE_CHANNEL = "notes:update";
const NOTES_LIST_VERSIONS_CHANNEL = "notes:list-versions";
const NOTES_RESTORE_VERSION_CHANNEL = "notes:restore-version";
const NOTES_LIST_DELETED_CHANNEL = "notes:list-deleted";
const NOTEBOOKS_LIST_CHANNEL = "notebooks:list";
const NOTEBOOKS_GET_CHANNEL = "notebooks:get";
const NOTEBOOKS_UPDATE_CHANNEL = "notebooks:update";
const NOTEBOOKS_LIST_DELETED_CHANNEL = "notebooks:list-deleted";
const NOTEBOOKS_RESTORE_CHANNEL = "notebooks:restore";
const NOTEBOOKS_CHANGED_CHANNEL = "notebooks:changed";
const ACTIVITY_READ_CHANNEL = "activity:read";
const MCP_ENDPOINT_READ_CHANNEL = "mcp:read-endpoint";
const APP_SETTINGS_READ_CHANNEL = "app:read-settings";
const APP_SETTINGS_SAVE_CHANNEL = "app:save-settings";
const CHAT_SETTINGS_READ_CHANNEL = "chat:read-settings";
const CHAT_SEND_CHANNEL = "chat:send";
const CHAT_ABORT_CHANNEL = "chat:abort";
const CHAT_EVENT_CHANNEL = "chat:event";
const CHAT_SETTINGS_SAVE_KEY_CHANNEL = "chat:save-api-key";
const CHAT_SETTINGS_CLEAR_KEY_CHANNEL = "chat:clear-api-key";
const CHAT_SETTINGS_SAVE_MODEL_CHANNEL = "chat:save-model";
const CHAT_LIST_ENTRIES_CHANNEL = "chat:list-entries";
const CHAT_POST_ENTRY_CHANNEL = "chat:post-entry";
const CHAT_PRESENCE_CHANNEL = "chat:presence";
const CHAT_ENTRIES_CHANGED_CHANNEL = "chat:entries-changed";
const CHAT_PRESENCE_CHANGED_CHANNEL = "chat:presence-changed";
const NOTES_RESTORE_CHANNEL = "notes:restore";
const NOTES_SET_PINNED_CHANNEL = "notes:set-pinned";
const NOTEBOOKS_SET_PINNED_CHANNEL = "notebooks:set-pinned";
const TASKS_GET_CHANNEL = "tasks:get";
const TASKS_CHANGED_CHANNEL = "tasks:changed";
const TASKS_LIST_CHANNEL = "tasks:list";
const TASKS_UPDATE_STATUS_CHANNEL = "tasks:update-status";
const TASKS_UPDATE_CHANNEL = "tasks:update";
const TASKS_DELETE_CHANNEL = "tasks:delete";
const TASKS_LIST_DELETED_CHANNEL = "tasks:list-deleted";
const TASKS_RESTORE_CHANNEL = "tasks:restore";
const IMAGES_ATTACH_CHANNEL = "images:attach";
const IMAGES_LIST_CHANNEL = "images:list";
const LINKS_LIST_CHANNEL = "links:list";
const LINKS_CREATE_CHANNEL = "links:create";
const LINKS_DELETE_CHANNEL = "links:delete";
const LINKS_CHANGED_CHANNEL = "links:changed";
const BACKUP_EXPORT_CHANNEL = "backup:export";
const BACKUP_IMPORT_CHANNEL = "backup:import";
const EMBEDDING_SEARCH_CHANNEL = "embedding:search";
const EMBEDDING_RELATED_NOTES_CHANNEL = "embedding:related-notes";
const EMBEDDING_STATUS_READ_CHANNEL = "embedding:read-status";
const EMBEDDING_STATUS_CHANGED_CHANNEL = "embedding:status-changed";

const subscribe = (channel: string, callback: () => void): (() => void) => {
  const listener = (): void => callback();
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const subscribeEmbeddingStatus = (
  callback: (status: EmbeddingStatus) => void,
): (() => void) => {
  const listener = (_event: IpcRendererEvent, status: EmbeddingStatus): void => {
    callback(status);
  };
  ipcRenderer.on(EMBEDDING_STATUS_CHANGED_CHANNEL, listener);
  return () => {
    ipcRenderer.removeListener(EMBEDDING_STATUS_CHANGED_CHANNEL, listener);
  };
};

const subscribeChatEntriesChanged = (
  callback: (change: ChatEntriesChange) => void,
): (() => void) => {
  const listener = (_event: IpcRendererEvent, change: ChatEntriesChange): void => {
    callback(change);
  };
  ipcRenderer.on(CHAT_ENTRIES_CHANGED_CHANNEL, listener);
  return () => {
    ipcRenderer.removeListener(CHAT_ENTRIES_CHANGED_CHANNEL, listener);
  };
};

const subscribeChatPresenceChanged = (
  callback: (presence: ChatPresence) => void,
): (() => void) => {
  const listener = (_event: IpcRendererEvent, presence: ChatPresence): void => {
    callback(presence);
  };
  ipcRenderer.on(CHAT_PRESENCE_CHANGED_CHANNEL, listener);
  return () => {
    ipcRenderer.removeListener(CHAT_PRESENCE_CHANGED_CHANNEL, listener);
  };
};

const subscribeNavigate = (callback: (view: NavigateTarget) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, view: NavigateTarget): void => {
    callback(view);
  };
  ipcRenderer.on(UI_NAVIGATE_CHANNEL, listener);
  return () => {
    ipcRenderer.removeListener(UI_NAVIGATE_CHANNEL, listener);
  };
};

const api: HanamaskPreloadApi = {
  listNotes: () => ipcRenderer.invoke(NOTES_LIST_CHANNEL),
  searchNotes: (query) => ipcRenderer.invoke(NOTES_SEARCH_CHANNEL, query),
  getNote: (id) => ipcRenderer.invoke(NOTES_GET_CHANNEL, id),
  updateNote: (id, input) => ipcRenderer.invoke(NOTES_UPDATE_CHANNEL, id, input),
  setNotePinned: (id, pinned) => ipcRenderer.invoke(NOTES_SET_PINNED_CHANNEL, id, pinned),
  deleteNote: (id) => ipcRenderer.invoke(NOTES_DELETE_CHANNEL, id),
  onNotesChanged: (callback) => subscribe(NOTES_CHANGED_CHANNEL, callback),
  listNoteVersions: (noteId) => ipcRenderer.invoke(NOTES_LIST_VERSIONS_CHANNEL, noteId),
  restoreNoteVersion: (versionId) =>
    ipcRenderer.invoke(NOTES_RESTORE_VERSION_CHANNEL, versionId),
  listDeletedNotes: () => ipcRenderer.invoke(NOTES_LIST_DELETED_CHANNEL),
  listNotebooks: () => ipcRenderer.invoke(NOTEBOOKS_LIST_CHANNEL),
  getNotebook: (id) => ipcRenderer.invoke(NOTEBOOKS_GET_CHANNEL, id),
  updateNotebook: (id, input) => ipcRenderer.invoke(NOTEBOOKS_UPDATE_CHANNEL, id, input),
  listDeletedNotebooks: () => ipcRenderer.invoke(NOTEBOOKS_LIST_DELETED_CHANNEL),
  restoreNotebook: (id) => ipcRenderer.invoke(NOTEBOOKS_RESTORE_CHANNEL, id),
  setNotebookPinned: (id, pinned) =>
    ipcRenderer.invoke(NOTEBOOKS_SET_PINNED_CHANNEL, id, pinned),
  onNotebooksChanged: (callback) => subscribe(NOTEBOOKS_CHANGED_CHANNEL, callback),
  readActivity: () => ipcRenderer.invoke(ACTIVITY_READ_CHANNEL),
  readMcpEndpoint: () => ipcRenderer.invoke(MCP_ENDPOINT_READ_CHANNEL),
  readAppSettings: () => ipcRenderer.invoke(APP_SETTINGS_READ_CHANNEL),
  saveAppSettings: (settings) => ipcRenderer.invoke(APP_SETTINGS_SAVE_CHANNEL, settings),
  readChatSettings: () => ipcRenderer.invoke(CHAT_SETTINGS_READ_CHANNEL),
  sendChatMessage: (history: ChatMessage[], userText: string) =>
    ipcRenderer.invoke(CHAT_SEND_CHANNEL, history, userText),
  abortChat: () => ipcRenderer.invoke(CHAT_ABORT_CHANNEL),
  onChatEvent: (callback: (event: ChatEvent) => void) => {
    const listener = (_event: IpcRendererEvent, chatEvent: ChatEvent): void => {
      callback(chatEvent);
    };
    ipcRenderer.on(CHAT_EVENT_CHANNEL, listener);
    return () => ipcRenderer.removeListener(CHAT_EVENT_CHANNEL, listener);
  },
  saveChatApiKey: (apiKey: string) => ipcRenderer.invoke(CHAT_SETTINGS_SAVE_KEY_CHANNEL, apiKey),
  clearChatApiKey: () => ipcRenderer.invoke(CHAT_SETTINGS_CLEAR_KEY_CHANNEL),
  saveChatModel: (model: string) => ipcRenderer.invoke(CHAT_SETTINGS_SAVE_MODEL_CHANNEL, model),
  listChatEntries: (entityType, entityId) =>
    ipcRenderer.invoke(CHAT_LIST_ENTRIES_CHANNEL, entityType, entityId),
  postChatEntry: (entityType, entityId, body) =>
    ipcRenderer.invoke(CHAT_POST_ENTRY_CHANNEL, entityType, entityId, body),
  getChatPresence: () => ipcRenderer.invoke(CHAT_PRESENCE_CHANNEL),
  onChatEntriesChanged: (callback) => subscribeChatEntriesChanged(callback),
  onChatPresenceChanged: (callback) => subscribeChatPresenceChanged(callback),
  restoreNote: (id) => ipcRenderer.invoke(NOTES_RESTORE_CHANNEL, id),
  listTasks: () => ipcRenderer.invoke(TASKS_LIST_CHANNEL),
  getTask: (id) => ipcRenderer.invoke(TASKS_GET_CHANNEL, id),
  updateTaskStatus: (id, status) => ipcRenderer.invoke(TASKS_UPDATE_STATUS_CHANNEL, id, status),
  updateTask: (id, input) => ipcRenderer.invoke(TASKS_UPDATE_CHANNEL, id, input),
  deleteTask: (id) => ipcRenderer.invoke(TASKS_DELETE_CHANNEL, id),
  listDeletedTasks: () => ipcRenderer.invoke(TASKS_LIST_DELETED_CHANNEL),
  restoreTask: (id) => ipcRenderer.invoke(TASKS_RESTORE_CHANNEL, id),
  onTasksChanged: (callback) => subscribe(TASKS_CHANGED_CHANNEL, callback),
  onNavigate: (callback) => subscribeNavigate(callback),
  attachImage: (noteId, fileName, dataBase64, mimeType) =>
    ipcRenderer.invoke(IMAGES_ATTACH_CHANNEL, noteId, fileName, dataBase64, mimeType),
  listImages: (noteId) => ipcRenderer.invoke(IMAGES_LIST_CHANNEL, noteId),
  listLinks: (entityType, entityId) =>
    ipcRenderer.invoke(LINKS_LIST_CHANNEL, entityType, entityId),
  createLink: (input) => ipcRenderer.invoke(LINKS_CREATE_CHANNEL, input),
  deleteLink: (id) => ipcRenderer.invoke(LINKS_DELETE_CHANNEL, id),
  onLinksChanged: (callback) => subscribe(LINKS_CHANGED_CHANNEL, callback),
  exportBackup: () => ipcRenderer.invoke(BACKUP_EXPORT_CHANNEL),
  importBackup: () => ipcRenderer.invoke(BACKUP_IMPORT_CHANNEL),
  semanticSearch: (query, limit) => ipcRenderer.invoke(EMBEDDING_SEARCH_CHANNEL, query, limit),
  relatedNotes: (noteId, limit) =>
    ipcRenderer.invoke(EMBEDDING_RELATED_NOTES_CHANNEL, noteId, limit),
  readEmbeddingStatus: () => ipcRenderer.invoke(EMBEDDING_STATUS_READ_CHANNEL),
  onEmbeddingStatusChanged: (callback) => subscribeEmbeddingStatus(callback),
};

contextBridge.exposeInMainWorld("hanamask", api);
