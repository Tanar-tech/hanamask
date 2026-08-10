import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { listTagsInUse } from "../../../src/main/db/tags-repo";

/*
 * エージェントは自分が過去に何と名付けたかを覚えていない。既に使われているタグを
 * 見せないと、同じ案件に「プロジェクトA」「project-a」「PJ-A」と別々の名前が付き、
 * グループとして機能しなくなる。
 */
describe("listTagsInUse", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-tags-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("ノートとタスクの両方から集める", () => {
    createNote({ title: "n", body: "", tags: ["プロジェクトA"] });
    createTask({ title: "t", status: "todo", dueDate: null, tags: ["プロジェクトB"] });

    expect(listTagsInUse()).toEqual([
      { tag: "プロジェクトA", noteCount: 1, taskCount: 0 },
      { tag: "プロジェクトB", noteCount: 0, taskCount: 1 },
    ]);
  });

  it("同じタグはまとめ、件数を数える", () => {
    createNote({ title: "n1", body: "", tags: ["設計"] });
    createNote({ title: "n2", body: "", tags: ["設計"] });
    createTask({ title: "t1", status: "todo", dueDate: null, tags: ["設計"] });

    expect(listTagsInUse()).toEqual([{ tag: "設計", noteCount: 2, taskCount: 1 }]);
  });

  it("削除済みの記録のタグは数えない", () => {
    const note = createNote({ title: "n", body: "", tags: ["消える"] });
    createNote({ title: "残る", body: "", tags: ["残る"] });
    softDeleteNote(note.id);

    expect(listTagsInUse().map((entry) => entry.tag)).toEqual(["残る"]);
  });

  it("タグが1つも無ければ空を返す", () => {
    createNote({ title: "n", body: "", tags: [] });

    expect(listTagsInUse()).toEqual([]);
  });
});
