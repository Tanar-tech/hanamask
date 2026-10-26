import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, getNote, listNoteVersions } from "../../../src/main/db/notes-repo";
import { onNotesChanged } from "../../../src/main/mcp/change-emitter";
import { pageEditTools } from "../../../src/main/mcp/tools/page-edits";

const callTool = async (name: string, args: unknown): Promise<CallToolResult> => {
  const tool = pageEditTools.find((candidate) => candidate.definition.name === name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  return tool.handler(args);
};

const readText = (result: CallToolResult): string => {
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  return firstContent.text;
};

const readNoteBody = (result: CallToolResult): string => {
  const payload: unknown = JSON.parse(readText(result));
  if (typeof payload !== "object" || payload === null || !("note" in payload)) {
    throw new Error("payload has no note");
  }
  const { note } = payload;
  if (typeof note !== "object" || note === null || !("body" in note)) {
    throw new Error("note has no body");
  }
  const { body } = note;
  if (typeof body !== "string") throw new Error("note body is not a string");
  return body;
};

const BODY = "## 進捗\n\n- 済み\n\n## 残り\n\n- 未着手\n";

const seedPage = (body = BODY): string =>
  createNote({ title: "案件", body, tags: [] }).id;

describe("部分編集のMCPツール", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-page-edit-tools-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("append_to_page と replace_page_section を公開する", () => {
    expect(pageEditTools.map((tool) => tool.definition.name)).toEqual([
      "append_to_page",
      "replace_page_section",
    ]);
  });

  describe("append_to_page", () => {
    it("見出しなしならページの末尾に追記し、更新後のページを返す", async () => {
      const id = seedPage();

      const result = await callTool("append_to_page", { id, content: "末尾" });

      expect(result.isError).toBeFalsy();
      expect(readNoteBody(result)).toBe(`${BODY}\n末尾\n`);
      expect(getNote(id)?.body).toBe(`${BODY}\n末尾\n`);
    });

    it("見出しの節の末尾に追記する", async () => {
      const id = seedPage();

      await callTool("append_to_page", { id, content: "- 追加", heading: "進捗" });

      expect(getNote(id)?.body).toBe("## 進捗\n\n- 済み\n\n- 追加\n\n## 残り\n\n- 未着手\n");
    });

    it("書き換え前の版を履歴に残し、更新日時を進める", async () => {
      const id = seedPage();
      const before = getNote(id)?.updatedAt ?? "";

      const result = await callTool("append_to_page", { id, content: "x" });

      const versions = listNoteVersions(id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.body).toBe(BODY);
      const after = getNote(id)?.updatedAt ?? "";
      expect(after >= before).toBe(true);
      expect(readText(result)).toContain(after);
    });

    it("update_page と同じ形で変更を通知する", async () => {
      const id = seedPage();
      const listener = vi.fn();
      const unsubscribe = onNotesChanged(listener);

      await callTool("append_to_page", { id, content: "x" });

      expect(listener).toHaveBeenCalledWith({
        entity: "note",
        action: "updated",
        id,
        title: "案件",
      });
      unsubscribe();
    });

    it("見出しが見つからなければ書き換えずに候補を返す", async () => {
      const id = seedPage();
      const listener = vi.fn();
      const unsubscribe = onNotesChanged(listener);

      const result = await callTool("append_to_page", { id, content: "x", heading: "無い" });

      expect(result.isError).toBe(true);
      expect(readText(result)).toContain("## 進捗");
      expect(readText(result)).toContain("## 残り");
      expect(getNote(id)?.body).toBe(BODY);
      expect(listNoteVersions(id)).toHaveLength(0);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("存在しないページはエラー", async () => {
      const result = await callTool("append_to_page", { id: randomUUID(), content: "x" });

      expect(result.isError).toBe(true);
      expect(readText(result)).toContain("not found");
    });

    it("content が文字列でなければエラー", async () => {
      const result = await callTool("append_to_page", { id: seedPage(), content: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe("replace_page_section", () => {
    it("節の中身だけを置き換える", async () => {
      const id = seedPage();

      const result = await callTool("replace_page_section", {
        id,
        heading: "## 進捗",
        content: "- 全部済み",
      });

      expect(result.isError).toBeFalsy();
      expect(readNoteBody(result)).toBe("## 進捗\n\n- 全部済み\n\n## 残り\n\n- 未着手\n");
      expect(listNoteVersions(id)).toHaveLength(1);
    });

    it("同じ見出しが複数あれば書き換えずに候補を返す", async () => {
      const id = seedPage("## メモ\n\na\n\n## メモ\n\nb\n");

      const result = await callTool("replace_page_section", {
        id,
        heading: "メモ",
        content: "x",
      });

      expect(result.isError).toBe(true);
      expect(readText(result)).toContain("## メモ");
      expect(getNote(id)?.body).toBe("## メモ\n\na\n\n## メモ\n\nb\n");
    });

    it("heading は必須", async () => {
      const result = await callTool("replace_page_section", { id: seedPage(), content: "x" });

      expect(result.isError).toBe(true);
    });
  });

  describe("expected_updated_at", () => {
    it.each(["append_to_page", "replace_page_section"])(
      "%s は最終更新日時が一致すれば書き換える",
      async (name) => {
        const id = seedPage();
        const current = getNote(id)?.updatedAt;

        const result = await callTool(name, {
          id,
          heading: "残り",
          content: "x",
          expected_updated_at: current,
        });

        expect(result.isError).toBeFalsy();
      },
    );

    it.each(["append_to_page", "replace_page_section"])(
      "%s は食い違えば書き換えずに現在の日時を知らせる",
      async (name) => {
        const id = seedPage();
        const current = getNote(id)?.updatedAt ?? "";
        const listener = vi.fn();
        const unsubscribe = onNotesChanged(listener);

        const result = await callTool(name, {
          id,
          heading: "残り",
          content: "x",
          expected_updated_at: "2000-01-01T00:00:00.000Z",
        });

        expect(result.isError).toBe(true);
        expect(readText(result)).toContain(current);
        expect(readText(result)).toContain("get_page");
        expect(getNote(id)?.body).toBe(BODY);
        expect(listNoteVersions(id)).toHaveLength(0);
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
      },
    );

    it("expected_updated_at が文字列でなければエラー", async () => {
      const result = await callTool("append_to_page", {
        id: seedPage(),
        content: "x",
        expected_updated_at: 123,
      });

      expect(result.isError).toBe(true);
    });
  });
});
