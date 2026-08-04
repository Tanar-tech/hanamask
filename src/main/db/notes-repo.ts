import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { Note, NoteInput } from "../../shared/preload-api.js";

interface NoteRow {
  id: string;
  title: string;
  body: string;
  tags: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface NoteUpdateInput {
  title?: string;
  body?: string;
  tags?: string[];
}

export const updateNote = (id: string, input: NoteUpdateInput): Note | null => {
  const existing = getNote(id);
  if (existing === null) return null;

  const updatedAt = new Date().toISOString();
  const title = input.title ?? existing.title;
  const body = input.body ?? existing.body;
  const tags = input.tags ?? existing.tags;

  getDb()
    .prepare("UPDATE notes SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?")
    .run(title, body, JSON.stringify(tags), updatedAt, id);

  return { ...existing, title, body, tags, updatedAt };
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
