import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { MIGRATIONS } from "../../../src/main/db/migrations";

const LEGACY_TASKS_TABLE = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const LEGACY_TASK_ID = "legacy-task-1";
const LEGACY_TIMESTAMP = "2026-08-01T00:00:00.000Z";

/* v2.0.x が配布していた形。notebooks も notes.notebook_id も note_versions.entity_type も無い。 */
const V2_0_TABLES = `
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  due_date TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL
);
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL
);
`;

const V2_0_NOTE_ID = "legacy-note-1";
const V2_0_VERSION_ID = "legacy-version-1";

/* T56 以前の embeddings。entity_type は 'note'/'task' しか受け付けない。 */
const LEGACY_EMBEDDINGS_TABLE = `
CREATE TABLE embeddings (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task')),
  entity_id   TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector      BLOB NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
`;

const LEGACY_MODEL_ID = "ruri-v3-70m-q8_0";

const vectorBuffer = (values: number[]): Buffer => {
  const vector = new Float32Array(values);
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
};

const insertLegacyEmbeddings = (db: Database.Database): void => {
  const insert = db.prepare(
    "INSERT INTO embeddings (entity_type, entity_id, model_id, content_hash, vector, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    "note",
    V2_0_NOTE_ID,
    LEGACY_MODEL_ID,
    "note-hash",
    vectorBuffer([0.5, -0.25, 0.125, 0]),
    LEGACY_TIMESTAMP,
  );
  insert.run(
    "task",
    LEGACY_TASK_ID,
    LEGACY_MODEL_ID,
    "task-hash",
    vectorBuffer([1, 2, 3.5, -4.25]),
    LEGACY_TIMESTAMP,
  );
};

const createDbWithLegacyEmbeddings = (dbFilePath: string): void => {
  const legacy = new Database(dbFilePath);
  legacy.exec(V2_0_TABLES);
  legacy.exec(LEGACY_EMBEDDINGS_TABLE);
  insertV2_0Rows(legacy);
  insertLegacyEmbeddings(legacy);
  legacy.close();
};

/* hex() でBLOBまで含めて突き合わせるので、ベクトルが1ビットでも変われば落ちる。 */
const EMBEDDINGS_DUMP_SQL = `
  SELECT entity_type, entity_id, model_id, content_hash, hex(vector) AS vector_hex, updated_at
    FROM embeddings ORDER BY entity_type, entity_id`;

const dumpEmbeddings = (db: Database.Database): unknown[] =>
  db.prepare(EMBEDDINGS_DUMP_SQL).all();

const dumpEmbeddingsFromFile = (dbFilePath: string): unknown[] => {
  const db = new Database(dbFilePath);
  try {
    return dumpEmbeddings(db);
  } finally {
    db.close();
  }
};

const tableSql = (table: string): string => {
  const row: unknown = getDb()
    .prepare("SELECT sql AS sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  if (typeof row !== "object" || row === null || !("sql" in row)) {
    throw new Error(`No DDL found for table ${table}`);
  }
  return String(row.sql);
};

const NOTEBOOK_ENTITY_CHECK = "'note','task','notebook'";

