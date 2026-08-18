import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask, softDeleteTask } from "../../../src/main/db/tasks-repo";
import { readActivity } from "../../../src/main/db/activity-repo";

/*
 * ホーム画面で「記録が途絶えているか」を判断するための集計。ゴミ箱に入れたものを
 * 数えてしまうと、削除しただけで「まだ書いている」ように見えてしまう。
 */
describe("readActivity", () => {
  const NOW = new Date("2026-08-17T12:00:00.000Z");
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let dbFilePath: string;

  const setUpdatedAt = (table: "notes" | "tasks", id: string, updatedAt: Date): void => {
    getDb()
      .prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
      .run(updatedAt.toISOString(), id);
  };

  const daysBefore = (days: number, extraMs = 0): Date =>
    new Date(NOW.getTime() - days * MS_PER_DAY - extraMs);

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-activity-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("1件も無ければ lastRecordedAt は null、件数は 0", () => {
    expect(readActivity(NOW)).toEqual({ lastRecordedAt: null, recentCount: 0 });
  });

  it("ノートだけでも数える", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    setUpdatedAt("notes", note.id, daysBefore(1));

    expect(readActivity(NOW)).toEqual({
      lastRecordedAt: daysBefore(1).toISOString(),
      recentCount: 1,
    });
  });

  it("タスクだけでも数える", () => {
    const task = createTask({ title: "t", status: "todo", dueDate: null, tags: [] });
    setUpdatedAt("tasks", task.id, daysBefore(2));

    expect(readActivity(NOW)).toEqual({
      lastRecordedAt: daysBefore(2).toISOString(),
      recentCount: 1,
    });
  });

  it("ノートとタスクを合算し、最も新しい updated_at を返す", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    const task = createTask({ title: "t", status: "todo", dueDate: null, tags: [] });
    setUpdatedAt("notes", note.id, daysBefore(3));
    setUpdatedAt("tasks", task.id, daysBefore(1));

    expect(readActivity(NOW)).toEqual({
      lastRecordedAt: daysBefore(1).toISOString(),
      recentCount: 2,
    });
  });

  it("ゴミ箱に入れたノート・タスクは数えない", () => {
    const note = createNote({ title: "消える", body: "", tags: [] });
    const task = createTask({ title: "消える", status: "todo", dueDate: null, tags: [] });
    const kept = createNote({ title: "残る", body: "", tags: [] });
    softDeleteNote(note.id);
    softDeleteTask(task.id);
    setUpdatedAt("notes", note.id, daysBefore(0));
    setUpdatedAt("tasks", task.id, daysBefore(0));
    setUpdatedAt("notes", kept.id, daysBefore(4));

    expect(readActivity(NOW)).toEqual({
      lastRecordedAt: daysBefore(4).toISOString(),
      recentCount: 1,
    });
  });

  it("すべてゴミ箱に入っていれば lastRecordedAt は null", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    softDeleteNote(note.id);

    expect(readActivity(NOW)).toEqual({ lastRecordedAt: null, recentCount: 0 });
  });

  it("更新された記録が最大値として拾われる", () => {
    const old = createNote({ title: "古い", body: "", tags: [] });
    const updated = createNote({ title: "更新した", body: "", tags: [] });
    setUpdatedAt("notes", old.id, daysBefore(5));
    setUpdatedAt("notes", updated.id, daysBefore(20));
    setUpdatedAt("notes", updated.id, daysBefore(0, 1));

    expect(readActivity(NOW).lastRecordedAt).toBe(daysBefore(0, 1).toISOString());
  });

  it("ちょうど7日前は直近7日間に含める", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    setUpdatedAt("notes", note.id, daysBefore(7));

    expect(readActivity(NOW).recentCount).toBe(1);
  });

  it("7日と1秒前は直近7日間に含めない", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    setUpdatedAt("notes", note.id, daysBefore(7, 1000));

    expect(readActivity(NOW)).toEqual({
      lastRecordedAt: daysBefore(7, 1000).toISOString(),
      recentCount: 0,
    });
  });

  it("now より後の記録も件数に含める", () => {
    const note = createNote({ title: "n", body: "", tags: [] });
    setUpdatedAt("notes", note.id, new Date(NOW.getTime() + MS_PER_DAY));

    expect(readActivity(NOW).recentCount).toBe(1);
  });
});
