import type Database from "better-sqlite3";

type DatabaseHandle = Database.Database;

export interface Migration {
  readonly name: string;
  readonly isApplied: (db: DatabaseHandle) => boolean;
  readonly apply: (db: DatabaseHandle) => void;
}

const isColumnRow = (value: unknown): value is { name: string } => {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return typeof row.name === "string";
};

const hasColumn = (db: DatabaseHandle, table: string, column: string): boolean => {
  const rows: unknown[] = db.prepare("SELECT name FROM pragma_table_info(?)").all(table);
  return rows.some((row) => isColumnRow(row) && row.name === column);
};

/*
 * 判定と適用の間に、別プロセスが同じ列を足していることがある（同じDBを2つのプロセスが
 * ほぼ同時に開いたとき）。その場合の "duplicate column name" は目的が既に達成された印なので、
 * 失敗として扱うと後発の起動が丸ごと立ち上がらなくなる。列の有無で見分けて握り潰す。
 */
const addColumnMigration = (table: string, column: string, definition: string): Migration => ({
  name: `add ${table}.${column}`,
  isApplied: (db) => hasColumn(db, table, column),
  apply: (db) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!hasColumn(db, table, column)) throw error;
    }
  },
});

const tableExists = (db: DatabaseHandle, table: string): boolean => {
  const rows: unknown[] = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(table);
  return rows.length > 0;
};

/*
 * CREATE TABLE IF NOT EXISTS is idempotent on its own, so this needs none of the
 * duplicate-name handling addColumnMigration does for concurrent starts.
 */
const createTableMigration = (table: string, ddl: string): Migration => ({
  name: `create ${table}`,
  isApplied: (db) => tableExists(db, table),
  apply: (db) => {
    db.exec(ddl);
  },
});

const EMBEDDINGS_TABLE = `
CREATE TABLE IF NOT EXISTS embeddings (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note','task')),
  entity_id   TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  vector      BLOB NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
)`;

// Each migration decides for itself whether it already ran, rather than a global user_version
// counter: schema.sql creates fresh databases fully up to date, so a version counter would
// have to be bumped in two places and would re-run ALTERs on databases that never needed them.
export const MIGRATIONS: readonly Migration[] = [
  // SQLite requires a DEFAULT when adding a NOT NULL column to a table that may hold rows.
  addColumnMigration("tasks", "body", "TEXT NOT NULL DEFAULT ''"),
  // ノートと同じ形（JSONの文字列）でタスクにもタグを持たせる。既定は空配列。
  addColumnMigration("tasks", "tags", "TEXT NOT NULL DEFAULT '[]'"),
  /*
   * schema.sql の CREATE TABLE IF NOT EXISTS でも既存DBに作られるので、この項目は
   * 単独では効き目が無い。docs/MIGRATIONS.md の「スキーマを変えたら両方書く」に揃え、
   * schema.sql 側からこの表の定義が消えたときに既存DBが取り残されないようにしておく。
   */
  createTableMigration("embeddings", EMBEDDINGS_TABLE),
];

export const applyMigrations = (db: DatabaseHandle): void => {
  MIGRATIONS.forEach((migration) => {
    if (migration.isApplied(db)) return;
    try {
      migration.apply(db);
    } catch (error) {
      throw new Error(`Migration "${migration.name}" failed: ${String(error)}`);
    }
  });
};