const insertV2_0Rows = (db: Database.Database): void => {
  db.prepare(
    "INSERT INTO notes (id, title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(V2_0_NOTE_ID, "旧ノート", "本文", '["既存"]', LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
  db.prepare(
    "INSERT INTO note_versions (id, note_id, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(V2_0_VERSION_ID, V2_0_NOTE_ID, "旧ノート", "前の本文", '["既存"]', LEGACY_TIMESTAMP);
  db.prepare(
    "INSERT INTO tasks (id, title, body, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(LEGACY_TASK_ID, "旧タスク", "", "[]", "todo", LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
  db.prepare("INSERT INTO links (id, from_type, from_id, to_type, to_id) VALUES (?, ?, ?, ?, ?)").run(
    "legacy-link-1",
    "note",
    V2_0_NOTE_ID,
    "task",
    LEGACY_TASK_ID,
  );
};

const createV2_0DbFile = (dbFilePath: string): void => {
  const legacy = new Database(dbFilePath);
  legacy.exec(V2_0_TABLES);
  insertV2_0Rows(legacy);
  legacy.close();
};

const createLegacyDbFile = (dbFilePath: string): void => {
  const legacy = new Database(dbFilePath);
  legacy.exec(LEGACY_TASKS_TABLE);
  legacy
    .prepare(
      "INSERT INTO tasks (id, title, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(LEGACY_TASK_ID, "旧タスク", "todo", "2026-08-10", LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
  legacy.close();
};

const tableExists = (table: string): boolean => {
  const rows: unknown[] = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(table);
  return rows.length > 0;
};

const columnNames = (table: string): string[] => {
  const rows: unknown[] = getDb().prepare("SELECT name FROM pragma_table_info(?)").all(table);
  return rows.map((row) => {
    if (typeof row !== "object" || row === null || !("name" in row)) {
      throw new Error("Unexpected pragma_table_info row shape");
    }
    return String(row.name);
  });
};

const NOTEBOOK_RELATED_TABLES = ["notes", "note_versions", "notebooks"];

const tableInfo = (table: string): unknown[] =>
  getDb().prepare("SELECT * FROM pragma_table_info(?)").all(table);

describe("migrations", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-migration-test-${randomUUID()}.sqlite3`);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("body列を持たない既存DBを開くとtasks.bodyが追加される", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("body");
  });

  it("body列の追加で既存のタスク行が失われず、bodyは空文字になる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    expect(row).toMatchObject({
      id: LEGACY_TASK_ID,
      title: "旧タスク",
      status: "todo",
      due_date: "2026-08-10",
      created_at: LEGACY_TIMESTAMP,
      body: "",
    });
  });

  it("tags列を持たない既存DBを開くとtasks.tagsが追加される", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("tags");
  });

  it("tags列の追加で既存のタスク行が失われず、tagsは空配列になる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    // ノートと同じくJSONの文字列として持つ。空配列の既定値なら、既存行もそのまま読める。
    expect(row).toMatchObject({ id: LEGACY_TASK_ID, title: "旧タスク", tags: "[]" });
  });

  it("embeddingsテーブルを持たない既存DBを開くと作られる", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);

    expect(tableExists("embeddings")).toBe(true);
  });

  it("embeddingsテーブルの追加で既存のタスク行が失われない", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    const row: unknown = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID);

    expect(row).toMatchObject({ id: LEGACY_TASK_ID, title: "旧タスク" });
  });

  it("新規DBでもembeddingsテーブルが存在する", () => {
    openDb(dbFilePath);

    expect(tableExists("embeddings")).toBe(true);
  });

  it("同じDBを二度開いてもマイグレーションは失敗しない", () => {
    createLegacyDbFile(dbFilePath);

    openDb(dbFilePath);
    closeDb();

    expect(() => openDb(dbFilePath)).not.toThrow();
    expect(columnNames("tasks")).toContain("body");
    expect(tableExists("embeddings")).toBe(true);
  });

  it("新規DBでもtasks.bodyが存在する", () => {
    openDb(dbFilePath);

    expect(columnNames("tasks")).toContain("body");
  });

  /*
   * 二重起動すると、2つのプロセスが「未適用」と判定したあとで両方が適用を実行する。
   * 後発の apply は既に適用済みのDBに当たるので、ここで例外になると後発の起動が丸ごと失敗する。
   */
  it("適用済みのDBに対してapplyを実行しても失敗しない", () => {
    openDb(dbFilePath);
    const db = getDb();

    MIGRATIONS.forEach((migration) => {
      expect(() => {
        migration.apply(db);
      }, migration.name).not.toThrow();
    });
  });

  it("v2.0.x相当のDBを開くとnotebooks・notes.notebook_id・note_versions.entity_typeが揃う", () => {
    createV2_0DbFile(dbFilePath);

    openDb(dbFilePath);

    expect(tableExists("notebooks")).toBe(true);
    expect(columnNames("notes")).toContain("notebook_id");
    expect(columnNames("note_versions")).toContain("entity_type");
  });

  it("v2.0.x相当のDBの既存行が全て残り、追加列は既定値で読める", () => {
    createV2_0DbFile(dbFilePath);

    openDb(dbFilePath);

    expect(getDb().prepare("SELECT * FROM notes WHERE id = ?").get(V2_0_NOTE_ID)).toMatchObject({
      title: "旧ノート",
      body: "本文",
      tags: '["既存"]',
      // NULL = 無所属ページ。既存ページが勝手にノートへ入れられていないこと。
      notebook_id: null,
    });
    expect(
      getDb().prepare("SELECT * FROM note_versions WHERE id = ?").get(V2_0_VERSION_ID),
    ).toMatchObject({ note_id: V2_0_NOTE_ID, body: "前の本文", entity_type: "note" });
    expect(getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(LEGACY_TASK_ID)).toMatchObject({
      title: "旧タスク",
    });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 1 });
  });

  it("v2.0.x相当のDBを二度開いてもマイグレーションは失敗しない", () => {
    createV2_0DbFile(dbFilePath);

    openDb(dbFilePath);
    closeDb();

    expect(() => openDb(dbFilePath)).not.toThrow();
    expect(tableExists("notebooks")).toBe(true);
    expect(columnNames("notes")).toContain("notebook_id");
    expect(columnNames("note_versions")).toContain("entity_type");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM notes").get()).toMatchObject({ n: 1 });
  });

  it("新規DBとアップグレードしたDBでnotes・note_versions・notebooksの形が一致する", () => {
    const freshDbFilePath = join(tmpdir(), `hanamask-migration-fresh-${randomUUID()}.sqlite3`);
    try {
      openDb(freshDbFilePath);
      const fresh = NOTEBOOK_RELATED_TABLES.map(tableInfo);
      closeDb();

      createV2_0DbFile(dbFilePath);
      openDb(dbFilePath);

      expect(NOTEBOOK_RELATED_TABLES.map(tableInfo)).toEqual(fresh);
    } finally {
      rmSync(freshDbFilePath, { force: true });
    }
  });

  it("旧embeddingsを持つDBを開くと既存のベクトルが1件も失われずbit単位で一致する", () => {
    createDbWithLegacyEmbeddings(dbFilePath);
    const before = dumpEmbeddingsFromFile(dbFilePath);

    openDb(dbFilePath);

    expect(dumpEmbeddings(getDb())).toEqual(before);
    expect(before).toHaveLength(2);
  });

  it("作り直し後のembeddingsはnotebookの行を受け付ける", () => {
    createDbWithLegacyEmbeddings(dbFilePath);

    openDb(dbFilePath);

    expect(tableSql("embeddings")).toContain(NOTEBOOK_ENTITY_CHECK);
    expect(() => {
      getDb()
        .prepare(
          "INSERT INTO embeddings (entity_type, entity_id, model_id, content_hash, vector, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("notebook", "nb-1", LEGACY_MODEL_ID, "hash", vectorBuffer([1]), LEGACY_TIMESTAMP);
    }).not.toThrow();
  });

  it("旧embeddingsを持つDBを二度開いてもベクトルが保たれる", () => {
    createDbWithLegacyEmbeddings(dbFilePath);

    openDb(dbFilePath);
    const afterFirstOpen = dumpEmbeddings(getDb());
    closeDb();

    expect(() => openDb(dbFilePath)).not.toThrow();
    expect(dumpEmbeddings(getDb())).toEqual(afterFirstOpen);
  });

  it("新規DBとアップグレードしたDBでembeddingsの形とCHECKが一致する", () => {
    const freshDbFilePath = join(tmpdir(), `hanamask-migration-fresh-${randomUUID()}.sqlite3`);
    try {
      openDb(freshDbFilePath);
      const freshColumns = tableInfo("embeddings");
      const freshSql = tableSql("embeddings");
      closeDb();

      createDbWithLegacyEmbeddings(dbFilePath);
      openDb(dbFilePath);

      expect(tableInfo("embeddings")).toEqual(freshColumns);
      expect(freshSql).toContain(NOTEBOOK_ENTITY_CHECK);
      expect(tableSql("embeddings")).toContain(NOTEBOOK_ENTITY_CHECK);
    } finally {
      rmSync(freshDbFilePath, { force: true });
    }
  });

  /* 既定値の0だと、他プロセスがDBを掴んでいる一瞬に当たっただけで起動が失敗する。 */
  it("ロック競合を待てるようbusy_timeoutを設定する", () => {
    openDb(dbFilePath);

    expect(getDb().pragma("busy_timeout", { simple: true })).toBeGreaterThan(0);
  });
});
