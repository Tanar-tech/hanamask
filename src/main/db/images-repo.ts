import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { Image } from "../../shared/preload-api.js";

interface ImageRow {
  id: string;
  note_id: string;
  file_path: string;
  mime_type: string;
}

const isImageRow = (value: unknown): value is ImageRow => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return (
    typeof row.id === "string" &&
    typeof row.note_id === "string" &&
    typeof row.file_path === "string" &&
    typeof row.mime_type === "string"
  );
};

const toImage = (row: ImageRow): Image => ({
  id: row.id,
  noteId: row.note_id,
  filePath: row.file_path,
  mimeType: row.mime_type,
});

export interface ImageInput {
  noteId: string;
  filePath: string;
  mimeType: string;
}

export const createImage = (input: ImageInput): Image => {
  const image: Image = { id: randomUUID(), ...input };
  getDb()
    .prepare("INSERT INTO images (id, note_id, file_path, mime_type) VALUES (?, ?, ?, ?)")
    .run(image.id, image.noteId, image.filePath, image.mimeType);
  return image;
};

export const listImages = (noteId: string): Image[] => {
  const rows: unknown[] = getDb()
    // Attachment order carries no timestamp column, so rowid stands in for it.
    .prepare("SELECT * FROM images WHERE note_id = ? ORDER BY rowid")
    .all(noteId);
  return rows.map((row) => {
    if (!isImageRow(row)) {
      throw new Error(`Unexpected images row shape for note ${noteId}`);
    }
    return toImage(row);
  });
};
