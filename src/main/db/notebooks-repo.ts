import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { getNote } from "./notes-repo.js";
import { parseTags, serializeTags } from "./tags.js";
import type {
  DeletedNotebook,
  Note,
  Notebook,
  NoteVersion,
  VersionEntityType,
} from "../../shared/preload-api.js";

interface NotebookRow {
  id: string;
  title: string;
  summary: string;
  tags: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
}

interface NotebookVersionRow {
  id: string;
  note_id: string;
  entity_type: VersionEntityType;
  title: string;
  body: string;
  tags: string;
  created_at: string;
}

// note_versions はページとノートの版を同居させるので、ノート側は必ずこの値で絞る。
const NOTEBOOK_ENTITY_TYPE = "notebook";

const isNotebookRow = (value: unknown): value is NotebookRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.summary === "string" &&
    typeof row.tags === "string" &&
    (row.deleted_at === null || typeof row.deleted_at === "string") &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string" &&
    (row.pinned_at === null || typeof row.pinned_at === "string")
  );
};

const isNoteIdRow = (value: unknown): value is { id: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.id === "string";
};

const isNotebookVersionRow = (value: unknown): value is NotebookVersionRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.note_id === "string" &&
    (row.entity_type === "note" || row.entity_type === "notebook") &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    typeof row.tags === "string" &&
    typeof row.created_at === "string"
  );
};

const toNotebook = (row: NotebookRow): Notebook => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  tags: parseTags(row.tags),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  pinnedAt: row.pinned_at,
});

const toNotebookVersion = (row: NotebookVersionRow): NoteVersion => ({
  id: row.id,
  noteId: row.note_id,
  entityType: row.entity_type,
  title: row.title,
  body: row.body,
  tags: parseTags(row.tags),
  createdAt: row.created_at,
});

export interface NotebookInput {
  title: string;
  summary: string;
  tags: string[];
}

export interface NotebookUpdateInput {
  title?: string;
  summary?: string;
  tags?: string[];
}

export const createNotebook = (input: NotebookInput): Notebook => {
  const timestamp = new Date().toISOString();
  const notebook: Notebook = {
    id: randomUUID(),
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
    pinnedAt: null,
  };
  getDb()
    .prepare(
      "INSERT INTO notebooks (id, title, summary, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      notebook.id,
      notebook.title,
      notebook.summary,
      serializeTags(notebook.tags),
      notebook.createdAt,
      notebook.updatedAt,
    );
  return notebook;
};

const selectNotebook = (sql: string, id: string): Notebook | null => {
  const row: unknown = getDb().prepare(sql).get(id);
  if (row === undefined) return null;
  if (!isNotebookRow(row)) {
    throw new Error(`Unexpected notebooks row shape for id ${id}`);
  }
  return toNotebook(row);
};

export const getNotebook = (id: string): Notebook | null =>
  selectNotebook("SELECT * FROM notebooks WHERE id = ?", id);

// ゴミ箱の中の束を「無い」ものとして扱いたい呼び出し側のための入口。
export const getActiveNotebook = (id: string): Notebook | null =>
  selectNotebook("SELECT * FROM notebooks WHERE id = ? AND deleted_at IS NULL", id);

/*
 * ページの行の読み方は notes-repo が持っているので、ここでは id だけを引いて本体の
 * 組み立てを getNote に任せる（同じ行の解釈が2箇所に増えないようにするため）。
 */
export const listNotesInNotebook = (notebookId: string): Note[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // Two updates can share a millisecond, so rowid breaks the tie by insertion order.
      "SELECT id FROM notes WHERE notebook_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, rowid DESC",
    )
    .all(notebookId);
  return rows.map((row) => {
    if (!isNoteIdRow(row)) {
      throw new Error(`Unexpected notes row shape in notebook ${notebookId}`);
    }
    const note = getNote(row.id);
    if (note === null) {
      throw new Error(`Note ${row.id} disappeared while listing notebook ${notebookId}`);
    }
    return note;
  });
};

