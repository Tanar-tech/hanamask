import type { BackupCounts } from "../../shared/preload-api.js";

/*
 * 書庫の中身の取り決め。人が開いて中身が分かる素直な構成にしてある。
 *
 *   manifest.json        形式・版・書き出し日時・件数
 *   db/hanamask.sqlite3  DB本体
 *   images/<ファイル名>   userData/images の中身
 *
 * APIキーを持つ chat-settings.json は含めない（T35の禁止事項）。
 */
export const BACKUP_FORMAT = "hanamask-backup";
// 構成を変えたら上げる。取り込み側が古い書庫と新しすぎる書庫を見分けるための唯一の手掛かり。
export const BACKUP_FORMAT_VERSION = 1;

export const MANIFEST_ENTRY_PATH = "manifest.json";
export const DB_ENTRY_PATH = "db/hanamask.sqlite3";
export const IMAGES_ENTRY_PREFIX = "images/";

export interface BackupManifest {
  format: string;
  version: number;
  exportedAt: string;
  counts: BackupCounts;
}

const isBackupCounts = (value: unknown): value is BackupCounts => {
  if (typeof value !== "object" || value === null) return false;
  const { notes, tasks, images }: Record<string, unknown> = { ...value };
  return typeof notes === "number" && typeof tasks === "number" && typeof images === "number";
};

const isBackupManifest = (value: unknown): value is BackupManifest => {
  if (typeof value !== "object" || value === null) return false;
  const { format, version, exportedAt, counts }: Record<string, unknown> = { ...value };
  return (
    typeof format === "string" &&
    typeof version === "number" &&
    typeof exportedAt === "string" &&
    isBackupCounts(counts)
  );
};

export const parseManifest = (data: Buffer): BackupManifest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString("utf-8"));
  } catch (cause) {
    throw new Error(`書庫の情報ファイルを読めません: ${String(cause)}`);
  }
  if (!isBackupManifest(parsed)) {
    throw new Error("書庫の情報ファイルの形式が想定と違います");
  }
  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error(`hanamaskの書庫ではありません: ${parsed.format}`);
  }
  if (parsed.version > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `新しい形式の書庫です（版 ${String(parsed.version)}）。hanamaskを更新してください`,
    );
  }
  return parsed;
};

/*
 * Windowsで書き出した書庫をmacOS/Linuxで取り込むと、DBに入っているのは "C:\...\images\x.png"。
 * node:path の basename は動作中のOSの区切りしか見ないため、両方の区切りで切る。
 */
export const fileNameOf = (path: string): string => path.split(/[/\\]/).at(-1) ?? "";
