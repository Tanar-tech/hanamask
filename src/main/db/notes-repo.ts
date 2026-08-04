import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { Note, NoteInput, NoteVersion } from "../../shared/preload-api.js";

interface NoteRow {
  id: string;
  title: string;
  body: string;
  tags: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NoteVersionRow {
  id: string;
  note_id: string;
  title: string;
  body: string;
  tags: string;
  created_at: string;
}

const LIKE_ESCAPE_CHAR = "\\";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isNoteRow = (value: unknown): value is NoteRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    typeof row.tags === "string" &&
    (row.deleted_at === null || typeof row.deleted_at === "string") &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
};

const isNoteVersionRow = (value: unknown): value is NoteVersionRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.note_id === "string" &&
    typeof row.title === "string" &&
    typeof row.body === "string" &&
    typeof row.tags === "string" &&
    typeof row.created_at === "string"
  );
};

const parseTags = (rawTags: string): string[] => {
  const parsed: unknown = JSON.parse(rawTags);
  if (!isStringArray(parsed)) {
    throw new Error(`Stored tags are not a JSON array of strings: ${rawTags}`);
  }
  return parsed;
};

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tags: parseTags(row.tags),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toNoteVersion = (row: NoteVersionRow): NoteVersion => ({
  id: row.id,
  noteId: row.note_id,
  title: row.title,
  body: row.body,
  tags: parseTags(row.tags),
  createdAt: row.created_at,
});

// LIKE treats % and _ as wildcards, so a user query containing them must be escaped.
const toLikePattern = (query: string): string => {
  const escaped = query.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE_CHAR}${character}`);
  return `%${escaped}%`;
};

export const createNote = (input: NoteInput): Note => {
  const timestamp = new Date().toISOString();
  const note: Note = {
    id: randomUUID(),
    title: input.title,
    body: input.body,
    tags: input.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getDb()
    .prepare(
      "INSERT INTO notes (id, title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(note.id, note.title, note.body, JSON.stringify(note.tags), note.createdAt, note.updatedAt);
  return note;
};

export const getNote = (id: string): Note | null => {
  const row: unknown = getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id);
  if (row === undefined) return null;
  if (!isNoteRow(row)) {
    throw new Error(`Unexpected notes row shape for id ${id}`);
  }
  return toNote(row);
};

export const searchNotes = (query: string): Note[] => {
  const rows: unknown[] = getDb()
    .prepare(
      `SELECT * FROM notes
       WHERE deleted_at IS NULL
         AND (title LIKE ? ESCAPE '${LIKE_ESCAPE_CHAR}' OR body LIKE ? ESCAPE '${LIKE_ESCAPE_CHAR}')
       ORDER BY created_at DESC`,
    )
    .all(toLikePattern(query), toLikePattern(query));
  return rows.map((row) => {
    if (!isNoteRow(row)) {
      throw new Error("Unexpected notes row shape in search results");
    }
    return toNote(row);
  });
};

export const listDeletedNotes = (): Note[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // Two deletions can share a millisecond, so rowid breaks the tie by insertion order.
      "SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, rowid DESC",
    )
    .all();
  return rows.map((row) => {
    if (!isNoteRow(row)) {
      throw new Error("Unexpected notes row shape in deleted notes");
    }
    return toNote(row);
  });
};

export interface NoteUpdateInput {
  title?: string;
  body?: string;
  tags?: string[];
}

const snapshotNote = (note: Note): void => {
  getDb()
    .prepare(
      "INSERT INTO note_versions (id, note_id, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomUUID(),
      note.id,
      note.title,
      note.body,
      JSON.stringify(note.tags),
      new Date().toISOString(),
    );
};

export const updateNote = (id: string, input: NoteUpdateInput): Note | null => {
  const existing = getNote(id);
  if (existing === null) return null;

  snapshotNote(existing);

  const updatedAt = new Date().toISOString();
  const title = input.title ?? existing.title;
  const body = input.body ?? existing.body;
  const tags = input.tags ?? existing.tags;

  getDb()
    .prepare("UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?")
    .run(title, body, JSON.stringify(tags), updatedAt, id);

  return { ...existing, title, body, tags, updatedAt };
};

export const listNoteVersions = (noteId: string): NoteVersion[] => {
  const rows: unknown[] = getDb()
    .prepare(
      // Two snapshots can share a millisecond, so rowid breaks the tie by insertion order.
      "SELECT * FROM note_versions WHERE note_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(noteId);
  return rows.map((row) => {
    if (!isNoteVersionRow(row)) {
      throw new Error(`Unexpected note_versions row shape for note ${noteId}`);
    }
    return toNoteVersion(row);
  });
};

const getNoteVersion = (versionId: string): NoteVersion | null => {
  const row: unknown = getDb().prepare("SELECT * FROM note_versions WHERE id = ?").get(versionId);
  if (row === undefined) return null;
  if (!isNoteVersionRow(row)) {
    throw new Error(`Unexpected note_versions row shape for id ${versionId}`);
  }
  return toNoteVersion(row);
};

// Restoring goes through updateNote so the content being replaced is itself snapshotted,
// which keeps the undo operation visible in the history.
export const restoreNoteVersion = (versionId: string): Note | null => {
  const version = getNoteVersion(versionId);
  if (version === null) return null;
  return updateNote(version.noteId, {
    title: version.title,
    body: version.body,
    tags: version.tags,
  });
};

export const softDeleteNote = (id: string): boolean => {
  const deletedAt = new Date().toISOString();
  const result = getDb()
    .prepare("UPDATE notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .run(deletedAt, id);
  return result.changes > 0;
};

export const restoreNote = (id: string): Note | null => {
  const result = getDb()
    .prepare("UPDATE notes SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL")
    .run(id);
  if (result.changes === 0) return null;
  return getNote(id);
};
