import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { HanamaskPreloadApi, NavigateTarget } from "../shared/preload-api.js";

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
const NOTES_RESTORE_CHANNEL = "notes:restore";
const TASKS_GET_CHANNEL = "tasks:get";
const TASKS_CHANGED_CHANNEL = "tasks:changed";
const TASKS_LIST_CHANNEL = "tasks:list";
const TASKS_UPDATE_STATUS_CHANNEL = "tasks:update-status";
const IMAGES_ATTACH_CHANNEL = "images:attach";
const IMAGES_LIST_CHANNEL = "images:list";
const LINKS_LIST_CHANNEL = "links:list";
const LINKS_CREATE_CHANNEL = "links:create";
const LINKS_DELETE_CHANNEL = "links:delete";
const LINKS_CHANGED_CHANNEL = "links:changed";

const subscribe = (channel: string, callback: () => void): (() => void) => {
  const listener = (): void => callback();
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
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
  deleteNote: (id) => ipcRenderer.invoke(NOTES_DELETE_CHANNEL, id),
  onNotesChanged: (callback) => subscribe(NOTES_CHANGED_CHANNEL, callback),
  listNoteVersions: (noteId) => ipcRenderer.invoke(NOTES_LIST_VERSIONS_CHANNEL, noteId),
  restoreNoteVersion: (versionId) =>
    ipcRenderer.invoke(NOTES_RESTORE_VERSION_CHANNEL, versionId),
  listDeletedNotes: () => ipcRenderer.invoke(NOTES_LIST_DELETED_CHANNEL),
  restoreNote: (id) => ipcRenderer.invoke(NOTES_RESTORE_CHANNEL, id),
  listTasks: () => ipcRenderer.invoke(TASKS_LIST_CHANNEL),
  getTask: (id) => ipcRenderer.invoke(TASKS_GET_CHANNEL, id),
  updateTaskStatus: (id, status) => ipcRenderer.invoke(TASKS_UPDATE_STATUS_CHANNEL, id, status),
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
};

contextBridge.exposeInMainWorld("hanamask", api);
