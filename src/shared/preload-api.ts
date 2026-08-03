// main/preload/rendererが共有するSPEC.mdの共有コントラクト型の唯一の定義元。
export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  body: string;
  tags: string[];
}

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  onNotesChanged(callback: () => void): () => void;
}
