import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import {
  createNote,
  getNote,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
} from "../../../src/main/db/notes-repo";

/*
 * entity_type 列を足すマイグレーションはセットAが並行して実装中なので、無いあいだは
 * SPEC.md の DDL をここであてる。セットA合流後はこの分岐を通らない。
 */
const isColumnRow = (value: unknown): value is { name: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.name === "string";
};

const ensureEntityTypeColumn = (): void => {
  const rows: unknown[] = getDb().prepare("SELECT name FROM pragma_table_info(?)").all("note_versions");
  if (rows.some((row) => isColumnRow(row) && row.name === "entity_type")) return;
  getDb().exec("ALTER TABLE note_versions ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'note'");
};

describe("note versions", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-versions-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    ensureEntityTypeColumn();
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("records no version for a freshly created note", () => {
    const created = createNote({ title: "元", body: "元本文", tags: ["a"] });

    expect(listNoteVersions(created.id)).toEqual([]);
  });

  it("snapshots the pre-update content on every updateNote call", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: ["a"] });

    updateNote(created.id, { title: "v2", body: "本文2" });
    expect(listNoteVersions(created.id)).toHaveLength(1);

    updateNote(created.id, { title: "v3" });
    expect(listNoteVersions(created.id)).toHaveLength(2);
  });

  it("stores the content as it was before the update", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: ["a", "b"] });

    updateNote(created.id, { title: "v2", body: "本文2", tags: ["c"] });

    const [version] = listNoteVersions(created.id);
    expect(version?.noteId).toBe(created.id);
    expect(version?.title).toBe("v1");
    expect(version?.body).toBe("本文1");
    expect(version?.tags).toEqual(["a", "b"]);
    expect(version?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(version?.createdAt ?? "").toISOString()).toBe(version?.createdAt);
  });

  it("marks a page snapshot as a note version", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: [] });

    updateNote(created.id, { body: "本文2" });

    expect(listNoteVersions(created.id)[0]?.entityType).toBe("note");
  });

  it("hides rows of another entity type from the page history", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: [] });
    updateNote(created.id, { body: "本文2" });
    getDb()
      .prepare(
        "INSERT INTO note_versions (id, note_id, entity_type, title, body, tags, created_at) VALUES (?, ?, 'notebook', ?, ?, ?, ?)",
      )
      .run(randomUUID(), created.id, "概要", "概要本文", "[]", new Date().toISOString());

    const versions = listNoteVersions(created.id);

    expect(versions).toHaveLength(1);
    expect(versions[0]?.body).toBe("本文1");
  });

  it("lists versions newest first", () => {
    // Two updates can land in the same millisecond on a fast runner, which would make the
    // ISO timestamps identical; advance the clock so the ordering is unambiguous.
    vi.useFakeTimers();
    const created = createNote({ title: "v1", body: "本文1", tags: [] });
    vi.advanceTimersByTime(1);
    updateNote(created.id, { body: "本文2" });
    vi.advanceTimersByTime(1);
    updateNote(created.id, { body: "本文3" });
    vi.useRealTimers();

    expect(listNoteVersions(created.id).map((version) => version.body)).toEqual(["本文2", "本文1"]);
  });

  it("keeps versions of other notes out of the list", () => {
    const kept = createNote({ title: "keep", body: "本文", tags: [] });
    const other = createNote({ title: "other", body: "本文", tags: [] });
    updateNote(kept.id, { body: "更新" });
    updateNote(other.id, { body: "更新" });

    const versions = listNoteVersions(kept.id);

    expect(versions).toHaveLength(1);
    expect(versions[0]?.noteId).toBe(kept.id);
  });

  it("returns an empty array for a note that has never been updated", () => {
    expect(listNoteVersions(randomUUID())).toEqual([]);
  });

  it("restores the note content from the given version", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: ["a"] });
    updateNote(created.id, { title: "v2", body: "本文2", tags: ["b"] });
    const [firstVersion] = listNoteVersions(created.id);

    const restored = restoreNoteVersion(firstVersion?.id ?? "");

    expect(restored?.id).toBe(created.id);
    expect(restored?.title).toBe("v1");
    expect(restored?.body).toBe("本文1");
    expect(restored?.tags).toEqual(["a"]);
    expect(getNote(created.id)?.body).toBe("本文1");
  });

  it("pushes the pre-restore content onto the history as a new version", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: [] });
    updateNote(created.id, { body: "本文2" });
    const [firstVersion] = listNoteVersions(created.id);

    restoreNoteVersion(firstVersion?.id ?? "");

    const versions = listNoteVersions(created.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.body).toBe("本文2");
  });

  it("refuses to restore a version belonging to another entity type", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: [] });
    const notebookVersionId = randomUUID();
    getDb()
      .prepare(
        "INSERT INTO note_versions (id, note_id, entity_type, title, body, tags, created_at) VALUES (?, ?, 'notebook', ?, ?, ?, ?)",
      )
      .run(notebookVersionId, created.id, "概要", "概要本文", "[]", new Date().toISOString());

    expect(restoreNoteVersion(notebookVersionId)).toBeNull();
  });

  it("returns null for an unknown version id", () => {
    expect(restoreNoteVersion(randomUUID())).toBeNull();
  });

  it("returns null when the note behind the version no longer exists", () => {
    const created = createNote({ title: "v1", body: "本文1", tags: [] });
    updateNote(created.id, { body: "本文2" });
    const [version] = listNoteVersions(created.id);
    getDb().prepare("DELETE FROM notes WHERE id = ?").run(created.id);

    expect(restoreNoteVersion(version?.id ?? "")).toBeNull();
  });
});
