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
      "create_note",
      "delete_note",
      "get_note",
      "restore_note",
      "search_notes",
      "update_note",
    ]);
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
