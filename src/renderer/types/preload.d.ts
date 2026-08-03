export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  onNotesChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    hanamask: HanamaskPreloadApi;
  }
}
