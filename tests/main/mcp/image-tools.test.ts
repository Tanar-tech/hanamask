import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { listImages } from "../../../src/main/db/images-repo";
import { setImagesDirPath } from "../../../src/main/images/attach-image";
import { findNoteTool, noteTools } from "../../../src/main/mcp/tools";
import { onNotesChanged } from "../../../src/main/mcp/change-emitter";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = findNoteTool(name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  const result = tool.handler(args);
  // ここで扱うのは同期ハンドラだけ。非同期のツールは専用のテストで待って確かめる。
  if (result instanceof Promise) throw new Error(`Tool is asynchronous: ${name}`);
  return result;
};

const readImageFilePath = (result: CallToolResult): string => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || !("image" in payload)) {
    throw new Error(`attach_image payload has no image: ${firstContent.text}`);
  }
  const { image } = payload;
  if (typeof image !== "object" || image === null || !("filePath" in image)) {
    throw new Error("attach_image image has no filePath");
  }
  const { filePath } = image;
  if (typeof filePath !== "string") throw new Error("attach_image filePath is not a string");
  return filePath;
};

const pngDataBase64 = Buffer.from("fake-png-bytes").toString("base64");

describe("mcp attach_image tool", () => {
  let dbFilePath: string;
  let imagesDirPath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-image-tool-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
    imagesDirPath = join(mkdtempSync(join(tmpdir(), "hanamask-image-tool-")), "images");
    setImagesDirPath(imagesDirPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
    rmSync(dirname(imagesDirPath), { force: true, recursive: true });
  });

  it("attach_image をツール一覧に公開する", () => {
    const tool = noteTools.find((candidate) => candidate.definition.name === "attach_image");

    expect(tool).toBeDefined();
    expect(tool?.definition.inputSchema.required).toEqual([
      "note_id",
      "file_name",
      "data_base64",
      "mime_type",
    ]);
  });

  it("画像を保存しノートに紐づける", () => {
    const filePath = readImageFilePath(
      callTool("attach_image", {
        note_id: "note-1",
        file_name: "shot.png",
        data_base64: pngDataBase64,
        mime_type: "image/png",
      }),
    );

    expect(dirname(filePath)).toBe(imagesDirPath);
    expect(readFileSync(filePath)).toEqual(Buffer.from(pngDataBase64, "base64"));
    expect(listImages("note-1").map((image) => image.filePath)).toEqual([filePath]);
  });

  it("非対応のMIMEタイプはエラー結果を返す", () => {
    const result = callTool("attach_image", {
      note_id: "note-1",
      file_name: "doc.pdf",
      data_base64: pngDataBase64,
      mime_type: "application/pdf",
    });

    expect(result.isError).toBe(true);
    expect(listImages("note-1")).toEqual([]);
  });

  it("添付成功時に変更通知リスナーを呼ぶ", () => {
    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    callTool("attach_image", {
      note_id: "note-1",
      file_name: "shot.png",
      data_base64: pngDataBase64,
      mime_type: "image/png",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("添付が失敗した場合は変更通知リスナーを呼ばない", () => {
    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    const result = callTool("attach_image", {
      note_id: "note-1",
      file_name: "doc.pdf",
      data_base64: pngDataBase64,
      mime_type: "application/pdf",
    });

    expect(result.isError).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("引数が欠けている場合はエラー結果を返す", () => {
    const result = callTool("attach_image", { note_id: "note-1" });

    expect(result.isError).toBe(true);
    expect(listImages("note-1")).toEqual([]);
  });
});
