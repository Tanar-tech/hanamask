import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote, getNote, listNoteVersions } from "../../../src/main/db/notes-repo";
import { listNotebooks } from "../../../src/main/db/notebooks-repo";
import { applyBackupArchive } from "../../../src/main/backup/import-backup";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  DB_ENTRY_PATH,
  MANIFEST_ENTRY_PATH,
} from "../../../src/main/backup/manifest";
import { writeZip } from "../../../src/main/backup/zip";

/* v2.0.x が書き出した書庫の中身。notebooks も notes.notebook_id も note_versions.entity_type も無い。 */
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

const LEGACY_TIMESTAMP = "2026-08-01T00:00:00.000Z";
const LEGACY_NOTE_ID = "legacy-note-1";
const LEGACY_NOTE_TITLE = "v2.0.xのノート";
const LEGACY_VERSION_ID = "legacy-version-1";

const insertLegacyRows = (db: Database.Database): void => {
  db.prepare(
    "INSERT INTO notes (id, title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(LEGACY_NOTE_ID, LEGACY_NOTE_TITLE, "本文", '["既存"]', LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
  db.prepare(
    "INSERT INTO note_versions (id, note_id, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(LEGACY_VERSION_ID, LEGACY_NOTE_ID, LEGACY_NOTE_TITLE, "前の本文", '["既存"]', LEGACY_TIMESTAMP);
  db.prepare(
    "INSERT INTO tasks (id, title, body, tags, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run("legacy-task-1", "旧タスク", "", "[]", "todo", LEGACY_TIMESTAMP, LEGACY_TIMESTAMP);
};

const buildLegacyDatabaseBytes = (workDirPath: string): Buffer => {
  const legacyDbPath = join(workDirPath, "legacy.sqlite3");
  const legacy = new Database(legacyDbPath);
  legacy.exec(V2_0_TABLES);
  insertLegacyRows(legacy);
  legacy.close();
  return readFileSync(legacyDbPath);
};

const buildLegacyArchive = (workDirPath: string): Buffer =>
  writeZip([
    {
      path: MANIFEST_ENTRY_PATH,
      data: Buffer.from(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: BACKUP_FORMAT_VERSION,
          exportedAt: LEGACY_TIMESTAMP,
          counts: { notes: 1, tasks: 1, images: 0 },
        }),
      ),
    },
    { path: DB_ENTRY_PATH, data: buildLegacyDatabaseBytes(workDirPath) },
  ]);

const columnNames = (table: string): string[] => {
  const rows: unknown[] = getDb().prepare("SELECT name FROM pragma_table_info(?)").all(table);
  return rows.map((row) => {
    if (typeof row !== "object" || row === null || !("name" in row)) {
      throw new Error(`Unexpected pragma_table_info row for ${table}`);
    }
    return String(row.name);
  });
};

describe("v2.0.x の書庫の取り込み", () => {
  let rootDirPath: string;
  let destination: { dbFilePath: string; imagesDirPath: string; backupsDirPath: string };
  let archive: Buffer;

  beforeEach(() => {
    rootDirPath = mkdtempSync(join(tmpdir(), "hanamask-legacy-import-"));
    const imagesDirPath = join(rootDirPath, "images");
    mkdirSync(imagesDirPath);
    destination = {
      dbFilePath: join(rootDirPath, "hanamask.sqlite3"),
      imagesDirPath,
      backupsDirPath: join(rootDirPath, "backups"),
    };
    archive = buildLegacyArchive(rootDirPath);
    openDb(destination.dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(rootDirPath, { recursive: true, force: true });
  });

  it("notebooks を含まない書庫を取り込め、既存の記録が残る", () => {
    const { counts } = applyBackupArchive(archive, destination);

    expect(counts).toEqual({ notes: 1, tasks: 1, images: 0 });
    expect(getNote(LEGACY_NOTE_ID)?.title).toBe(LEGACY_NOTE_TITLE);
    expect(listNoteVersions(LEGACY_NOTE_ID).map((version) => version.id)).toEqual([
      LEGACY_VERSION_ID,
    ]);
  });

  /* 取り込みはDBファイルごと置き換えるので、器を追いつかせるのは開き直しの側の仕事。 */
  it("取り込み後に開き直すとマイグレーションが器を追いつかせる", () => {
    applyBackupArchive(archive, destination);
    closeDb();
    openDb(destination.dbFilePath);

    expect(columnNames("notebooks")).toContain("summary");
    expect(columnNames("notes")).toContain("notebook_id");
    expect(columnNames("note_versions")).toContain("entity_type");
    expect(getNote(LEGACY_NOTE_ID)?.title).toBe(LEGACY_NOTE_TITLE);
    expect(listNotebooks()).toEqual([]);
  });

  it("取り込んだ旧DBの上でノートを作れる", () => {
    applyBackupArchive(archive, destination);
    closeDb();
    openDb(destination.dbFilePath);

    const page = createNote({ title: "取り込み後のページ", body: "本文", tags: [] });

    expect(getNote(page.id)?.title).toBe("取り込み後のページ");
  });

  /*
   * notebooks を必須の表に足すと、v2.0.x の書庫がすべて「hanamaskの表がありません」で
   * 弾かれる。取り込みの検証は旧形式でも通る表だけを見ていること。
   */
  it("取り込みの必須表に notebooks を入れていない", () => {
    const source = readFileSync(
      new URL("../../../src/main/backup/import-backup.ts", import.meta.url),
      "utf-8",
    );
    const declaration = /const REQUIRED_TABLE_NAMES = \[(?<names>[^\]]*)\]/u.exec(source);

    expect(declaration?.groups?.names).toBeDefined();
    expect(declaration?.groups?.names).not.toContain("notebooks");
  });
});
