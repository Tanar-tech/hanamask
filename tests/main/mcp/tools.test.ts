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

  it("exposes create_note, get_note and search_notes definitions", () => {
    expect(noteTools.map((tool) => tool.definition.name).sort()).toEqual([
      "create_note",
      "get_note",
      "search_notes",
    ]);
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
    const payload = readJsonPayload(result);
    if (typeof payload !== "object" || payload === null || !("note" in payload)) {
      throw new Error("create_note payload has no note");
    }
    const { note } = payload;
    if (typeof note !== "object" || note === null || !("id" in note)) {
      throw new Error("create_note payload note has no id");
    }
    const { id } = note;
    if (typeof id !== "string") throw new Error("create_note returned a non-string id");

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
    const created = readJsonPayload(
      await callTool("create_note", { title: "取得", body: "本文", tags: ["x"] }),
    );
    if (typeof created !== "object" || created === null || !("note" in created)) {
      throw new Error("create_note payload has no note");
    }
    const { note } = created;
    if (typeof note !== "object" || note === null || !("id" in note)) {
      throw new Error("create_note payload note has no id");
    }
    const { id } = note;
    if (typeof id !== "string") throw new Error("create_note returned a non-string id");

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
});
