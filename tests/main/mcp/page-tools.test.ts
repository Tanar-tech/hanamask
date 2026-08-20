import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNotebook, softDeleteNotebook } from "../../../src/main/db/notebooks-repo";
import { getNote } from "../../../src/main/db/notes-repo";
import { onNotesChanged } from "../../../src/main/mcp/change-emitter";
import { findNoteTool } from "../../../src/main/mcp/tools/notes";
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

const readNoteTitles = (result: CallToolResult): string[] => {
  const payload = readJsonPayload(result);
  if (typeof payload !== "object" || payload === null || !("notes" in payload)) {
    throw new Error("payload has no notes");
  }
  const { notes } = payload;
  if (!Array.isArray(notes)) throw new Error("payload notes is not an array");
  return notes.map((note: unknown) => {
    if (typeof note !== "object" || note === null || !("title" in note)) {
      throw new Error("note has no title");
    }
    const { title } = note;
    if (typeof title !== "string") throw new Error("note title is not a string");
    return title;
  });
};

/* 別名は毎回別のレコードを作るので、id と時刻だけ伏せて中身を突き合わせる。 */
const VOLATILE_KEYS = new Set(["id", "noteId", "createdAt", "updatedAt"]);

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      VOLATILE_KEYS.has(key) ? "<volatile>" : normalize(child),
    ]),
  );
};

const ALIAS_PAIRS: readonly (readonly [string, string])[] = [
  ["create_note", "create_page"],
  ["get_note", "get_page"],
  ["search_notes", "search_pages"],
  ["update_note", "update_page"],
  ["delete_note", "delete_page"],
  ["restore_note", "restore_page"],
  ["list_note_versions", "list_page_versions"],
  ["restore_note_version", "restore_page_version"],
];

const seedNote = async (title: string): Promise<string> =>
  readNoteId(await callTool("create_note", { title, body: "本文", tags: ["t"] }));

const seedVersion = async (title: string): Promise<string> => {
  const id = await seedNote(title);
  await callTool("update_note", { id, title: `${title}改` });
  return readVersionId(await callTool("list_note_versions", { id }));
};

