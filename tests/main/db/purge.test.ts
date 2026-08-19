import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote, getNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask, getTask, softDeleteTask } from "../../../src/main/db/tasks-repo";
import { purgeSoftDeletedRecords } from "../../../src/main/db/purge";
import { upsertEmbedding } from "../../../src/main/db/embeddings-repo";

const NOW = new Date("2026-08-04T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBeforeNow = (days: number): string =>
  new Date(NOW.getTime() - days * DAY_MS).toISOString();

const setNoteDeletedAt = (id: string, deletedAt: string): void => {
  getDb().prepare("UPDATE notes SET deleted_at = ? WHERE id = ?").run(deletedAt, id);
};

const setTaskDeletedAt = (id: string, deletedAt: string): void => {
  getDb().prepare("UPDATE tasks SET deleted_at = ? WHERE id = ?").run(deletedAt, id);
};

const MODEL_ID = "test-model";

const storeEmbedding = (entityType: "note" | "task", entityId: string): void => {
  upsertEmbedding({
    entityType,
    entityId,
    modelId: MODEL_ID,
    contentHash: "hash",
    vector: new Float32Array([1]),
    updatedAt: NOW.toISOString(),
  });
};

const countEmbeddings = (): number => {
  const row: unknown = getDb().prepare("SELECT COUNT(*) AS total FROM embeddings").get();
  if (typeof row !== "object" || row === null || !("total" in row)) {
    throw new Error("Unexpected count row shape");
  }
  return Number(row.total);
};

const createSoftDeletedNote = (daysAgo: number): string => {
  const note = createNote({ title: "消したノート", body: "本文", tags: [] });
  softDeleteNote(note.id);
  setNoteDeletedAt(note.id, daysBeforeNow(daysAgo));
  return note.id;
};

const createSoftDeletedTask = (daysAgo: number): string => {
  const task = createTask({ title: "消したタスク", status: "todo", dueDate: null });
  softDeleteTask(task.id);
  setTaskDeletedAt(task.id, daysBeforeNow(daysAgo));
  return task.id;
};

describe("purgeSoftDeletedRecords", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("permanently deletes notes soft-deleted more than 30 days ago", () => {
    const id = createSoftDeletedNote(31);

    purgeSoftDeletedRecords(NOW);

    expect(getNote(id)).toBeNull();
  });

  it("permanently deletes tasks soft-deleted more than 30 days ago", () => {
    const id = createSoftDeletedTask(31);

    purgeSoftDeletedRecords(NOW);

    expect(getTask(id)).toBeNull();
  });

  it("keeps records soft-deleted less than 30 days ago", () => {
    const noteId = createSoftDeletedNote(29);
    const taskId = createSoftDeletedTask(29);

    const purged = purgeSoftDeletedRecords(NOW);

    expect(getNote(noteId)?.id).toBe(noteId);
    expect(getTask(taskId)?.id).toBe(taskId);
    expect(purged).toEqual({ notesPurged: 0, tasksPurged: 0 });
  });

  it("keeps a record deleted exactly 30 days ago", () => {
    const noteId = createSoftDeletedNote(30);

    const purged = purgeSoftDeletedRecords(NOW);

    expect(getNote(noteId)?.id).toBe(noteId);
    expect(purged.notesPurged).toBe(0);
  });

  it("leaves records that were never soft-deleted untouched", () => {
    const note = createNote({ title: "生きてる", body: "本文", tags: [] });
    const task = createTask({ title: "生きてる", status: "todo", dueDate: null });

    const purged = purgeSoftDeletedRecords(NOW);

    expect(getNote(note.id)?.id).toBe(note.id);
    expect(getTask(task.id)?.id).toBe(task.id);
    expect(purged).toEqual({ notesPurged: 0, tasksPurged: 0 });
  });

  it("reports how many notes and tasks were purged", () => {
    createSoftDeletedNote(31);
    createSoftDeletedNote(60);
    createSoftDeletedNote(29);
    createSoftDeletedTask(45);
    createSoftDeletedTask(1);
    createNote({ title: "生きてる", body: "", tags: [] });

    expect(purgeSoftDeletedRecords(NOW)).toEqual({ notesPurged: 2, tasksPurged: 1 });
  });

  it("does not depend on the wall clock, purging relative to the given time", () => {
    const id = createSoftDeletedNote(31);
    const beforeTheDeletion = new Date(NOW.getTime() - 60 * DAY_MS);

    expect(purgeSoftDeletedRecords(beforeTheDeletion)).toEqual({
      notesPurged: 0,
      tasksPurged: 0,
    });
    expect(getNote(id)?.id).toBe(id);
  });

  it("物理削除したノート・タスクの埋め込み行も消す", () => {
    const noteId = createSoftDeletedNote(31);
    const taskId = createSoftDeletedTask(31);
    storeEmbedding("note", noteId);
    storeEmbedding("task", taskId);

    purgeSoftDeletedRecords(NOW);

    expect(countEmbeddings()).toBe(0);
  });

  it("残った記録の埋め込み行は消さない", () => {
    const note = createNote({ title: "生きてる", body: "本文", tags: [] });
    const deletedId = createSoftDeletedNote(31);
    storeEmbedding("note", note.id);
    storeEmbedding("note", deletedId);

    purgeSoftDeletedRecords(NOW);

    expect(countEmbeddings()).toBe(1);
  });
});
