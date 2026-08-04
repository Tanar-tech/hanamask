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

export interface HanamaskPreloadApi {
  listNotes(): Promise<Note[]>;
  deleteNote(id: string): Promise<void>;
  onNotesChanged(callback: () => void): () => void;
  listTasks(): Promise<Task[]>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<void>;
  onTasksChanged(callback: () => void): () => void;
}
