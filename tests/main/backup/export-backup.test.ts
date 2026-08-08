import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { createImage } from "../../../src/main/db/images-repo";
import { createBackupArchive } from "../../../src/main/backup/export-backup";
import { DB_ENTRY_PATH, MANIFEST_ENTRY_PATH } from "../../../src/main/backup/manifest";
import { readZip } from "../../../src/main/backup/zip";

const API_KEY = "sk-ant-api03-do-not-export-me";

describe("export-backup", () => {
  let userDataDirPath: string;
  let dbFilePath: string;
  let imagesDirPath: string;

  const paths = () => ({ dbFilePath, imagesDirPath });

  beforeEach(() => {
    userDataDirPath = mkdtempSync(join(tmpdir(), "hanamask-export-"));
    dbFilePath = join(userDataDirPath, "hanamask.sqlite3");
    imagesDirPath = join(userDataDirPath, "images");
    mkdirSync(imagesDirPath);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(userDataDirPath, { recursive: true, force: true });
  });

  it("マニフェストとDBと画像を書庫にまとめる", () => {
    const note = createNote({ title: "note", body: "body", tags: [] });
    createImage({ noteId: note.id, filePath: join(imagesDirPath, "a.png"), mimeType: "image/png" });
    writeFileSync(join(imagesDirPath, "a.png"), Buffer.from([1, 2, 3]));

    const entryPaths = readZip(createBackupArchive(paths()).archive).map((entry) => entry.path);

    expect(entryPaths).toContain(MANIFEST_ENTRY_PATH);
    expect(entryPaths).toContain(DB_ENTRY_PATH);
    expect(entryPaths).toContain("images/a.png");
  });

  it("マニフェストに形式・版・件数を書く", () => {
    createNote({ title: "note", body: "body", tags: [] });
    createTask({ title: "task", status: "todo", dueDate: null });

    const { archive, counts } = createBackupArchive(paths());
    const manifest: unknown = JSON.parse(
      readZip(archive)
        .find((entry) => entry.path === MANIFEST_ENTRY_PATH)
        ?.data.toString("utf-8") ?? "null",
    );

    expect(counts).toEqual({ notes: 1, tasks: 1, images: 0 });
    expect(manifest).toMatchObject({
      format: "hanamask-backup",
      version: 1,
      counts: { notes: 1, tasks: 1, images: 0 },
    });
  });

  /* T35の禁止事項: 書き出したファイルにAPIキーを含めない。 */
  it("APIキーの設定ファイルを書庫に含めない", () => {
    writeFileSync(
      join(userDataDirPath, "chat-settings.json"),
      JSON.stringify({ apiKeyEncrypted: API_KEY }),
    );
    createNote({ title: "note", body: "body", tags: [] });

    const entries = readZip(createBackupArchive(paths()).archive);

    expect(entries.some((entry) => entry.path.includes("chat-settings"))).toBe(false);
    expect(entries.some((entry) => entry.data.includes(API_KEY))).toBe(false);
  });

  it("画像ディレクトリが無くても書き出せる", () => {
    rmSync(imagesDirPath, { recursive: true, force: true });
    createNote({ title: "note", body: "body", tags: [] });

    expect(readZip(createBackupArchive(paths()).archive).map((entry) => entry.path)).toEqual([
      MANIFEST_ENTRY_PATH,
      DB_ENTRY_PATH,
    ]);
  });
});
