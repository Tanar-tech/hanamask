import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, softDeleteNote } from "../../../src/main/db/notes-repo";
import { createTask } from "../../../src/main/db/tasks-repo";
import { contentHashOf, upsertEmbedding } from "../../../src/main/db/embeddings-repo";
import type { EmbeddedEntityType } from "../../../src/main/db/embeddings-repo";
import { setEmbeddingRuntime } from "../../../src/main/llm/index";
import { findNoteTool } from "../../../src/main/mcp/tools";
import { FakeEmbeddingProvider } from "../llm/fake-embedding-provider";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const TOOL_NAME = "semantic_search_notes";

const callTool = async (args: unknown): Promise<CallToolResult> => {
  const tool = findNoteTool(TOOL_NAME);
  if (tool === undefined) throw new Error(`Tool not found: ${TOOL_NAME}`);
  return tool.handler(args);
};

const readPayload = (result: CallToolResult): Record<string, unknown> => {
  const [first] = result.content;
  if (first === undefined || first.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const parsed: unknown = JSON.parse(first.text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("payload is not an object");
  }
  return { ...parsed };
};

const readEntries = (payload: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const value = payload[key];
  if (!Array.isArray(value)) throw new Error(`payload has no ${key} array`);
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) throw new Error("entry is not an object");
    return { ...entry };
  });
};

const idsOf = (payload: Record<string, unknown>, key: string): unknown[] =>
  readEntries(payload, key).map((entry) => entry.id);

const provider = new FakeEmbeddingProvider();

const indexEntity = async (
  entityType: EmbeddedEntityType,
  entityId: string,
  title: string,
  body: string,
): Promise<void> => {
  upsertEmbedding({
    entityType,
    entityId,
    modelId: provider.modelId,
    contentHash: contentHashOf(title, body),
    vector: await provider.embedDocument(`${title}\n${body}`),
    updatedAt: new Date().toISOString(),
  });
};

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hanamask-semantic-tool-"));
  openDb(join(dir, "hanamask.sqlite3"));
  setEmbeddingRuntime({ availability: () => ({ state: "ready", provider }) });
});

afterEach(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("semantic_search_notes", () => {
  it("意味の近い順にノートとタスクを返す", async () => {
    const near = createNote({ title: "aaaaa", body: "aaaaa", tags: [] });
    const far = createNote({ title: "ccccc", body: "ccccc", tags: [] });
    const task = createTask({ title: "aaaa", body: "aa", status: "todo", dueDate: null });
    await indexEntity("note", near.id, near.title, near.body);
    await indexEntity("note", far.id, far.title, far.body);
    await indexEntity("task", task.id, task.title, task.body);

    const payload = readPayload(await callTool({ query: "aaaaa\naaaaa" }));

    expect(idsOf(payload, "notes")).toEqual([near.id, far.id]);
    expect(idsOf(payload, "tasks")).toEqual([task.id]);
    expect(payload.unavailable).toBeUndefined();
  });

  it("スコアを添えて返し、ノート側は降順になっている", async () => {
    const near = createNote({ title: "aaaaa", body: "aaaaa", tags: [] });
    const far = createNote({ title: "ccccc", body: "ccccc", tags: [] });
    await indexEntity("note", near.id, near.title, near.body);
    await indexEntity("note", far.id, far.title, far.body);

    const notes = readEntries(readPayload(await callTool({ query: "aaaaa" })), "notes");

    const scores = notes.map((note) => note.score);
    expect(scores.every((score) => typeof score === "number")).toBe(true);
    expect(scores).toEqual([...scores].sort((left, right) => Number(right) - Number(left)));
    expect(notes[0]?.title).toBe("aaaaa");
  });

  it("ゴミ箱に入れたノートは返さない", async () => {
    const kept = createNote({ title: "残る", body: "本文", tags: [] });
    const trashed = createNote({ title: "捨てる", body: "本文", tags: [] });
    await indexEntity("note", kept.id, kept.title, kept.body);
    await indexEntity("note", trashed.id, trashed.title, trashed.body);
    softDeleteNote(trashed.id);

    const payload = readPayload(await callTool({ query: "本文" }));

    expect(idsOf(payload, "notes")).toEqual([kept.id]);
  });

  it("ベクトルだけ残っていて実体が消えた行は落とす", async () => {
    const note = createNote({ title: "残る", body: "本文", tags: [] });
    await indexEntity("note", note.id, note.title, note.body);
    await indexEntity("note", "missing-note-id", "幽霊", "本文");

    const payload = readPayload(await callTool({ query: "本文" }));

    expect(idsOf(payload, "notes")).toEqual([note.id]);
  });

  it("limit で件数を絞れる", async () => {
    const notes = await Promise.all(
      ["いち", "にい", "さん"].map(async (title) => {
        const note = createNote({ title, body: "本文", tags: [] });
        await indexEntity("note", note.id, note.title, note.body);
        return note;
      }),
    );

    const payload = readPayload(await callTool({ query: "本文", limit: 1 }));

    expect(readEntries(payload, "notes")).toHaveLength(1);
    expect(notes).toHaveLength(3);
  });

  it("limit を省略すると既定件数まで返す", async () => {
    await Promise.all(
      Array.from({ length: 12 }, async (_unused, index) => {
        const note = createNote({ title: `メモ${index}`, body: "本文", tags: [] });
        await indexEntity("note", note.id, note.title, note.body);
      }),
    );

    const payload = readPayload(await callTool({ query: "本文" }));

    expect(readEntries(payload, "notes")).toHaveLength(10);
  });

  it("limit が数値でなければエラー結果を返す", async () => {
    const result = await callTool({ query: "本文", limit: "3" });

    expect(result.isError).toBe(true);
  });

  it("query が無ければエラー結果を返す", async () => {
    const result = await callTool({});

    expect(result.isError).toBe(true);
  });

  it("モデルが使えないときは理由を添えた空の結果を返す", async () => {
    setEmbeddingRuntime({
      availability: () => ({ state: "unavailable", reason: "モデルを読み込めなかった" }),
    });

    const result = await callTool({ query: "本文" });
    const payload = readPayload(result);

    expect(result.isError).toBeUndefined();
    expect(payload).toEqual({ notes: [], tasks: [], unavailable: "モデルを読み込めなかった" });
  });

  it("モデルが準備中のときは準備中と伝える空の結果を返す", async () => {
    setEmbeddingRuntime({ availability: () => ({ state: "loading" }) });

    const result = await callTool({ query: "本文" });
    const payload = readPayload(result);

    expect(result.isError).toBeUndefined();
    expect(payload.notes).toEqual([]);
    expect(payload.tasks).toEqual([]);
    expect(payload.unavailable).toContain("準備中");
  });
});
