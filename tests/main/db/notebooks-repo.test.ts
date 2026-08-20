import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote, listNoteVersions, updateNote } from "../../../src/main/db/notes-repo";
import {
  createNotebook,
  getNotebook,
  listDeletedNotebooks,
  listNotebookVersions,
  listNotebooks,
  restoreNotebook,
  restoreNotebookVersion,
  softDeleteNotebook,
  updateNotebook,
} from "../../../src/main/db/notebooks-repo";

const isNotebookIdRow = (value: unknown): value is { notebook_id: string | null } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return row.notebook_id === null || typeof row.notebook_id === "string";
};

const readNotebookIdOfNote = (noteId: string): string | null | undefined => {
  const row: unknown = getDb().prepare("SELECT notebook_id FROM notes WHERE id = ?").get(noteId);
  return isNotebookIdRow(row) ? row.notebook_id : undefined;
};

describe("notebooks repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-notebooks-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("round-trips a created notebook", () => {
    const created = createNotebook({ title: "研究", summary: "概要", tags: ["a", "b"] });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getNotebook(created.id)).toEqual(created);
    expect(created.createdAt).toBe(created.updatedAt);
  });

  it("returns null for an unknown notebook id", () => {
    expect(getNotebook(randomUUID())).toBeNull();
  });

  it("lists notebooks newest updated first", () => {
    vi.useFakeTimers();
    const first = createNotebook({ title: "1", summary: "", tags: [] });
    vi.advanceTimersByTime(1);
    const second = createNotebook({ title: "2", summary: "", tags: [] });
    vi.useRealTimers();

    expect(listNotebooks().map((notebook) => notebook.id)).toEqual([second.id, first.id]);
  });

  it("keeps soft deleted notebooks out of the list and puts them in the trash", () => {
    const kept = createNotebook({ title: "残す", summary: "", tags: [] });
    const removed = createNotebook({ title: "捨てる", summary: "", tags: [] });

    expect(softDeleteNotebook(removed.id)).toBe(true);

    expect(listNotebooks().map((notebook) => notebook.id)).toEqual([kept.id]);
    const deleted = listDeletedNotebooks();
    expect(deleted.map((notebook) => notebook.id)).toEqual([removed.id]);
    expect(new Date(deleted[0]?.deletedAt ?? "").toISOString()).toBe(deleted[0]?.deletedAt);
  });

  it("reports no change when deleting an unknown or already deleted notebook", () => {
    const created = createNotebook({ title: "1", summary: "", tags: [] });
    softDeleteNotebook(created.id);

    expect(softDeleteNotebook(created.id)).toBe(false);
    expect(softDeleteNotebook(randomUUID())).toBe(false);
  });

  it("restores a soft deleted notebook", () => {
    const created = createNotebook({ title: "1", summary: "概要", tags: ["a"] });
    softDeleteNotebook(created.id);

    const restored = restoreNotebook(created.id);

    expect(restored?.id).toBe(created.id);
    expect(listNotebooks().map((notebook) => notebook.id)).toEqual([created.id]);
    expect(listDeletedNotebooks()).toEqual([]);
  });

  it("returns null when restoring a notebook that is not in the trash", () => {
    const created = createNotebook({ title: "1", summary: "", tags: [] });

    expect(restoreNotebook(created.id)).toBeNull();
    expect(restoreNotebook(randomUUID())).toBeNull();
  });

  it("updates only the given fields and bumps updatedAt", () => {
    vi.useFakeTimers();
    const created = createNotebook({ title: "旧", summary: "旧概要", tags: ["a"] });
    vi.advanceTimersByTime(1);
    const updated = updateNotebook(created.id, { summary: "新概要" });
    vi.useRealTimers();

    expect(updated?.title).toBe("旧");
    expect(updated?.summary).toBe("新概要");
    expect(updated?.tags).toEqual(["a"]);
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
    expect(getNotebook(created.id)?.summary).toBe("新概要");
  });

  it("returns null when updating an unknown notebook", () => {
    expect(updateNotebook(randomUUID(), { title: "x" })).toBeNull();
  });

  it("stacks a version holding the summary as it was before the update", () => {
    const created = createNotebook({ title: "v1", summary: "概要1", tags: ["a"] });

    updateNotebook(created.id, { title: "v2", summary: "概要2", tags: ["b"] });

    const versions = listNotebookVersions(created.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.noteId).toBe(created.id);
    expect(versions[0]?.entityType).toBe("notebook");
    expect(versions[0]?.title).toBe("v1");
    expect(versions[0]?.body).toBe("概要1");
    expect(versions[0]?.tags).toEqual(["a"]);
  });

  it("records no version for a freshly created notebook", () => {
    const created = createNotebook({ title: "v1", summary: "概要", tags: [] });

    expect(listNotebookVersions(created.id)).toEqual([]);
  });

  it("restores the notebook content from the given version", () => {
    const created = createNotebook({ title: "v1", summary: "概要1", tags: ["a"] });
    updateNotebook(created.id, { title: "v2", summary: "概要2", tags: ["b"] });
    const [version] = listNotebookVersions(created.id);

    const restored = restoreNotebookVersion(version?.id ?? "");

    expect(restored?.title).toBe("v1");
    expect(restored?.summary).toBe("概要1");
    expect(restored?.tags).toEqual(["a"]);
    expect(getNotebook(created.id)?.summary).toBe("概要1");
    expect(listNotebookVersions(created.id)).toHaveLength(2);
  });

  it("returns null for an unknown notebook version id", () => {
    expect(restoreNotebookVersion(randomUUID())).toBeNull();
  });

  it("keeps page versions and notebook versions apart", () => {
    const note = createNote({ title: "ページ", body: "本文1", tags: [] });
    const notebook = createNotebook({ title: "ノート", summary: "概要1", tags: [] });
    updateNote(note.id, { body: "本文2" });
    updateNotebook(notebook.id, { summary: "概要2" });

    expect(listNoteVersions(note.id).map((version) => version.body)).toEqual(["本文1"]);
    expect(listNotebookVersions(notebook.id).map((version) => version.body)).toEqual(["概要1"]);
    expect(listNoteVersions(notebook.id)).toEqual([]);
    expect(listNotebookVersions(note.id)).toEqual([]);
  });

  it("refuses to restore a page version through the notebook restore", () => {
    const note = createNote({ title: "ページ", body: "本文1", tags: [] });
    updateNote(note.id, { body: "本文2" });
    const [pageVersion] = listNoteVersions(note.id);

    expect(restoreNotebookVersion(pageVersion?.id ?? "")).toBeNull();
  });

  it("leaves the pages of a soft deleted notebook attached to it", () => {
    const notebook = createNotebook({ title: "束", summary: "", tags: [] });
    const note = createNote({ title: "ページ", body: "本文", tags: [] });
    getDb().prepare("UPDATE notes SET notebook_id = ? WHERE id = ?").run(notebook.id, note.id);

    softDeleteNotebook(notebook.id);

    expect(readNotebookIdOfNote(note.id)).toBe(notebook.id);
  });
});
