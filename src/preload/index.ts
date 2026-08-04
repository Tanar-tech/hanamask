import { contextBridge, ipcRenderer } from "electron";
import type { HanamaskPreloadApi } from "../shared/preload-api.js";

const NOTES_CHANGED_CHANNEL = "notes:changed";
const NOTES_LIST_CHANNEL = "notes:list";
const NOTES_DELETE_CHANNEL = "notes:delete";
const NOTES_GET_CHANNEL = "notes:get";
const TASKS_GET_CHANNEL = "tasks:get";
const TASKS_CHANGED_CHANNEL = "tasks:changed";
const TASKS_LIST_CHANNEL = "tasks:list";
const TASKS_UPDATE_STATUS_CHANNEL = "tasks:update-status";
const IMAGES_ATTACH_CHANNEL = "images:attach";
const IMAGES_LIST_CHANNEL = "images:list";

const subscribe = (channel: string, callback: () => void): (() => void) => {
  const listener = (): void => callback();
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

const api: HanamaskPreloadApi = {
  listNotes: () => ipcRenderer.invoke(NOTES_LIST_CHANNEL),
  getNote: (id) => ipcRenderer.invoke(NOTES_GET_CHANNEL, id),
  deleteNote: (id) => ipcRenderer.invoke(NOTES_DELETE_CHANNEL, id),
  onNotesChanged: (callback) => subscribe(NOTES_CHANGED_CHANNEL, callback),
  listTasks: () => ipcRenderer.invoke(TASKS_LIST_CHANNEL),
  getTask: (id) => ipcRenderer.invoke(TASKS_GET_CHANNEL, id),
  updateTaskStatus: (id, status) => ipcRenderer.invoke(TASKS_UPDATE_STATUS_CHANNEL, id, status),
  onTasksChanged: (callback) => subscribe(TASKS_CHANGED_CHANNEL, callback),
  attachImage: (noteId, fileName, dataBase64, mimeType) =>
    ipcRenderer.invoke(IMAGES_ATTACH_CHANNEL, noteId, fileName, dataBase64, mimeType),
  listImages: (noteId) => ipcRenderer.invoke(IMAGES_LIST_CHANNEL, noteId),
};

contextBridge.exposeInMainWorld("hanamask", api);
