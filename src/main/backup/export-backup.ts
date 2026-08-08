import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/db.js";
import { writeZip, type ZipEntry } from "./zip.js";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  DB_ENTRY_PATH,
  IMAGES_ENTRY_PREFIX,
  MANIFEST_ENTRY_PATH,
  type BackupManifest,
} from "./manifest.js";
import type { BackupCounts } from "../../shared/preload-api.js";

export interface BackupPaths {
  dbFilePath: string;
  imagesDirPath: string;
}

export interface BackupArchive {
  archive: Buffer;
  counts: BackupCounts;
}

const isCountRow = (value: unknown): value is { total: number } => {
  if (typeof value !== "object" || value === null) return false;
  const { total }: Record<string, unknown> = { ...value };
  return typeof total === "number";
};

const countRows = (tableName: "notes" | "tasks" | "images"): number => {
  const row: unknown = getDb().prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).get();
  if (!isCountRow(row)) {
    throw new Error(`件数を数えられませんでした: ${tableName}`);
  }
  return row.total;
};

export const readBackupCounts = (): BackupCounts => ({
  notes: countRows("notes"),
  tasks: countRows("tasks"),
  images: countRows("images"),
});

const imageEntries = (imagesDirPath: string): ZipEntry[] => {
  if (!existsSync(imagesDirPath)) return [];
  return readdirSync(imagesDirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      path: `${IMAGES_ENTRY_PREFIX}${entry.name}`,
      data: readFileSync(join(imagesDirPath, entry.name)),
    }));
};

/*
 * DBはファイルをそのまま読む。better-sqlite3の書き込みは同期で、mainプロセスは単一スレッドの
 * ため、ここへ来た時点で書きかけのトランザクションは存在しえない（ジャーナルモードも既定の
 * rollback journal のままで、WALのように未反映の変更が別ファイルに残ることもない）。
 */
export const createBackupArchive = ({ dbFilePath, imagesDirPath }: BackupPaths): BackupArchive => {
  const counts = readBackupCounts();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    counts,
  };
  const archive = writeZip([
    { path: MANIFEST_ENTRY_PATH, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf-8") },
    { path: DB_ENTRY_PATH, data: readFileSync(dbFilePath) },
    ...imageEntries(imagesDirPath),
  ]);
  return { archive, counts };
};
