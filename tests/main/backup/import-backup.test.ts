import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb, openDb } from "../../../src/main/db/db";
import { createNote, listNoteVersions, searchNotes, updateNote } from "../../../src/main/db/notes-repo";
import { createTask, listTasks } from "../../../src/main/db/tasks-repo";
import { createImage, listImages } from "../../../src/main/db/images-repo";
import { createLink, listLinks } from "../../../src/main/db/links-repo";
import { createBackupArchive } from "../../../src/main/backup/export-backup";
import { applyBackupArchive } from "../../../src/main/backup/import-backup";
import {
  BACKUP_FORMAT,
  DB_ENTRY_PATH,
  MANIFEST_ENTRY_PATH,
} from "../../../src/main/backup/manifest";
import { readZip, writeZip } from "../../../src/main/backup/zip";

const IMAGE_FILE_NAME = "picture.png";
const IMAGE_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SOURCE_NOTE_TITLE = "移行元のノート";
const DESTINATION_NOTE_TITLE = "取り込み先にもとからあるノート";

interface Env {
  rootDirPath: string;
  dbFilePath: string;
  imagesDirPath: string;
  backupsDirPath: string;
}

const makeEnv = (label: string): Env => {
  const rootDirPath = mkdtempSync(join(tmpdir(), `hanamask-${label}-`));
  const imagesDirPath = join(rootDirPath, "images");
  mkdirSync(imagesDirPath);
  return {
    rootDirPath,
    dbFilePath: join(rootDirPath, "hanamask.sqlite3"),
    imagesDirPath,
    backupsDirPath: join(rootDirPath, "backups"),
  };
};

