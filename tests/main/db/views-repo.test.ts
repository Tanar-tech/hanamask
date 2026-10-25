import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote, updateNote } from "../../../src/main/db/notes-repo";
import { createNotebook, softDeleteNotebook, updateNotebook } from "../../../src/main/db/notebooks-repo";
import { createTask, softDeleteTask, updateTask } from "../../../src/main/db/tasks-repo";
import {
  ensureViewBaseline,
  listUnread,
  markAllViewed,
  markViewed,
  readChangesSinceView,
  readViewedAt,
} from "../../../src/main/db/views-repo";

const T0 = "2026-10-25T09:00:00.000Z";
const BASELINE = "2026-10-25T10:00:00.000Z";
const T2 = "2026-10-25T11:00:00.000Z";
const T3 = "2026-10-25T12:00:00.000Z";
const T4 = "2026-10-25T13:00:00.000Z";
const T5 = "2026-10-25T14:00:00.000Z";

// 版の作成時刻と更新日時を順序づけて検証するため、時計をテストから進める。
const at = (iso: string): Date => {
  vi.setSystemTime(new Date(iso));
  return new Date(iso);
};

const createPage = (body = "本文", notebookId: string | null = null) =>
  createNote({ title: "ページ", body, tags: [] }, notebookId);

describe("views repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    dbFilePath = join(tmpdir(), `hanamask-views-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    vi.useRealTimers();
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  describe("ensureViewBaseline", () => {
    it("keeps the first recorded time", () => {
      expect(ensureViewBaseline(new Date(BASELINE))).toBe(BASELINE);
      expect(ensureViewBaseline(new Date(T3))).toBe(BASELINE);
    });
  });

  describe("listUnread", () => {
    it("treats records that existed before the baseline as read", () => {
      at(T0);
      createPage();
      createTask({ title: "タスク", status: "todo", dueDate: null });
      createNotebook({ title: "ノート", summary: "概要", tags: [] });
      ensureViewBaseline(at(BASELINE));

      expect(listUnread()).toEqual([]);
    });

    it("records the baseline on first use when none exists", () => {
      at(T0);
      createPage();
      at(BASELINE);

      expect(listUnread()).toEqual([]);
      expect(ensureViewBaseline(new Date(T5))).toBe(BASELINE);
    });

    it("reports records updated after the baseline", () => {
      at(T0);
      const note = createPage();
      const task = createTask({ title: "タスク", status: "todo", dueDate: null });
      const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });
      ensureViewBaseline(at(BASELINE));
      at(T2);
      updateNote(note.id, { body: "更新" });
      updateTask(task.id, { status: "done" });
      updateNotebook(notebook.id, { summary: "更新" });

      expect(listUnread()).toEqual(
        expect.arrayContaining([
          { entityType: "note", id: note.id },
          { entityType: "task", id: task.id },
          { entityType: "notebook", id: notebook.id },
        ]),
      );
      expect(listUnread()).toHaveLength(3);
    });

    it("reports a record updated after it was viewed", () => {
      ensureViewBaseline(at(T0));
      const note = createPage();
      markViewed("note", note.id, at(BASELINE));
      at(T2);
      updateNote(note.id, { body: "更新" });

      expect(listUnread()).toEqual([{ entityType: "note", id: note.id }]);
    });

    it("clears a record once it is viewed", () => {
      ensureViewBaseline(at(T0));
      at(BASELINE);
      const note = createPage();
      markViewed("note", note.id, at(T2));

      expect(listUnread()).toEqual([]);
      expect(readViewedAt("note", note.id)).toBe(T2);
    });

    it("marks a notebook unread when one of its pages is unread", () => {
      at(T0);
      const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });
      const page = createPage("本文", notebook.id);
      ensureViewBaseline(at(BASELINE));
      at(T2);
      updateNote(page.id, { body: "更新" });

      expect(listUnread()).toEqual(
        expect.arrayContaining([
          { entityType: "note", id: page.id },
          { entityType: "notebook", id: notebook.id },
        ]),
      );

      markViewed("notebook", notebook.id, at(T3));
      expect(listUnread()).toContainEqual({ entityType: "notebook", id: notebook.id });

      markViewed("note", page.id, at(T4));
      expect(listUnread()).toEqual([]);
    });

    it("ignores deleted pages when judging a notebook", () => {
      at(T0);
      const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });
      const page = createPage("本文", notebook.id);
      ensureViewBaseline(at(BASELINE));
      at(T2);
      updateNote(page.id, { body: "更新" });
      softDeleteNote(page.id);

      expect(listUnread()).toEqual([]);
    });

    it("excludes deleted records", () => {
      ensureViewBaseline(at(T0));
      at(T2);
      const note = createPage();
      const task = createTask({ title: "タスク", status: "todo", dueDate: null });
      const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });
      softDeleteNote(note.id);
      softDeleteTask(task.id);
      softDeleteNotebook(notebook.id);

      expect(listUnread()).toEqual([]);
    });
  });

  describe("markAllViewed", () => {
    it("clears every unread record", () => {
      ensureViewBaseline(at(T0));
      at(T2);
      const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });
      createPage("本文", notebook.id);
      createPage();
      createTask({ title: "タスク", status: "todo", dueDate: null });
      expect(listUnread()).toHaveLength(4);

      markAllViewed(at(T3));

      expect(listUnread()).toEqual([]);
    });

    it("overwrites an older viewed time", () => {
      ensureViewBaseline(at(T0));
      const note = createPage();
      markViewed("note", note.id, at(BASELINE));

      markAllViewed(at(T3));

      expect(readViewedAt("note", note.id)).toBe(T3);
    });
  });

  describe("readViewedAt", () => {
    it("returns null for a record never viewed", () => {
      expect(readViewedAt("task", randomUUID())).toBeNull();
    });
  });

  describe("readChangesSinceView", () => {
    it("returns the content as of the last view after several edits", () => {
      ensureViewBaseline(at(T0));
      const note = createNote({ title: "v1", body: "本文1", tags: [] });
      at(BASELINE);
      updateNote(note.id, { title: "v2", body: "本文2" });
      markViewed("note", note.id, at(T2));
      at(T3);
      updateNote(note.id, { title: "v3", body: "本文3" });
      at(T4);
      updateNote(note.id, { title: "v4", body: "本文4" });

      expect(readChangesSinceView("note", note.id)).toEqual({
        viewedAt: T2,
        previousTitle: "v2",
        previousBody: "本文2",
      });
    });

    it("returns null when nothing changed since the view", () => {
      ensureViewBaseline(at(T0));
      const note = createPage();
      at(BASELINE);
      updateNote(note.id, { body: "更新" });
      markViewed("note", note.id, at(T2));

      expect(readChangesSinceView("note", note.id)).toBeNull();
    });

    it("falls back to the baseline when the record was never viewed", () => {
      at(T0);
      const note = createNote({ title: "元", body: "元本文", tags: [] });
      ensureViewBaseline(at(BASELINE));
      at(T2);
      updateNote(note.id, { title: "新", body: "新本文" });

      expect(readChangesSinceView("note", note.id)).toEqual({
        viewedAt: BASELINE,
        previousTitle: "元",
        previousBody: "元本文",
      });
    });

    it("uses the notebook summary as the body", () => {
      ensureViewBaseline(at(T0));
      const notebook = createNotebook({ title: "ノート", summary: "概要1", tags: [] });
      markViewed("notebook", notebook.id, at(BASELINE));
      at(T2);
      updateNotebook(notebook.id, { summary: "概要2" });

      expect(readChangesSinceView("notebook", notebook.id)).toEqual({
        viewedAt: BASELINE,
        previousTitle: "ノート",
        previousBody: "概要1",
      });
    });

    it("returns null for a missing or deleted record", () => {
      ensureViewBaseline(at(T0));
      const note = createPage();
      at(T2);
      updateNote(note.id, { body: "更新" });
      softDeleteNote(note.id);

      expect(readChangesSinceView("note", note.id)).toBeNull();
      expect(readChangesSinceView("notebook", randomUUID())).toBeNull();
    });

    it("returns null when the update left no version", () => {
      ensureViewBaseline(at(T0));
      const note = createPage();
      markViewed("note", note.id, at(BASELINE));
      at(T2);
      const created = createPage();

      expect(readChangesSinceView("note", created.id)).toBeNull();
      expect(readChangesSinceView("note", note.id)).toBeNull();
    });
  });

  it("keeps the baseline and viewed times across a restart", () => {
    at(T0);
    const note = createPage();
    const task = createTask({ title: "タスク", status: "todo", dueDate: null });
    ensureViewBaseline(at(BASELINE));
    at(T2);
    updateNote(note.id, { body: "更新" });
    updateTask(task.id, { status: "done" });
    markViewed("note", note.id, at(T3));

    closeDb();
    openDb(dbFilePath);
    at(T5);

    expect(listUnread()).toEqual([{ entityType: "task", id: task.id }]);
    expect(readViewedAt("note", note.id)).toBe(T3);
    expect(ensureViewBaseline(new Date(T5))).toBe(BASELINE);
  });
});