describe("ページ用MCPツール", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-page-tools-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  describe("8別名の同値性", () => {
    it.each(ALIAS_PAIRS)("%s と %s は同じ処理を共有している", (noteName, pageName) => {
      const noteTool = findNoteTool(noteName);
      const pageTool = findNoteTool(pageName);

      expect(noteTool).toBeDefined();
      expect(pageTool).toBeDefined();
      expect(pageTool?.handler).toBe(noteTool?.handler);
    });

    it("create_page が create_note と同じ結果を返す", async () => {
      const args = { title: "同じ", body: "本文", tags: ["a"] };

      const viaNote = readJsonPayload(await callTool("create_note", args));
      const viaPage = readJsonPayload(await callTool("create_page", args));

      expect(normalize(viaPage)).toEqual(normalize(viaNote));
    });

    it("get_page が get_note と同じ結果を返す", async () => {
      const id = await seedNote("引く");

      const viaNote = readJsonPayload(await callTool("get_note", { id }));
      const viaPage = readJsonPayload(await callTool("get_page", { id }));

      expect(viaPage).toEqual(viaNote);
    });

    it("search_pages が search_notes と同じ結果を返す", async () => {
      await seedNote("探す");

      const viaNote = readJsonPayload(await callTool("search_notes", { query: "探す" }));
      const viaPage = readJsonPayload(await callTool("search_pages", { query: "探す" }));

      expect(viaPage).toEqual(viaNote);
    });

    it("update_page が update_note と同じ結果を返す", async () => {
      const noteId = await seedNote("直す");
      const pageId = await seedNote("直す");

      const viaNote = readJsonPayload(await callTool("update_note", { id: noteId, body: "新" }));
      const viaPage = readJsonPayload(await callTool("update_page", { id: pageId, body: "新" }));

      expect(normalize(viaPage)).toEqual(normalize(viaNote));
    });

    it("delete_page が delete_note と同じ結果を返す", async () => {
      const noteId = await seedNote("消す");
      const pageId = await seedNote("消す");

      const viaNote = await callTool("delete_note", { id: noteId, confirm: true });
      const viaPage = await callTool("delete_page", { id: pageId, confirm: true });

      expect(viaPage).toEqual(viaNote);
      expect(readNoteTitles(await callTool("search_pages", { query: "消す" }))).toEqual([]);
    });

    it("restore_page が restore_note と同じ結果を返す", async () => {
      const noteId = await seedNote("戻す");
      const pageId = await seedNote("戻す");
      await callTool("delete_note", { id: noteId, confirm: true });
      await callTool("delete_page", { id: pageId, confirm: true });

      const viaNote = readJsonPayload(await callTool("restore_note", { id: noteId }));
      const viaPage = readJsonPayload(await callTool("restore_page", { id: pageId }));

      expect(normalize(viaPage)).toEqual(normalize(viaNote));
    });

    it("list_page_versions が list_note_versions と同じ結果を返す", async () => {
      const id = await seedNote("履歴");
      await callTool("update_note", { id, title: "履歴改" });

      const viaNote = readJsonPayload(await callTool("list_note_versions", { id }));
      const viaPage = readJsonPayload(await callTool("list_page_versions", { id }));

      expect(viaPage).toEqual(viaNote);
    });

    it("restore_page_version が restore_note_version と同じ結果を返す", async () => {
      const noteVersionId = await seedVersion("版");
      const pageVersionId = await seedVersion("版");

      const viaNote = readJsonPayload(
        await callTool("restore_note_version", { version_id: noteVersionId }),
      );
      const viaPage = readJsonPayload(
        await callTool("restore_page_version", { version_id: pageVersionId }),
      );

      expect(normalize(viaPage)).toEqual(normalize(viaNote));
    });
  });

  describe("ページ側だけの差分", () => {
    it("create_page が所属ノートを指定して作れる", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });

      const id = readNoteId(
        await callTool("create_page", { title: "所属", body: "本文", notebook_id: notebook.id }),
      );

      expect(getNote(id)?.notebookId).toBe(notebook.id);
    });

    it("create_page が存在しないノートへの所属を拒否する", async () => {
      const result = await callTool("create_page", {
        title: "所属",
        body: "本文",
        notebook_id: randomUUID(),
      });

      expect(result.isError).toBe(true);
      expect(readNoteTitles(await callTool("search_pages", { query: "所属" }))).toEqual([]);
    });

    it("create_page が削除済みノートへの所属を拒否する", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      softDeleteNotebook(notebook.id);

      const result = await callTool("create_page", {
        title: "所属",
        body: "本文",
        notebook_id: notebook.id,
      });

      expect(result.isError).toBe(true);
    });

    it("get_page が所属ノートを返す", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      const id = readNoteId(
        await callTool("create_page", { title: "所属", body: "本文", notebook_id: notebook.id }),
      );

      const payload = readJsonPayload(await callTool("get_page", { id }));

      expect(payload).toEqual({ note: expect.objectContaining({ notebookId: notebook.id }) });
    });

    it("search_pages が所属ノートで絞り込む", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      await callTool("create_page", { title: "中", body: "本文", notebook_id: notebook.id });
      await callTool("create_page", { title: "外", body: "本文" });

      const filtered = await callTool("search_pages", { query: "", notebook_id: notebook.id });

      expect(readNoteTitles(filtered)).toEqual(["中"]);
      expect(readNoteTitles(await callTool("search_pages", { query: "" })).sort()).toEqual([
        "中",
        "外",
      ]);
    });
  });

  describe("move_page", () => {
    it("無所属のページをノートへ入れ、変更を通知する", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      const id = await seedNote("移す");
      const listener = vi.fn();
      const unsubscribe = onNotesChanged(listener);

      const result = await callTool("move_page", { id, notebook_id: notebook.id });

      expect(result.isError).toBeFalsy();
      expect(getNote(id)?.notebookId).toBe(notebook.id);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("ページを別のノートへ移す", async () => {
      const from = createNotebook({ title: "元", summary: "", tags: [] });
      const to = createNotebook({ title: "先", summary: "", tags: [] });
      const id = readNoteId(
        await callTool("create_page", { title: "移す", body: "本文", notebook_id: from.id }),
      );

      await callTool("move_page", { id, notebook_id: to.id });

      expect(getNote(id)?.notebookId).toBe(to.id);
    });

    it("notebook_id: null でページを無所属に戻す", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      const id = readNoteId(
        await callTool("create_page", { title: "出す", body: "本文", notebook_id: notebook.id }),
      );

      const result = await callTool("move_page", { id, notebook_id: null });

      expect(result.isError).toBeFalsy();
      expect(getNote(id)?.notebookId).toBeNull();
    });

    it("存在しないノートへの移動を拒否する", async () => {
      const id = await seedNote("移せない");

      const result = await callTool("move_page", { id, notebook_id: randomUUID() });

      expect(result.isError).toBe(true);
      expect(getNote(id)?.notebookId).toBeNull();
    });

    it("削除済みノートへの移動を拒否する", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });
      softDeleteNotebook(notebook.id);
      const id = await seedNote("移せない");

      const result = await callTool("move_page", { id, notebook_id: notebook.id });

      expect(result.isError).toBe(true);
      expect(getNote(id)?.notebookId).toBeNull();
    });

    it("存在しないページの移動を拒否する", async () => {
      const notebook = createNotebook({ title: "束", summary: "", tags: [] });

      const result = await callTool("move_page", { id: randomUUID(), notebook_id: notebook.id });

      expect(result.isError).toBe(true);
    });
  });

  it("delete_page は confirm: true が無いと消さない", async () => {
    const id = await seedNote("残る");

    const result = await callTool("delete_page", { id });

    expect(result.isError).toBe(true);
    expect(readNoteTitles(await callTool("search_pages", { query: "残る" }))).toEqual(["残る"]);
  });
});