// notes-repo の setNotePinned と同じ扱い: 版を残さず updated_at も動かさない。
export const setNotebookPinned = (id: string, pinned: boolean): Notebook | null => {
  const result = getDb()
    .prepare("UPDATE notebooks SET pinned_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(pinned ? new Date().toISOString() : null, id);
  if (result.changes === 0) return null;
  return getNotebook(id);
};

export const listNotebooks = (): Notebook[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // Two updates can share a millisecond, so rowid breaks the tie by insertion order.
      "SELECT * FROM notebooks WHERE deleted_at IS NULL ORDER BY updated_at DESC, rowid DESC",
    )
    .all();
  return rows.map((row) => {
    if (!isNotebookRow(row)) {
      throw new Error("Unexpected notebooks row shape in notebook list");
    }
    return toNotebook(row);
  });
};

export const listDeletedNotebooks = (): DeletedNotebook[] => {
  const rows: unknown[] = getDb()
    .prepare(
      "SELECT * FROM notebooks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, rowid DESC",
    )
    .all();
  return rows.map((row) => {
    if (!isNotebookRow(row)) {
      throw new Error("Unexpected notebooks row shape in deleted notebooks");
    }
    if (row.deleted_at === null) {
      throw new Error("A deleted notebook came back without deleted_at");
    }
    return { ...toNotebook(row), deletedAt: row.deleted_at };
  });
};

// 概要は note_versions の body に入れる（ページの本文と同じ枠で履歴を持つため）。
const snapshotNotebook = (notebook: Notebook): void => {
  getDb()
    .prepare(
      "INSERT INTO note_versions (id, note_id, entity_type, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomUUID(),
      notebook.id,
      NOTEBOOK_ENTITY_TYPE,
      notebook.title,
      notebook.summary,
      serializeTags(notebook.tags),
      new Date().toISOString(),
    );
};

export const updateNotebook = (
  id: string,
  input: NotebookUpdateInput,
): Notebook | null => {
  const existing = getNotebook(id);
  if (existing === null) return null;

  snapshotNotebook(existing);

  const updatedAt = new Date().toISOString();
  const title = input.title ?? existing.title;
  const summary = input.summary ?? existing.summary;
  const tags = input.tags ?? existing.tags;

  getDb()
    .prepare(
      "UPDATE notebooks SET title = ?, summary = ?, tags = ?, updated_at = ? WHERE id = ?",
    )
    .run(title, summary, serializeTags(tags), updatedAt, id);

  return { ...existing, title, summary, tags, updatedAt };
};

export const listNotebookVersions = (notebookId: string): NoteVersion[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // Two snapshots can share a millisecond, so rowid breaks the tie by insertion order.
      "SELECT * FROM note_versions WHERE note_id = ? AND entity_type = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(notebookId, NOTEBOOK_ENTITY_TYPE);
  return rows.map((row) => {
    if (!isNotebookVersionRow(row)) {
      throw new Error(
        `Unexpected note_versions row shape for notebook ${notebookId}`,
      );
    }
    return toNotebookVersion(row);
  });
};

const getNotebookVersion = (versionId: string): NoteVersion | null => {
  const row: unknown = getDb()
    .prepare("SELECT * FROM note_versions WHERE id = ? AND entity_type = ?")
    .get(versionId, NOTEBOOK_ENTITY_TYPE);
  if (row === undefined) return null;
  if (!isNotebookVersionRow(row)) {
    throw new Error(`Unexpected note_versions row shape for id ${versionId}`);
  }
  return toNotebookVersion(row);
};

// Restoring goes through updateNotebook so the content being replaced is itself snapshotted,
// which keeps the undo operation visible in the history.
export const restoreNotebookVersion = (versionId: string): Notebook | null => {
  const version = getNotebookVersion(versionId);
  if (version === null) return null;
  return updateNotebook(version.noteId, {
    title: version.title,
    summary: version.body,
    tags: version.tags,
  });
};

/*
 * 所属ページの notebook_id はここでは外さない（docs/REQUIREMENTS.md §4.9）。復元で束が
 * そのまま戻せるようにし、正式な無所属化は30日パージまで待つ。
 */
export const softDeleteNotebook = (id: string): boolean => {
  const deletedAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      "UPDATE notebooks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .run(deletedAt, id);
  return result.changes > 0;
};

export const restoreNotebook = (id: string): Notebook | null => {
  const result = getDb()
    .prepare(
      "UPDATE notebooks SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
    )
    .run(id);
  if (result.changes === 0) return null;
  return getNotebook(id);
};
