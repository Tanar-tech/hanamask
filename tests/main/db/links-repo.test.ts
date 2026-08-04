import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createLink, deleteLink, listLinks } from "../../../src/main/db/links-repo";

describe("links-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-link-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("生成したidでリンクを作成する", () => {
    const link = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });

    expect(link.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(link.fromType).toBe("note");
    expect(link.fromId).toBe("note-1");
    expect(link.toType).toBe("task");
    expect(link.toId).toBe("task-1");
  });

  it("接続を張り直してもリンクが永続化されている", () => {
    const created = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "note",
      toId: "note-2",
    });

    closeDb();
    openDb(dbFilePath);

    expect(listLinks("note", "note-1")).toEqual([created]);
  });

  it("listLinksはfrom側・to側どちらからでも同じリンクを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });

    expect(listLinks("note", "note-1")).toEqual([created]);
    expect(listLinks("task", "task-1")).toEqual([created]);
  });

  it("listLinksは指定エンティティに紐づく全リンクを返す", () => {
    const outgoing = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });
    const incoming = createLink({
      fromType: "note",
      fromId: "note-2",
      toType: "note",
      toId: "note-1",
    });
    createLink({ fromType: "task", fromId: "task-2", toType: "task", toId: "task-3" });

    const links = listLinks("note", "note-1");

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.id).sort()).toEqual([outgoing.id, incoming.id].sort());
  });

  it("エンティティ種別が違えば同じidでもリンクは一致しない", () => {
    createLink({ fromType: "note", fromId: "shared-id", toType: "task", toId: "task-1" });

    expect(listLinks("task", "shared-id")).toEqual([]);
  });

  it("リンクが1件も無いとき空配列を返す", () => {
    expect(listLinks("note", randomUUID())).toEqual([]);
  });

  it("deleteLinkはリンクを削除しtrueを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });

    expect(deleteLink(created.id)).toBe(true);
    expect(listLinks("note", "note-1")).toEqual([]);
    expect(listLinks("task", "task-1")).toEqual([]);
  });

  it("存在しない・削除済みのリンクのdeleteLinkはfalseを返す", () => {
    const created = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });
    deleteLink(created.id);

    expect(deleteLink(created.id)).toBe(false);
    expect(deleteLink(randomUUID())).toBe(false);
  });

  it("保存済みの不正なfrom_type値を読み出すと例外を投げる", () => {
    const created = createLink({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-1",
    });
    getDb().prepare("UPDATE links SET from_type = ? WHERE id = ?").run("broken", created.id);

    expect(() => listLinks("task", "task-1")).toThrow();
  });
});
