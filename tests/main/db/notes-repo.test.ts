import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, getNote, searchNotes } from "../../../src/main/db/notes-repo";

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
});
