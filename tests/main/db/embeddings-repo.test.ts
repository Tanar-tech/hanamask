import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import {
  createNote,
  softDeleteNote,
  updateNote,
} from "../../../src/main/db/notes-repo";
import { createTask, softDeleteTask } from "../../../src/main/db/tasks-repo";
import {
  createNotebook,
  softDeleteNotebook,
  updateNotebook,
} from "../../../src/main/db/notebooks-repo";
import {
  contentHashOf,
  deleteEmbedding,
  deleteOrphanEmbeddings,
  listEmbeddings,
  listStaleEntities,
  upsertEmbedding,
} from "../../../src/main/db/embeddings-repo";
import type { StoredEmbedding } from "../../../src/main/db/embeddings-repo";

const MODEL_ID = "ruri-v3-70m-q8_0";
const OTHER_MODEL_ID = "multilingual-e5-small-q8_0";
const UPDATED_AT = "2026-08-19T00:00:00.000Z";

const embeddingFor = (
  entityType: StoredEmbedding["entityType"],
  entityId: string,
  overrides: Partial<StoredEmbedding> = {},
): StoredEmbedding => ({
  entityType,
  entityId,
  modelId: MODEL_ID,
  contentHash: "hash",
  vector: new Float32Array([0.5, -0.25, 0.125]),
  updatedAt: UPDATED_AT,
  ...overrides,
});

const onlyRow = <T>(rows: T[]): T => {
  const [row] = rows;
  if (row === undefined)
    throw new Error(`Expected exactly one row, got ${rows.length}`);
  return row;
};

