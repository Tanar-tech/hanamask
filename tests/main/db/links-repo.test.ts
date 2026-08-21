import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createLink, deleteLink, listLinks } from "../../../src/main/db/links-repo";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { createNotebook, softDeleteNotebook } from "../../../src/main/db/notebooks-repo";

describe("links-repo", () => {
  let dbFilePath: string;
  // リンクは両端の存在を確かめてから張られるので、実在するノート・タスクを用意する。
  let noteId: string;
  let otherNoteId: string;
  let taskId: string;
  let otherTaskId: string;
  let notebookId: string;
  let otherNotebookId: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-link-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    noteId = createNote({ title: "n1", body: "b1", tags: [] }).id;
    otherNoteId = createNote({ title: "n2", body: "b2", tags: [] }).id;
    taskId = createTask({ title: "t1", status: "todo", dueDate: null }).id;
    otherTaskId = createTask({ title: "t2", status: "todo", dueDate: null }).id;
    notebookId = createNotebook({ title: "nb1", summary: "", tags: [] }).id;
    otherNotebookId = createNotebook({ title: "nb2", summary: "", tags: [] }).id;
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("生成したidでリンクを作成する", () => {
    const link = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });

    expect(link.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(link.fromType).toBe("note");
    expect(link.fromId).toBe(noteId);
    expect(link.toType).toBe("task");
    expect(link.toId).toBe(taskId);
  });

  it("接続を張り直してもリンクが永続化されている", () => {
    const created = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "note",
      toId: otherNoteId,
    });

    closeDb();
    openDb(dbFilePath);

    expect(listLinks("note", noteId)).toEqual([created]);
  });

  it("listLinksはfrom側・to側どちらからでも同じリンクを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });

    expect(listLinks("note", noteId)).toEqual([created]);
    expect(listLinks("task", taskId)).toEqual([created]);
  });

  it("listLinksは指定エンティティに紐づく全リンクを返す", () => {
    const outgoing = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });
    const incoming = createLink({
      fromType: "note",
      fromId: otherNoteId,
      toType: "note",
      toId: noteId,
    });
    createLink({ fromType: "task", fromId: otherTaskId, toType: "task", toId: otherTaskId });

    const links = listLinks("note", noteId);

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.id).sort()).toEqual([outgoing.id, incoming.id].sort());
  });

  it("エンティティ種別が違えば同じidでもリンクは一致しない", () => {
    /*
     * ノートとタスクは別々のテーブルなので、同じid文字列が両方に存在しうる。
     * createLink 経由では作れない状況なので、その状態を直接用意して検査する。
     */
    const sharedId = randomUUID();
    const now = new Date().toISOString();
    getDb()
      .prepare("INSERT INTO notes (id, title, body, tags, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run(sharedId, "同じid", "", "[]", now, now);
    getDb()
      .prepare("INSERT INTO tasks (id, title, status, created_at, updated_at) VALUES (?,?,?,?,?)")
      .run(sharedId, "同じid", "todo", now, now);

    createLink({ fromType: "note", fromId: sharedId, toType: "task", toId: taskId });

    expect(listLinks("task", sharedId)).toEqual([]);
  });

  it("リンクが1件も無いとき空配列を返す", () => {
    expect(listLinks("note", randomUUID())).toEqual([]);
  });

  it("deleteLinkはリンクを削除しtrueを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });

    expect(deleteLink(created.id)).toBe(true);
    expect(listLinks("note", noteId)).toEqual([]);
    expect(listLinks("task", taskId)).toEqual([]);
  });

  it("存在しない・削除済みのリンクのdeleteLinkはfalseを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });
    deleteLink(created.id);

    expect(deleteLink(created.id)).toBe(false);
    expect(deleteLink(randomUUID())).toBe(false);
  });

  it("ノート（束）とページのリンクを両側から辿れる", () => {
    const created = createLink({
      fromType: "notebook",
      fromId: notebookId,
      toType: "note",
      toId: noteId,
    });

    expect(listLinks("notebook", notebookId)).toEqual([created]);
    expect(listLinks("note", noteId)).toEqual([created]);
  });

  it("ノート（束）とタスクのリンクを両側から辿れる", () => {
    const created = createLink({
      fromType: "task",
      fromId: taskId,
      toType: "notebook",
      toId: notebookId,
    });

    expect(listLinks("notebook", notebookId)).toEqual([created]);
    expect(listLinks("task", taskId)).toEqual([created]);
  });

  it("ノート（束）同士のリンクを両側から辿れる", () => {
    const created = createLink({
      fromType: "notebook",
      fromId: notebookId,
      toType: "notebook",
      toId: otherNotebookId,
    });

    expect(listLinks("notebook", notebookId)).toEqual([created]);
    expect(listLinks("notebook", otherNotebookId)).toEqual([created]);
  });

  it("ノート（束）のリンクも解除できる", () => {
    const created = createLink({
      fromType: "notebook",
      fromId: notebookId,
      toType: "note",
      toId: noteId,
    });

    expect(deleteLink(created.id)).toBe(true);
    expect(listLinks("notebook", notebookId)).toEqual([]);
  });

  it("存在しないノート（束）idへのリンクは弾かれる", () => {
    const missingId = randomUUID();

    expect(() =>
      createLink({ fromType: "notebook", fromId: missingId, toType: "note", toId: noteId }),
    ).toThrow(`notebook not found: ${missingId}`);
    expect(() =>
      createLink({ fromType: "note", fromId: noteId, toType: "notebook", toId: missingId }),
    ).toThrow(`notebook not found: ${missingId}`);
    expect(listLinks("note", noteId)).toEqual([]);
  });

  it("削除済みのノート（束）端点はページと同じく弾かれる", () => {
    softDeleteNotebook(notebookId);
    softDeleteNote(otherNoteId);

    expect(() =>
      createLink({ fromType: "notebook", fromId: notebookId, toType: "note", toId: noteId }),
    ).toThrow(`notebook not found: ${notebookId}`);
    expect(() =>
      createLink({ fromType: "note", fromId: otherNoteId, toType: "note", toId: noteId }),
    ).toThrow(`note not found: ${otherNoteId}`);
  });

  it("保存済みの不正なfrom_type値を読み出すと例外を投げる", () => {
    const created = createLink({
      fromType: "note",
      fromId: noteId,
      toType: "task",
      toId: taskId,
    });
    getDb().prepare("UPDATE links SET from_type = ? WHERE id = ?").run("broken", created.id);

    expect(() => listLinks("task", taskId)).toThrow();
  });
});
