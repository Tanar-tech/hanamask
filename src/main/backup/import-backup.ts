import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { closeDb, getDb, openDb } from "../db/db.js";
import { readZip, type ZipEntry } from "./zip.js";
import { createBackupArchive, readBackupCounts, type BackupPaths } from "./export-backup.js";
import {
  DB_ENTRY_PATH,
  IMAGES_ENTRY_PREFIX,
  MANIFEST_ENTRY_PATH,
  fileNameOf,
  parseManifest,
} from "./manifest.js";
import type { BackupCounts } from "../../shared/preload-api.js";

export interface ImportPaths extends BackupPaths {
  /** 取り込み直前の状態を退避する先。誤って取り込んだときはここから戻す。 */
  backupsDirPath: string;
}

export interface ImportOutcome {
  counts: BackupCounts;
  safetyCopyPath: string;
}

const SAFETY_COPY_PREFIX = "pre-import-";
// 画像ディレクトリの隣に作る作業用の置き場。入れ替えをrenameで済ませるため同じ親に置く。
const STAGING_SUFFIX = ".importing";
const REPLACED_SUFFIX = ".replaced";
// 開いたDBが本当にhanamaskのものかを、取り込む前に確かめるための表。
const REQUIRED_TABLE_NAMES = ["notes", "note_versions", "tasks", "images", "links"];
// 中身だけ差し替えたのに旧DBのジャーナルが残っていると、次に開いたときに巻き戻される。
const DB_SIDECAR_SUFFIXES = ["-journal", "-wal", "-shm"];

const findEntry = (entries: readonly ZipEntry[], path: string): ZipEntry => {
  const found = entries.find((entry) => entry.path === path);
  if (found === undefined) {
    throw new Error(`書庫に ${path} が見つかりません`);
  }
  return found;
};

const isNameRow = (value: unknown): value is { name: string } => {
  if (typeof value !== "object" || value === null) return false;
  const { name }: Record<string, unknown> = { ...value };
  return typeof name === "string";
};

const isIntegrityRow = (value: unknown): value is { integrity_check: string } => {
  if (typeof value !== "object" || value === null) return false;
  const { integrity_check: result }: Record<string, unknown> = { ...value };
  return typeof result === "string";
};

const assertHanamaskDatabase = (db: Database.Database): void => {
  const integrity: unknown = db.prepare("PRAGMA integrity_check").get();
  if (!isIntegrityRow(integrity) || integrity.integrity_check !== "ok") {
    throw new Error("書庫の中のデータベースが壊れています");
  }
  const rows: unknown[] = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const tableNames = new Set(rows.filter(isNameRow).map((row) => row.name));
  const missing = REQUIRED_TABLE_NAMES.filter((name) => !tableNames.has(name));
  if (missing.length > 0) {
    throw new Error(`書庫の中のデータベースにhanamaskの表がありません: ${missing.join(", ")}`);
  }
};

/* 取り込み先に触る前に、書庫のDBを一時ファイルへ出して開けるかどうかまで確かめる。 */
const verifyDatabaseBytes = (data: Buffer): void => {
  const probeDirPath = mkdtempSync(join(tmpdir(), "hanamask-import-check-"));
  const probeFilePath = join(probeDirPath, "probe.sqlite3");
  try {
    writeFileSync(probeFilePath, data);
    const db = new Database(probeFilePath, { readonly: true });
    try {
      assertHanamaskDatabase(db);
    } finally {
      db.close();
    }
  } catch (cause) {
    throw new Error(`書庫の中のデータベースを読めません: ${String(cause)}`);
  } finally {
    rmSync(probeDirPath, { recursive: true, force: true });
  }
};

