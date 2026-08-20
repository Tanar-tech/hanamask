import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { parseTags, serializeTags } from "./tags.js";
import type {
  DeletedNotebook,
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
    typeof row.updated_at === "string"
  );
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

export const getNotebook = (id: string): Notebook | null => {
  const row: unknown = getDb().prepare("SELECT * FROM notebooks WHERE id = ?").get(id);
  if (row === undefined) return null;
  if (!isNotebookRow(row)) {
    throw new Error(`Unexpected notebooks row shape for id ${id}`);
  }
  return toNotebook(row);
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

export const updateNotebook = (id: string, input: NotebookUpdateInput): Notebook | null => {
  const existing = getNotebook(id);
  if (existing === null) return null;

  snapshotNotebook(existing);

  const updatedAt = new Date().toISOString();
  const title = input.title ?? existing.title;
  const summary = input.summary ?? existing.summary;
  const tags = input.tags ?? existing.tags;

  getDb()
    .prepare("UPDATE notebooks SET title = ?, summary = ?, tags = ?, updated_at = ? WHERE id = ?")
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
      throw new Error(`Unexpected note_versions row shape for notebook ${notebookId}`);
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
    .prepare("UPDATE notebooks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(deletedAt, id);
  return result.changes > 0;
};

export const restoreNotebook = (id: string): Notebook | null => {
  const result = getDb()
    .prepare("UPDATE notebooks SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
    .run(id);
  if (result.changes === 0) return null;
  return getNotebook(id);
};