describe("import-backup", () => {
  let source: Env;
  let destination: Env;

  /** 移行元でノート・履歴・タスク・タグ・リンク・画像を一通り作り、書庫にして返す。 */
  const buildSourceArchive = (): Buffer => {
    openDb(source.dbFilePath);
    const note = createNote({ title: "書き換え前", body: "初版", tags: ["移行"] });
    updateNote(note.id, { title: SOURCE_NOTE_TITLE, body: "第2版" });
    const task = createTask({ title: "移行元のタスク", status: "in_progress", dueDate: null });
    createLink({ fromType: "note", fromId: note.id, toType: "task", toId: task.id });
    writeFileSync(join(source.imagesDirPath, IMAGE_FILE_NAME), IMAGE_BYTES);
    createImage({
      noteId: note.id,
      filePath: join(source.imagesDirPath, IMAGE_FILE_NAME),
      mimeType: "image/png",
    });
    const { archive } = createBackupArchive(source);
    closeDb();
    return archive;
  };

  const openDestinationWithOwnData = (): void => {
    openDb(destination.dbFilePath);
    createNote({ title: DESTINATION_NOTE_TITLE, body: "消えては困る", tags: [] });
    writeFileSync(join(destination.imagesDirPath, "existing.png"), Buffer.from([9, 9]));
  };

  beforeEach(() => {
    source = makeEnv("import-source");
    destination = makeEnv("import-destination");
  });

  afterEach(() => {
    closeDb();
    rmSync(source.rootDirPath, { recursive: true, force: true });
    rmSync(destination.rootDirPath, { recursive: true, force: true });
  });

  it("ノート・編集履歴・タスク・タグ・リンク・画像を復元する", () => {
    const archive = buildSourceArchive();
    openDestinationWithOwnData();

    applyBackupArchive(archive, destination);

    const [note] = searchNotes("");
    expect(note?.title).toBe(SOURCE_NOTE_TITLE);
    expect(note?.tags).toEqual(["移行"]);
    expect(listNoteVersions(note?.id ?? "").map((version) => version.title)).toEqual(["書き換え前"]);
    expect(listTasks().map((task) => task.title)).toEqual(["移行元のタスク"]);
    expect(listLinks("note", note?.id ?? "")).toHaveLength(1);
    expect(listImages(note?.id ?? "")).toHaveLength(1);
  });

  /* 本タスクの肝。別PCではuserDataの場所が変わるため、絶対パスのまま取り込むと画像が全滅する。 */
  it("画像を取り込み先へ展開し、DBのパスを取り込み先のものに貼り直す", () => {
    const archive = buildSourceArchive();
    openDestinationWithOwnData();

    applyBackupArchive(archive, destination);

    const [note] = searchNotes("");
    const [image] = listImages(note?.id ?? "");
    expect(image?.filePath).toBe(join(destination.imagesDirPath, IMAGE_FILE_NAME));
    expect(image?.filePath).not.toContain(source.rootDirPath);
    expect(image?.fileUrl).toContain(IMAGE_FILE_NAME);
    expect(readFileSync(join(destination.imagesDirPath, IMAGE_FILE_NAME))).toEqual(IMAGE_BYTES);
  });

  it("Windowsで書き出した書庫の円記号パスも貼り直せる", () => {
    buildSourceArchive();
    openDestinationWithOwnData();
    // 移行元がWindowsだった場合、DBに入っているのは "C:\Users\...\images\picture.png"。
    openDb(source.dbFilePath);
    getDb()
      .prepare("UPDATE images SET file_path = ?")
      .run(`C:\\Users\\someone\\AppData\\Roaming\\hanamask\\images\\${IMAGE_FILE_NAME}`);
    const { archive: windowsArchive } = createBackupArchive(source);
    closeDb();
    openDb(destination.dbFilePath);

    applyBackupArchive(windowsArchive, destination);

    const [note] = searchNotes("");
    expect(listImages(note?.id ?? "")[0]?.filePath).toBe(
      join(destination.imagesDirPath, IMAGE_FILE_NAME),
    );
  });

  /* 禁止事項「既存のデータを黙って上書きしない」の担保。取り込み直前の状態を書庫に残す。 */
  it("取り込み前の状態を退避し、そこから元に戻せる", () => {
    const archive = buildSourceArchive();
    openDestinationWithOwnData();

    const { safetyCopyPath } = applyBackupArchive(archive, destination);
    expect(existsSync(safetyCopyPath)).toBe(true);

    applyBackupArchive(readFileSync(safetyCopyPath), destination);

    expect(searchNotes("").map((note) => note.title)).toEqual([DESTINATION_NOTE_TITLE]);
    expect(existsSync(join(destination.imagesDirPath, "existing.png"))).toBe(true);
  });

  it("取り込むと既存のデータは書庫の内容に置き換わる", () => {
    const archive = buildSourceArchive();
    openDestinationWithOwnData();

    const { counts } = applyBackupArchive(archive, destination);

    expect(searchNotes("").map((note) => note.title)).toEqual([SOURCE_NOTE_TITLE]);
    expect(counts).toEqual({ notes: 1, tasks: 1, images: 1 });
    expect(existsSync(join(destination.imagesDirPath, "existing.png"))).toBe(false);
  });

  const expectDestinationUntouched = (): void => {
    expect(searchNotes("").map((note) => note.title)).toEqual([DESTINATION_NOTE_TITLE]);
    expect(existsSync(join(destination.imagesDirPath, "existing.png"))).toBe(true);
    expect(existsSync(destination.backupsDirPath)).toBe(false);
  };

  it("ZIPですらないファイルを渡されてもDBを壊さない", () => {
    openDestinationWithOwnData();

    expect(() => applyBackupArchive(Buffer.from("これはZIPではない"), destination)).toThrow();

    expectDestinationUntouched();
  });

  it("中身が壊れた書庫を取り込んでもDBを壊さない", () => {
    const archive = buildSourceArchive();
    // 書庫の大半はDB本体が占めるので、中央あたりを潰せばDBの中身が壊れる。
    const damagedAt = Math.floor(archive.length / 2);
    archive[damagedAt] = (archive[damagedAt] ?? 0) ^ 0xff;
    openDestinationWithOwnData();

    expect(() => applyBackupArchive(archive, destination)).toThrow();

    expectDestinationUntouched();
  });

  it("DBが入っていない書庫を断る", () => {
    openDestinationWithOwnData();
    const archive = writeZip([
      {
        path: MANIFEST_ENTRY_PATH,
        data: Buffer.from(
          JSON.stringify({
            format: BACKUP_FORMAT,
            version: 1,
            exportedAt: "2026-08-08T00:00:00.000Z",
            counts: { notes: 0, tasks: 0, images: 0 },
          }),
        ),
      },
    ]);

    expect(() => applyBackupArchive(archive, destination)).toThrow(/見つかりません/);

    expectDestinationUntouched();
  });

  it("DBの中身がSQLiteでない書庫を断る", () => {
    openDestinationWithOwnData();
    const entries = readZip(buildSourceArchive()).map((entry) =>
      entry.path === DB_ENTRY_PATH ? { path: entry.path, data: Buffer.from("not a database") } : entry,
    );
    openDb(destination.dbFilePath);

    expect(() => applyBackupArchive(writeZip(entries), destination)).toThrow();

    expectDestinationUntouched();
  });

  it("マニフェストが無い書庫を断る", () => {
    openDestinationWithOwnData();
    const entries = readZip(buildSourceArchive()).filter(
      (entry) => entry.path !== MANIFEST_ENTRY_PATH,
    );
    openDb(destination.dbFilePath);

    expect(() => applyBackupArchive(writeZip(entries), destination)).toThrow(/見つかりません/);

    expectDestinationUntouched();
  });

  it("将来の形式の書庫を断る", () => {
    openDestinationWithOwnData();
    const entries = readZip(buildSourceArchive()).map((entry) =>
      entry.path === MANIFEST_ENTRY_PATH
        ? {
            path: entry.path,
            data: Buffer.from(
              JSON.stringify({
                format: BACKUP_FORMAT,
                version: 99,
                exportedAt: "2026-08-08T00:00:00.000Z",
                counts: { notes: 0, tasks: 0, images: 0 },
              }),
            ),
          }
        : entry,
    );
    openDb(destination.dbFilePath);

    expect(() => applyBackupArchive(writeZip(entries), destination)).toThrow(/新しい形式/);

    expectDestinationUntouched();
  });
});
