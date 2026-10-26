import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeDb, openDb } from "../../../src/main/db/db";
import { createNote, getNote } from "../../../src/main/db/notes-repo";
import { createTask, getTask } from "../../../src/main/db/tasks-repo";
import { createNotebook, getActiveNotebook } from "../../../src/main/db/notebooks-repo";
import { findNoteTool } from "../../../src/main/mcp/tools/notes";
import { findTaskTool } from "../../../src/main/mcp/tools/tasks";
import { findNotebookTool } from "../../../src/main/mcp/tools/notebooks";
import type { McpTool } from "../../../src/main/mcp/tools/shared";

const STALE = "2000-01-01T00:00:00.000Z";

const call = async (tool: McpTool | undefined, args: unknown): Promise<CallToolResult> => {
  if (tool === undefined) throw new Error("tool not found");
  return tool.handler(args);
};

const firstText = (result: CallToolResult): string => {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
};

describe("更新系ツールの衝突の検出", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-update-conflict-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it.each(["update_page", "update_note"])("%s は古い日時なら書き換えずに知らせる", async (name) => {
    const note = createNote({ title: "t", body: "元", tags: [] });
    const result = await call(findNoteTool(name), { id: note.id, body: "新", expected_updated_at: STALE });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain(note.updatedAt);
    expect(getNote(note.id)?.body).toBe("元");
  });

  it("update_page は今の日時と一致すれば書き換える", async () => {
    const note = createNote({ title: "t", body: "元", tags: [] });
    const result = await call(findNoteTool("update_page"), {
      id: note.id,
      body: "新",
      expected_updated_at: note.updatedAt,
    });
    expect(result.isError).toBeFalsy();
    expect(getNote(note.id)?.body).toBe("新");
  });

  it("update_task は古い日時なら書き換えない", async () => {
    const task = createTask({ title: "t", status: "todo", dueDate: null });
    const result = await call(findTaskTool("update_task"), {
      id: task.id,
      title: "新",
      expected_updated_at: STALE,
    });
    expect(result.isError).toBe(true);
    expect(getTask(task.id)?.title).toBe("t");
  });

  it("update_notebook は古い日時なら書き換えない", async () => {
    const notebook = createNotebook({ title: "束", summary: "元", tags: [] });
    const result = await call(findNotebookTool("update_notebook"), {
      id: notebook.id,
      summary: "新",
      expected_updated_at: STALE,
    });
    expect(result.isError).toBe(true);
    expect(getActiveNotebook(notebook.id)?.summary).toBe("元");
  });

  it("日時を渡さなければ今までどおり書き換える", async () => {
    const note = createNote({ title: "t", body: "元", tags: [] });
    await call(findNoteTool("update_page"), { id: note.id, body: "新" });
    expect(getNote(note.id)?.body).toBe("新");
  });
});
