import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import {
  createNote,
  getNote,
  listDeletedNotes,
  restoreNote,
  searchNotes,
  softDeleteNote,
  updateNote,
} from "../../../src/main/db/notes-repo";

describe("notes-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("creates a note with a generated id and ISO timestamps", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: ["design", "mcp"] });

    expect(note.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(note.title).toBe("設計メモ");
    expect(note.body).toBe("本文");
    expect(note.tags).toEqual(["design", "mcp"]);
    expect(new Date(note.createdAt).toISOString()).toBe(note.createdAt);
    expect(note.updatedAt).toBe(note.createdAt);
  });

  it("round-trips a created note through getNote", () => {
    const created = createNote({ title: "タイトル", body: "ボディ", tags: ["a"] });

    expect(getNote(created.id)).toEqual(created);
  });

  it("returns null for an unknown id", () => {
    expect(getNote(randomUUID())).toBeNull();
  });

  it("persists notes to the database file across connections", () => {
    const created = createNote({ title: "永続", body: "再起動しても残る", tags: [] });

    closeDb();
    openDb(dbFilePath);

    expect(getNote(created.id)).toEqual(created);
  });

  it("searches title and body by partial, case-insensitive match", () => {
    const alpha = createNote({ title: "Alpha design", body: "no keyword here", tags: [] });
    const beta = createNote({ title: "Beta", body: "mentions DESIGN in the body", tags: [] });
    createNote({ title: "Gamma", body: "unrelated", tags: [] });

    const found = searchNotes("design");

    expect(found.map((note) => note.id).sort()).toEqual([alpha.id, beta.id].sort());
  });

  it("returns every note for an empty query", () => {
    createNote({ title: "one", body: "", tags: [] });
    createNote({ title: "two", body: "", tags: [] });

    expect(searchNotes("")).toHaveLength(2);
  });

  it("returns an empty array when nothing matches", () => {
    createNote({ title: "one", body: "body", tags: [] });

    expect(searchNotes("該当なし")).toEqual([]);
  });

  it("treats LIKE wildcards in the query as literal characters", () => {
    createNote({ title: "plain title", body: "plain body", tags: [] });
    const literal = createNote({ title: "100% done", body: "", tags: [] });

    const found = searchNotes("100%");

    expect(found.map((note) => note.id)).toEqual([literal.id]);
  });

  it("updates the given fields and bumps updatedAt, leaving createdAt unchanged", () => {
    // On a fast CI runner both calls can land in the same millisecond, making the ISO
    // timestamps identical; advance the clock explicitly so updatedAt is reliably distinct.
    vi.useFakeTimers();
    const created = createNote({ title: "元タイトル", body: "元本文", tags: ["a"] });
    vi.advanceTimersByTime(1);

    const updated = updateNote(created.id, { title: "新タイトル" });
    vi.useRealTimers();

    expect(updated).toEqual({
      ...created,
      title: "新タイトル",
      updatedAt: updated?.updatedAt,
    });
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
    expect(updated?.body).toBe("元本文");
    expect(updated?.tags).toEqual(["a"]);
  });

  it("updates body and tags independently of title", () => {
    const created = createNote({ title: "タイトル", body: "元本文", tags: ["a"] });

    const updated = updateNote(created.id, { body: "新本文", tags: ["b", "c"] });

    expect(updated?.title).toBe("タイトル");
    expect(updated?.body).toBe("新本文");
    expect(updated?.tags).toEqual(["b", "c"]);
  });

  it("returns null from updateNote for an unknown id", () => {
    expect(updateNote(randomUUID(), { title: "x" })).toBeNull();
  });

  it("soft-deletes a note by setting deletedAt, and excludes it from search by default", () => {
    const created = createNote({ title: "消す", body: "本文", tags: [] });

    const deleted = softDeleteNote(created.id);

    expect(deleted).toBe(true);
    expect(searchNotes("")).toEqual([]);
  });

  it("returns false from softDeleteNote for an unknown id", () => {
    expect(softDeleteNote(randomUUID())).toBe(false);
  });

  it("still returns a soft-deleted note through getNote", () => {
    const created = createNote({ title: "消す", body: "本文", tags: [] });
    softDeleteNote(created.id);

    expect(getNote(created.id)?.id).toBe(created.id);
  });

  it("restores a soft-deleted note so it reappears in search", () => {
    const created = createNote({ title: "戻す", body: "本文", tags: [] });
    softDeleteNote(created.id);

    const restored = restoreNote(created.id);

    expect(restored?.id).toBe(created.id);
    expect(searchNotes("戻す")).toHaveLength(1);
  });

  it("returns null from restoreNote for an unknown id", () => {
    expect(restoreNote(randomUUID())).toBeNull();
  });

  it("lists only soft-deleted notes", () => {
    const kept = createNote({ title: "残す", body: "本文", tags: [] });
    const removed = createNote({ title: "消す", body: "本文", tags: ["gone"] });
    softDeleteNote(removed.id);

    const deletedNotes = listDeletedNotes();

    expect(deletedNotes).toHaveLength(1);
    expect(deletedNotes[0]?.id).toBe(removed.id);
    expect(deletedNotes[0]?.tags).toEqual(["gone"]);
    expect(deletedNotes.some((note) => note.id === kept.id)).toBe(false);
  });

  it("returns an empty array from listDeletedNotes when nothing is deleted", () => {
    createNote({ title: "残す", body: "本文", tags: [] });

    expect(listDeletedNotes()).toEqual([]);
  });

  it("drops a note from listDeletedNotes once it is restored", () => {
    const created = createNote({ title: "戻す", body: "本文", tags: [] });
    softDeleteNote(created.id);
    expect(listDeletedNotes()).toHaveLength(1);

    restoreNote(created.id);

    expect(listDeletedNotes()).toEqual([]);
  });

  it("orders deleted notes with the most recently deleted first", () => {
    const first = createNote({ title: "先に消す", body: "本文", tags: [] });
    const second = createNote({ title: "後で消す", body: "本文", tags: [] });
    softDeleteNote(first.id);
    softDeleteNote(second.id);

    expect(listDeletedNotes().map((note) => note.id)).toEqual([second.id, first.id]);
  });
});