const writeSafetyCopy = ({ backupsDirPath, ...source }: ImportPaths): string => {
  const { archive } = createBackupArchive(source);
  mkdirSync(backupsDirPath, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyCopyPath = join(backupsDirPath, `${SAFETY_COPY_PREFIX}${stamp}.zip`);
  writeFileSync(safetyCopyPath, archive);
  return safetyCopyPath;
};

const stagingDirPathFor = (imagesDirPath: string): string => `${imagesDirPath}${STAGING_SUFFIX}`;
const replacedDirPathFor = (imagesDirPath: string): string => `${imagesDirPath}${REPLACED_SUFFIX}`;

/* 取り込みが途中で落ちて作業用ディレクトリが残ると、以後ずっとuserDataに居座る。 */
export const removeImportLeftovers = (imagesDirPath: string): void => {
  [stagingDirPathFor(imagesDirPath), replacedDirPathFor(imagesDirPath)].forEach((path) => {
    rmSync(path, { recursive: true, force: true });
  });
};

const writeImagesTo = (entries: readonly ZipEntry[], dirPath: string): void => {
  mkdirSync(dirPath, { recursive: true });
  entries
    .filter((entry) => entry.path.startsWith(IMAGES_ENTRY_PREFIX))
    .forEach((entry) => {
      writeFileSync(join(dirPath, fileNameOf(entry.path)), entry.data);
    });
};

/*
 * 先に消してから書くと、書き込みが途中で失敗したときに旧画像だけが失われる（DBの差し替えは
 * この後なので、旧DBは残ったまま全ノートの画像がリンク切れになる）。別の場所へ書き切ってから
 * 入れ替えることで、どこで失敗しても旧画像が残るようにする。
 */
const replaceImages = (entries: readonly ZipEntry[], imagesDirPath: string): void => {
  const stagingDirPath = stagingDirPathFor(imagesDirPath);
  const replacedDirPath = replacedDirPathFor(imagesDirPath);
  removeImportLeftovers(imagesDirPath);
  try {
    writeImagesTo(entries, stagingDirPath);
  } catch (cause) {
    rmSync(stagingDirPath, { recursive: true, force: true });
    throw new Error(`書庫の画像を展開できません: ${String(cause)}`);
  }
  const hadImages = existsSync(imagesDirPath);
  if (hadImages) renameSync(imagesDirPath, replacedDirPath);
  try {
    renameSync(stagingDirPath, imagesDirPath);
  } catch (cause) {
    if (hadImages) renameSync(replacedDirPath, imagesDirPath);
    rmSync(stagingDirPath, { recursive: true, force: true });
    throw new Error(`画像の入れ替えに失敗しました: ${String(cause)}`);
  }
  rmSync(replacedDirPath, { recursive: true, force: true });
};

/*
 * DBを直接上書きすると、書き込みの途中で強制終了された場合に中途半端なファイルが
 * 残る。sidecar(-wal 等)も消しているのでSQLiteの自動復旧も効かず、次の起動で開けなく
 * なる。画像と同じく、一時ファイルへ書き切ってから置き換える。
 */
const IMPORTING_SUFFIX = ".importing";

const replaceDatabase = (data: Buffer, dbFilePath: string): void => {
  closeDb();
  DB_SIDECAR_SUFFIXES.forEach((suffix) => {
    rmSync(`${dbFilePath}${suffix}`, { force: true });
  });
  mkdirSync(dirname(dbFilePath), { recursive: true });
  const importingPath = `${dbFilePath}${IMPORTING_SUFFIX}`;
  // 前回の取り込みが中断していれば書きかけが残っている。上書きせず消してから作る。
  rmSync(importingPath, { force: true });
  try {
    writeFileSync(importingPath, data);
    renameSync(importingPath, dbFilePath);
  } catch (cause) {
    rmSync(importingPath, { force: true });
    openDb(dbFilePath);
    throw new Error(`データベースの入れ替えに失敗しました: ${String(cause)}`);
  }
  openDb(dbFilePath);
};

const isImagePathRow = (value: unknown): value is { id: string; file_path: string } => {
  if (typeof value !== "object" || value === null) return false;
  const { id, file_path: filePath }: Record<string, unknown> = { ...value };
  return typeof id === "string" && typeof filePath === "string";
};

/*
 * DBには画像の絶対パスが入っている。別PCではuserDataの場所が変わるため、貼り直さないと
 * 取り込んだ全画像が壊れたリンクになる。展開先は分かっているので一律で付け替える。
 */
const rewriteImagePaths = (imagesDirPath: string): void => {
  const db = getDb();
  const rows: unknown[] = db.prepare("SELECT id, file_path FROM images").all();
  const update = db.prepare("UPDATE images SET file_path = ? WHERE id = ?");
  db.transaction(() => {
    rows.forEach((row) => {
      if (!isImagePathRow(row)) {
        throw new Error("取り込んだ画像レコードの形が想定と違います");
      }
      update.run(join(imagesDirPath, fileNameOf(row.file_path)), row.id);
    });
  })();
};

/*
 * 取り込みは「置換」。書庫は移行・復旧のために書き出した完全な状態なので、既存とマージすると
 * idの衝突や履歴の二重化が起きて、どちらの状態でもないDBができる。代わりに、置き換える前の
 * 状態を必ず書庫として退避し、誤って実行しても戻せるようにしてある。
 *
 * 呼ぶ前に取り込み先のDBが開いている必要がある（退避のために現状を読む）。
 */
export const applyBackupArchive = (archive: Buffer, paths: ImportPaths): ImportOutcome => {
  const entries = readZip(archive);
  parseManifest(findEntry(entries, MANIFEST_ENTRY_PATH).data);
  const databaseBytes = findEntry(entries, DB_ENTRY_PATH).data;
  verifyDatabaseBytes(databaseBytes);

  const safetyCopyPath = writeSafetyCopy(paths);
  replaceImages(entries, paths.imagesDirPath);
  replaceDatabase(databaseBytes, paths.dbFilePath);
  rewriteImagePaths(paths.imagesDirPath);
  return { counts: readBackupCounts(), safetyCopyPath };
};
