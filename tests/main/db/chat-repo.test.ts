import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { createNotebook } from "../../../src/main/db/notebooks-repo";
import {
  createChatEntry,
  deleteChatMessagesForEntity,
  listChatEntries,
  listUndeliveredChatEntries,
  markChatEntriesDelivered,
} from "../../../src/main/db/chat-repo";

const DELIVERED_AT = "2026-08-29T00:00:00.000Z";

describe("chat-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-chat-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("利用者の発言を作ると採番されたidとISO時刻を持ち、未配信になる", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: [] });

    const entry = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "この節を短くして",
    });

    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.entityType).toBe("note");
    expect(entry.entityId).toBe(note.id);
    expect(entry.sender).toBe("user");
    expect(entry.body).toBe("この節を短くして");
    expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
    expect(entry.deliveredAt).toBeNull();
  });

  it("エージェントの発言は最初から配信済み（deliveredAtがcreatedAtと同値）になる", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: [] });

    const entry = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "agent",
      body: "まとめました",
    });

    expect(entry.deliveredAt).toBe(entry.createdAt);
  });

  it("タスク・ノートにも紐付けられる", () => {
    const task = createTask({ title: "タスク", body: "", tags: [], status: "todo", dueDate: null });
    const notebook = createNotebook({ title: "ノート", summary: "概要", tags: [] });

    const forTask = createChatEntry({
      entityType: "task",
      entityId: task.id,
      sender: "user",
      body: "進捗は",
    });
    const forNotebook = createChatEntry({
      entityType: "notebook",
      entityId: notebook.id,
      sender: "user",
      body: "概要を直して",
    });

    expect(listChatEntries("task", task.id)).toEqual([forTask]);
    expect(listChatEntries("notebook", notebook.id)).toEqual([forNotebook]);
  });

  it("存在しない対象に紐付けようとすると失敗する", () => {
    expect(() =>
      createChatEntry({
        entityType: "note",
        entityId: randomUUID(),
        sender: "user",
        body: "宛先なし",
      }),
    ).toThrow(/note not found/);
  });

  it("ゴミ箱に入っている対象には紐付けられない", () => {
    const note = createNote({ title: "消したページ", body: "本文", tags: [] });
    softDeleteNote(note.id);

    expect(() =>
      createChatEntry({ entityType: "note", entityId: note.id, sender: "user", body: "宛先なし" }),
    ).toThrow(/note not found/);
  });

  it("一覧は作成順で、対象が違う発言は混ざらない", () => {
    const note = createNote({ title: "ページ", body: "本文", tags: [] });
    const other = createNote({ title: "別のページ", body: "本文", tags: [] });
    const first = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "1つめ",
    });
    const second = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "agent",
      body: "2つめ",
    });
    createChatEntry({ entityType: "note", entityId: other.id, sender: "user", body: "別の対象" });

    expect(listChatEntries("note", note.id)).toEqual([first, second]);
  });

  it("発言はDBファイルに残り、開き直しても読める", () => {
    const note = createNote({ title: "永続", body: "本文", tags: [] });
    const entry = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "再起動しても残る",
    });

    closeDb();
    openDb(dbFilePath);

    expect(listChatEntries("note", note.id)).toEqual([entry]);
  });

  it("未配信一覧は利用者の未配信発言だけを対象のタイトル付きで返す", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: [] });
    const task = createTask({ title: "実装する", body: "", tags: [], status: "todo", dueDate: null });
    const pending = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "未配信",
    });
    createChatEntry({ entityType: "note", entityId: note.id, sender: "agent", body: "返信" });
    const pendingTask = createChatEntry({
      entityType: "task",
      entityId: task.id,
      sender: "user",
      body: "未配信2",
    });

    expect(listUndeliveredChatEntries()).toEqual([
      { ...pending, entityTitle: "設計メモ" },
      { ...pendingTask, entityTitle: "実装する" },
    ]);
  });

  it("配信済みにすると未配信一覧から消え、時刻が記録される", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: [] });
    const entry = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "受け取って",
    });

    markChatEntriesDelivered([entry.id], DELIVERED_AT);

    expect(listUndeliveredChatEntries()).toEqual([]);
    expect(listChatEntries("note", note.id)[0]?.deliveredAt).toBe(DELIVERED_AT);
  });

  it("空のid配列を配信済みにしても何も起きない", () => {
    const note = createNote({ title: "設計メモ", body: "本文", tags: [] });
    const entry = createChatEntry({
      entityType: "note",
      entityId: note.id,
      sender: "user",
      body: "未配信のまま",
    });

    markChatEntriesDelivered([], DELIVERED_AT);

    expect(listUndeliveredChatEntries()).toEqual([{ ...entry, entityTitle: "設計メモ" }]);
  });

  it("対象ごとの削除は件数を返し、他の対象の発言は残す", () => {
    const note = createNote({ title: "ページ", body: "本文", tags: [] });
    const other = createNote({ title: "別のページ", body: "本文", tags: [] });
    createChatEntry({ entityType: "note", entityId: note.id, sender: "user", body: "1つめ" });
    createChatEntry({ entityType: "note", entityId: note.id, sender: "agent", body: "2つめ" });
    const kept = createChatEntry({
      entityType: "note",
      entityId: other.id,
      sender: "user",
      body: "残る",
    });

    expect(deleteChatMessagesForEntity("note", note.id)).toBe(2);
    expect(listChatEntries("note", note.id)).toEqual([]);
    expect(listChatEntries("note", other.id)).toEqual([kept]);
  });

  it("発言が無い対象を削除しても0件で失敗しない", () => {
    expect(deleteChatMessagesForEntity("note", randomUUID())).toBe(0);
  });
});
