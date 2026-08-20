import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { getNote } from "../../../src/main/db/notes-repo";
import { onNotesChanged } from "../../../src/main/mcp/change-emitter";
import { findNoteTool, noteTools } from "../../../src/main/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const callTool = async (name: string, args: unknown): Promise<CallToolResult> => {
  const tool = findNoteTool(name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  return tool.handler(args);
};

const readJsonPayload = (result: CallToolResult): unknown => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  return JSON.parse(firstContent.text);
};

const readNoteId = (result: CallToolResult): string => {
  const payload = readJsonPayload(result);
  if (typeof payload !== "object" || payload === null || !("note" in payload)) {
    throw new Error("payload has no note");
  }
  const { note } = payload;
  if (typeof note !== "object" || note === null || !("id" in note)) {
    throw new Error("note has no id");
  }
  const { id } = note;
  if (typeof id !== "string") throw new Error("note id is not a string");
  return id;
};

const readVersionId = (result: CallToolResult): string => {
  const payload = readJsonPayload(result);
  if (typeof payload !== "object" || payload === null || !("versions" in payload)) {
    throw new Error("payload has no versions");
  }
  const { versions } = payload;
  if (!Array.isArray(versions)) throw new Error("payload versions is not an array");
  const [version] = versions;
  if (typeof version !== "object" || version === null || !("id" in version)) {
    throw new Error("version has no id");
  }
  const { id } = version;
  if (typeof id !== "string") throw new Error("version id is not a string");
  return id;
};

const readNoteCount = (result: CallToolResult): number => {
  const payload = readJsonPayload(result);
  if (typeof payload !== "object" || payload === null || !("notes" in payload)) {
    throw new Error("payload has no notes");
  }
  const { notes } = payload;
  if (!Array.isArray(notes)) throw new Error("payload notes is not an array");
  return notes.length;
};

