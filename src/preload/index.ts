import { contextBridge, ipcRenderer } from "electron";
import type { Note } from "../main/db/notes-repo.js";

const NOTES_CHANGED_CHANNEL = "notes:changed";
const NOTES_LIST_CHANNEL = "notes:list";

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  onNotesChanged(callback: () => void): () => void;
}

const api: HanamaskPreloadApi = {
  listNotes: () => ipcRenderer.invoke(NOTES_LIST_CHANNEL),
  onNotesChanged: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on(NOTES_CHANGED_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(NOTES_CHANGED_CHANNEL, listener);
    };
  },
};

contextBridge.exposeInMainWorld("hanamask", api);
