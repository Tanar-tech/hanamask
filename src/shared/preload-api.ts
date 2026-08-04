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

export interface NoteVersion {
  id: string;
  noteId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  status: TaskStatus;
  dueDate: string | null;
}

export type EntityType = "note" | "task";

export interface Link {
  id: string;
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
}

export interface Image {
  id: string;
  noteId: string;
  filePath: string;
  // Derived from filePath by the main process: only there is node:url available to turn a
  // Windows backslash path into a valid file:// URL the renderer can put in an <img src>.
  fileUrl: string;
  mimeType: string;
}

// Which screen the renderer should show. MCP UI tools (open_note 等) drive this from the
// main process, so the shape has to stay serializable over IPC.
export type NavigateTarget =
  | { kind: "list" }
  | { kind: "note"; id: string }
  | { kind: "task"; id: string }
  | { kind: "search"; query: string };

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  searchNotes(query: string): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  updateNote(
    id: string,
    input: { title?: string; body?: string; tags?: string[] },
  ): Promise<Note | null>;
  deleteNote(id: string): Promise<void>;
  onNotesChanged(callback: () => void): () => void;
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<void>;
  onTasksChanged(callback: () => void): () => void;
  onNavigate(callback: (view: NavigateTarget) => void): () => void;
  // The renderer cannot read a picked file from disk under contextIsolation, so it hands
  // the bytes over as Base64 and the main process owns the file copy.
  attachImage(
    noteId: string,
    fileName: string,
    dataBase64: string,
    mimeType: string,
  ): Promise<Image>;
  listImages(noteId: string): Promise<Image[]>;
}