describe("embeddings-repo", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(
      tmpdir(),
      `hanamask-embeddings-test-${randomUUID()}.sqlite3`,
    );
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  describe("contentHashOf", () => {
    it("同じタイトルと本文なら同じハッシュになる", () => {
      expect(contentHashOf("題", "本文")).toBe(contentHashOf("題", "本文"));
    });

    it("本文が変われば別のハッシュになる", () => {
      expect(contentHashOf("題", "本文")).not.toBe(
        contentHashOf("題", "別の本文"),
      );
    });

    it("タイトルと本文の境目を取り違えない", () => {
      expect(contentHashOf("ab", "c")).not.toBe(contentHashOf("a", "bc"));
    });

    it("sha256の16進表現を返す", () => {
      expect(contentHashOf("題", "本文")).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("upsertEmbedding / listEmbeddings", () => {
    it("保存したベクトルがそのまま読み戻せる", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      const vector = new Float32Array([0.5, -0.25, 0.125, 0]);
      upsertEmbedding(embeddingFor("note", note.id, { vector }));

      const stored = onlyRow(listEmbeddings(MODEL_ID));

      expect(stored.vector).toBeInstanceOf(Float32Array);
      expect(Array.from(stored.vector)).toEqual([0.5, -0.25, 0.125, 0]);
      expect(stored).toMatchObject({
        entityType: "note",
        entityId: note.id,
        modelId: MODEL_ID,
        contentHash: "hash",
        updatedAt: UPDATED_AT,
      });
    });

    it("同じエンティティに二度保存しても行は増えず、後の内容で置き換わる", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(embeddingFor("note", note.id));
      upsertEmbedding(
        embeddingFor("note", note.id, {
          contentHash: "hash2",
          vector: new Float32Array([1, 2]),
          updatedAt: "2026-08-20T00:00:00.000Z",
        }),
      );

      const stored = listEmbeddings(MODEL_ID);

      expect(stored).toHaveLength(1);
      expect(onlyRow(stored).contentHash).toBe("hash2");
      expect(Array.from(onlyRow(stored).vector)).toEqual([1, 2]);
    });

    it("ノートとタスクは同じidでも別の行として扱う", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      const task = createTask({ title: "題", status: "todo", dueDate: null });
      upsertEmbedding(embeddingFor("note", note.id));
      upsertEmbedding(embeddingFor("task", task.id));

      expect(listEmbeddings(MODEL_ID)).toHaveLength(2);
    });

    it("削除済みのノート・タスクの埋め込みは返さない", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      const task = createTask({ title: "題", status: "todo", dueDate: null });
      upsertEmbedding(embeddingFor("note", note.id));
      upsertEmbedding(embeddingFor("task", task.id));
      softDeleteNote(note.id);
      softDeleteTask(task.id);

      expect(listEmbeddings(MODEL_ID)).toEqual([]);
    });

    it("model_idが一致しない埋め込みは返さない", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(
        embeddingFor("note", note.id, { modelId: OTHER_MODEL_ID }),
      );

      expect(listEmbeddings(MODEL_ID)).toEqual([]);
      expect(listEmbeddings(OTHER_MODEL_ID)).toHaveLength(1);
    });

    it("対応するノートが消えた孤児行は返さない", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(embeddingFor("note", note.id));
      getDb().prepare("DELETE FROM notes WHERE id = ?").run(note.id);

      expect(listEmbeddings(MODEL_ID)).toEqual([]);
    });

    it("埋め込みが1件も無ければ空配列を返す", () => {
      expect(listEmbeddings(MODEL_ID)).toEqual([]);
    });

    it("空のベクトルも往復できる", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(
        embeddingFor("note", note.id, { vector: new Float32Array([]) }),
      );

      expect(Array.from(onlyRow(listEmbeddings(MODEL_ID)).vector)).toEqual([]);
    });
  });

  describe("deleteEmbedding", () => {
    it("指定したエンティティの行だけを消す", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      const task = createTask({ title: "題", status: "todo", dueDate: null });
      upsertEmbedding(embeddingFor("note", note.id));
      upsertEmbedding(embeddingFor("task", task.id));

      deleteEmbedding("note", note.id);

      expect(listEmbeddings(MODEL_ID).map((row) => row.entityType)).toEqual([
        "task",
      ]);
    });

    it("存在しない行を消しても失敗しない", () => {
      expect(() => {
        deleteEmbedding("note", "missing");
      }).not.toThrow();
    });
  });

  describe("listStaleEntities", () => {
    it("まだ索引の無いノートとタスクを本文つきで返す", () => {
      const note = createNote({
        title: "ノートの題",
        body: "ノートの本文",
        tags: [],
      });
      const task = createTask({
        title: "タスクの題",
        status: "todo",
        dueDate: null,
      });

      const stale = listStaleEntities(MODEL_ID);

      expect(stale).toContainEqual({
        entityType: "note",
        entityId: note.id,
        title: "ノートの題",
        body: "ノートの本文",
      });
      expect(stale).toContainEqual({
        entityType: "task",
        entityId: task.id,
        title: "タスクの題",
        body: "",
      });
    });

    it("内容と一致するハッシュで索引済みなら返さない", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(
        embeddingFor("note", note.id, {
          contentHash: contentHashOf("題", "本文"),
        }),
      );

      expect(listStaleEntities(MODEL_ID)).toEqual([]);
    });

    it("本文が変わってハッシュが合わなくなった記録を返す", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(
        embeddingFor("note", note.id, {
          contentHash: contentHashOf("題", "本文"),
        }),
      );
      updateNote(note.id, { body: "書き換えた本文" });

      expect(listStaleEntities(MODEL_ID)).toEqual([
        {
          entityType: "note",
          entityId: note.id,
          title: "題",
          body: "書き換えた本文",
        },
      ]);
    });

    it("別モデルでの索引しか無い記録は未索引として返す", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(
        embeddingFor("note", note.id, {
          modelId: OTHER_MODEL_ID,
          contentHash: contentHashOf("題", "本文"),
        }),
      );

      expect(listStaleEntities(MODEL_ID)).toHaveLength(1);
    });

    it("削除済みの記録は返さない", () => {
      const note = createNote({ title: "題", body: "本文", tags: [] });
      const task = createTask({ title: "題", status: "todo", dueDate: null });
      softDeleteNote(note.id);
      softDeleteTask(task.id);

      expect(listStaleEntities(MODEL_ID)).toEqual([]);
    });

    it("まだ索引の無いノート（束）を概要を本文として返す", () => {
      const notebook = createNotebook({
        title: "ノートの題",
        summary: "ノートの概要",
        tags: [],
      });

      expect(listStaleEntities(MODEL_ID)).toContainEqual({
        entityType: "notebook",
        entityId: notebook.id,
        title: "ノートの題",
        body: "ノートの概要",
      });
    });

    it("概要と一致するハッシュで索引済みのノート（束）は返さない", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(
        embeddingFor("notebook", notebook.id, {
          contentHash: contentHashOf("題", "概要"),
        }),
      );

      expect(listStaleEntities(MODEL_ID)).toEqual([]);
    });

    it("概要が変わったノート（束）を返す", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(
        embeddingFor("notebook", notebook.id, {
          contentHash: contentHashOf("題", "概要"),
        }),
      );
      updateNotebook(notebook.id, { summary: "書き換えた概要" });

      expect(listStaleEntities(MODEL_ID)).toEqual([
        {
          entityType: "notebook",
          entityId: notebook.id,
          title: "題",
          body: "書き換えた概要",
        },
      ]);
    });

    it("削除済みのノート（束）は返さない", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      softDeleteNotebook(notebook.id);

      expect(listStaleEntities(MODEL_ID)).toEqual([]);
    });
  });

  describe("notebook の埋め込み", () => {
    it("保存したノート（束）のベクトルが読み戻せる", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(
        embeddingFor("notebook", notebook.id, {
          vector: new Float32Array([1, -1]),
        }),
      );

      const stored = onlyRow(listEmbeddings(MODEL_ID));

      expect(stored).toMatchObject({
        entityType: "notebook",
        entityId: notebook.id,
      });
      expect(Array.from(stored.vector)).toEqual([1, -1]);
    });

    it("削除済みのノート（束）の埋め込みは返さない", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(embeddingFor("notebook", notebook.id));
      softDeleteNotebook(notebook.id);

      expect(listEmbeddings(MODEL_ID)).toEqual([]);
    });

    it("対応するノート（束）が消えた孤児行は返さない", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(embeddingFor("notebook", notebook.id));
      getDb().prepare("DELETE FROM notebooks WHERE id = ?").run(notebook.id);

      expect(listEmbeddings(MODEL_ID)).toEqual([]);
    });
  });

  describe("deleteOrphanEmbeddings", () => {
    it("物理削除されたノート（束）の行を消し、生きている行は残す", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      const note = createNote({ title: "題", body: "本文", tags: [] });
      upsertEmbedding(embeddingFor("notebook", notebook.id));
      upsertEmbedding(embeddingFor("note", note.id));
      getDb().prepare("DELETE FROM notebooks WHERE id = ?").run(notebook.id);

      expect(deleteOrphanEmbeddings()).toBe(1);
      expect(listEmbeddings(MODEL_ID).map((row) => row.entityType)).toEqual([
        "note",
      ]);
    });

    it("孤児が無ければ1件も消さない", () => {
      const notebook = createNotebook({
        title: "題",
        summary: "概要",
        tags: [],
      });
      upsertEmbedding(embeddingFor("notebook", notebook.id));

      expect(deleteOrphanEmbeddings()).toBe(0);
      expect(listEmbeddings(MODEL_ID)).toHaveLength(1);
    });
  });
});