describe("mcp note tools", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-mcp-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("exposes create_note's input schema", () => {
    const createNoteTool = findNoteTool("create_note");
    expect(createNoteTool?.definition.inputSchema.type).toBe("object");
    expect(Object.keys(createNoteTool?.definition.inputSchema.properties ?? {}).sort()).toEqual([
      "body",
      "tags",
      "title",
    ]);
  });

  it("persists a note created through create_note", async () => {
    const result = await callTool("create_note", {
      title: "設計メモ",
      body: "MCP経由で作成",
      tags: ["mcp"],
    });

    expect(result.isError).toBeFalsy();
    const id = readNoteId(result);

    const stored = getNote(id);
    expect(stored?.title).toBe("設計メモ");
    expect(stored?.body).toBe("MCP経由で作成");
    expect(stored?.tags).toEqual(["mcp"]);
  });

  it("notifies notes-changed listeners after create_note succeeds", async () => {
    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    await callTool("create_note", { title: "通知", body: "本文", tags: [] });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await callTool("create_note", { title: "通知しない", body: "本文", tags: [] });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify listeners when create_note fails validation", async () => {
    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    const result = await callTool("create_note", { body: "タイトルがない" });

    expect(result.isError).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("defaults tags to an empty array when omitted", async () => {
    const result = await callTool("create_note", { title: "タグなし", body: "本文" });

    expect(result.isError).toBeFalsy();
    const found = await callTool("search_notes", { query: "タグなし" });
    expect(readJsonPayload(found)).toEqual({
      notes: [expect.objectContaining({ title: "タグなし", tags: [] })],
    });
  });

  it("returns a stored note through get_note", async () => {
    const id = readNoteId(
      await callTool("create_note", { title: "取得", body: "本文", tags: ["x"] }),
    );

    const result = await callTool("get_note", { id });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({
      note: expect.objectContaining({ id, title: "取得", tags: ["x"] }),
    });
  });

  it("reports a missing note as not found instead of an error", async () => {
    const result = await callTool("get_note", { id: randomUUID() });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ note: null });
  });

  it("matches title and body with search_notes", async () => {
    await callTool("create_note", { title: "Alpha design", body: "no keyword", tags: [] });
    await callTool("create_note", { title: "Beta", body: "mentions DESIGN here", tags: [] });
    await callTool("create_note", { title: "Gamma", body: "unrelated", tags: [] });

    const result = await callTool("search_notes", { query: "design" });

    expect(result.isError).toBeFalsy();
    const payload = readJsonPayload(result);
    if (typeof payload !== "object" || payload === null || !("notes" in payload)) {
      throw new Error("search_notes payload has no notes");
    }
    const { notes } = payload;
    if (!Array.isArray(notes)) throw new Error("search_notes payload notes is not an array");
    expect(notes).toHaveLength(2);
  });

  it("returns an MCP error for invalid arguments", async () => {
    const result = await callTool("get_note", { id: 42 });

    expect(result.isError).toBe(true);
  });

  it("returns an MCP error instead of crashing when the database is closed", async () => {
    closeDb();

    const result = await callTool("search_notes", { query: "" });

    expect(result.isError).toBe(true);
    const [firstContent] = result.content;
    expect(firstContent?.type).toBe("text");
  });

  it("exposes update_note, delete_note and restore_note definitions", () => {
    expect(noteTools.map((tool) => tool.definition.name).sort()).toEqual([
      "attach_image",
      "create_note",
      "delete_note",
      "get_note",
      "list_note_versions",
      "restore_note",
      "restore_note_version",
      "search_notes",
      "semantic_search_notes",
      "update_note",
    ]);
  });

  // update_note は本文の書き換えが主な用途。タイトルとタグだけを検証していたため、
  // ハンドラが body を渡し忘れていても既存テストは緑のままだった（#103で実際に発生）。
  it("update_note は本文・タイトル・タグをそれぞれ書き換える", async () => {
    const id = readNoteId(await callTool("create_note", { title: "前", body: "前の本文", tags: ["a"] }));

    await callTool("update_note", { id, title: "後", body: "後の本文", tags: ["b"] });

    expect(readJsonPayload(await callTool("get_note", { id }))).toEqual({
      note: expect.objectContaining({ title: "後", body: "後の本文", tags: ["b"] }),
    });
  });

  it("update_note で省いた項目は元のまま残る", async () => {
    const id = readNoteId(await callTool("create_note", { title: "前", body: "前の本文", tags: ["a"] }));

    await callTool("update_note", { id, body: "後の本文" });

    expect(readJsonPayload(await callTool("get_note", { id }))).toEqual({
      note: expect.objectContaining({ title: "前", body: "後の本文", tags: ["a"] }),
    });
  });

  it("lists the snapshots taken by update_note through list_note_versions", async () => {
    const id = readNoteId(await callTool("create_note", { title: "v1", body: "本文1", tags: [] }));
    await callTool("update_note", { id, body: "本文2" });

    const result = await callTool("list_note_versions", { id });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({
      versions: [expect.objectContaining({ noteId: id, title: "v1", body: "本文1", tags: [] })],
    });
  });

  it("returns an empty version list for a note that was never updated", async () => {
    const id = readNoteId(await callTool("create_note", { title: "v1", body: "本文", tags: [] }));

    const result = await callTool("list_note_versions", { id });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ versions: [] });
  });

  it("returns an MCP error from list_note_versions for invalid arguments", async () => {
    const result = await callTool("list_note_versions", { id: 42 });

    expect(result.isError).toBe(true);
  });

  it("restores a past version through restore_note_version and notifies listeners", async () => {
    const id = readNoteId(await callTool("create_note", { title: "v1", body: "本文1", tags: [] }));
    await callTool("update_note", { id, body: "本文2" });
    const versionId = readVersionId(await callTool("list_note_versions", { id }));

    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    const result = await callTool("restore_note_version", { version_id: versionId });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({
      note: expect.objectContaining({ id, body: "本文1" }),
    });
    expect(getNote(id)?.body).toBe("本文1");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("returns an MCP error from restore_note_version for an unknown version id", async () => {
    const result = await callTool("restore_note_version", { version_id: randomUUID() });

    expect(result.isError).toBe(true);
  });

  it("updates a note's title through update_note and notifies listeners", async () => {
    const id = readNoteId(await callTool("create_note", { title: "元", body: "本文", tags: [] }));

    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    const result = await callTool("update_note", { id, title: "新" });

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({ note: expect.objectContaining({ id, title: "新" }) });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("returns an MCP error from update_note for an unknown id", async () => {
    const result = await callTool("update_note", { id: randomUUID(), title: "x" });

    expect(result.isError).toBe(true);
  });

  it("rejects delete_note without confirm: true", async () => {
    const id = readNoteId(await callTool("create_note", { title: "消す", body: "本文", tags: [] }));

    const result = await callTool("delete_note", { id });

    expect(result.isError).toBe(true);
    const stillThere = await callTool("search_notes", { query: "消す" });
    expect(readNoteCount(stillThere)).toBe(1);
  });

  it("soft-deletes a note through delete_note when confirm: true is passed, and notifies listeners", async () => {
    const id = readNoteId(await callTool("create_note", { title: "消す", body: "本文", tags: [] }));

    const listener = vi.fn();
    const unsubscribe = onNotesChanged(listener);

    const result = await callTool("delete_note", { id, confirm: true });

    expect(result.isError).toBeFalsy();
    expect(listener).toHaveBeenCalledTimes(1);
    const afterDelete = await callTool("search_notes", { query: "消す" });
    expect(readNoteCount(afterDelete)).toBe(0);
    unsubscribe();
  });

  it("restores a soft-deleted note through restore_note", async () => {
    const id = readNoteId(await callTool("create_note", { title: "戻す", body: "本文", tags: [] }));
    await callTool("delete_note", { id, confirm: true });

    const result = await callTool("restore_note", { id });

    expect(result.isError).toBeFalsy();
    const afterRestore = await callTool("search_notes", { query: "戻す" });
    expect(readNoteCount(afterRestore)).toBe(1);
  });

  it("returns an MCP error from restore_note for a note that is not deleted", async () => {
    const id = readNoteId(await callTool("create_note", { title: "通常", body: "本文", tags: [] }));

    const result = await callTool("restore_note", { id });

    expect(result.isError).toBe(true);
  });
});
