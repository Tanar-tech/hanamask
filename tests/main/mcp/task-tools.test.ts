import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, openDb } from "../../../src/main/db/db";
import { getTask, listTasks } from "../../../src/main/db/tasks-repo";
import { onTasksChanged } from "../../../src/main/mcp/change-emitter";
import { findTaskTool, taskTools } from "../../../src/main/mcp/tools";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = findTaskTool(name);
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

const createTaskThroughTool = (args: Record<string, unknown>): string => {
  const payload = readJsonPayload(callTool("create_task", args));
  if (typeof payload !== "object" || payload === null || !("task" in payload)) {
    throw new Error("create_task payload has no task");
  }
  const { task } = payload;
  if (typeof task !== "object" || task === null || !("id" in task)) {
    throw new Error("create_task payload task has no id");
  }
  const { id } = task;
  if (typeof id !== "string") throw new Error("create_task returned a non-string id");
  return id;
};

describe("mcp task tools", () => {
  let dbFilePath: string;

  beforeEach(() => {
    dbFilePath = join(tmpdir(), `hanamask-task-mcp-test-${randomUUID()}.sqlite3`);
    openDb(dbFilePath);
  });

  afterEach(() => {
    closeDb();
    rmSync(dbFilePath, { force: true });
  });

  it("5つのタスクツール定義を公開する", () => {
    expect(taskTools.map((tool) => tool.definition.name).sort()).toEqual([
      "create_task",
      "delete_task",
      "list_tasks",
      "restore_task",
      "update_task",
    ]);
    expect(findTaskTool("create_task")?.definition.inputSchema.type).toBe("object");
    expect(Object.keys(findTaskTool("create_task")?.definition.inputSchema.properties ?? {}).sort()).toEqual(
      ["due_date", "status", "title"],
    );
  });

  it("create_taskで作成したタスクが永続化される", () => {
    const id = createTaskThroughTool({
      title: "MCP経由のタスク",
      status: "in_progress",
      due_date: "2026-08-10",
    });

    const stored = getTask(id);
    expect(stored?.title).toBe("MCP経由のタスク");
    expect(stored?.status).toBe("in_progress");
    expect(stored?.dueDate).toBe("2026-08-10");
  });

  it("statusを省略するとtodoになり、due_dateを省略するとnullになる", () => {
    const id = createTaskThroughTool({ title: "省略" });

    const stored = getTask(id);
    expect(stored?.status).toBe("todo");
    expect(stored?.dueDate).toBeNull();
  });

  it("不正なstatusを渡したcreate_taskはエラーを返す", () => {
    const result = callTool("create_task", { title: "不正", status: "archived" });

    expect(result.isError).toBe(true);
  });

  it("titleを欠いたcreate_taskはエラーを返し、リスナーに通知しない", () => {
    const listener = vi.fn();
    const unsubscribe = onTasksChanged(listener);

    const result = callTool("create_task", { status: "todo" });

    expect(result.isError).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("create_task成功時にtasks-changedリスナーへ通知する", () => {
    const listener = vi.fn();
    const unsubscribe = onTasksChanged(listener);

    createTaskThroughTool({ title: "通知" });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    createTaskThroughTool({ title: "通知しない" });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("list_tasksは削除済みを除いた全タスクを返す", () => {
    createTaskThroughTool({ title: "残る" });
    const deletedId = createTaskThroughTool({ title: "消える" });
    callTool("delete_task", { id: deletedId, confirm: true });

    const result = callTool("list_tasks", {});

    expect(result.isError).toBeFalsy();
    expect(readJsonPayload(result)).toEqual({
      tasks: [expect.objectContaining({ title: "残る" })],
    });
  });

  it("update_taskは省略したフィールドを変更しない", () => {
    const id = createTaskThroughTool({ title: "旧題", status: "todo", due_date: "2026-08-10" });

    const result = callTool("update_task", { id, status: "done" });

    expect(result.isError).toBeFalsy();
    const stored = getTask(id);
    expect(stored?.title).toBe("旧題");
    expect(stored?.status).toBe("done");
    expect(stored?.dueDate).toBe("2026-08-10");
  });

  it("存在しないタスクのupdate_taskはエラーを返す", () => {
    const result = callTool("update_task", { id: randomUUID(), title: "x" });

    expect(result.isError).toBe(true);
  });

  it("delete_taskはconfirm: trueが無いと削除せずエラーを返す", () => {
    const id = createTaskThroughTool({ title: "確認なし削除" });

    const withoutConfirm = callTool("delete_task", { id });
    expect(withoutConfirm.isError).toBe(true);

    const falseConfirm = callTool("delete_task", { id, confirm: false });
    expect(falseConfirm.isError).toBe(true);

    expect(listTasks().map((task) => task.id)).toEqual([id]);
  });

  it("delete_taskはソフトデリートし、restore_taskで復元できる", () => {
    const id = createTaskThroughTool({ title: "削除と復元" });

    const deleted = callTool("delete_task", { id, confirm: true });
    expect(deleted.isError).toBeFalsy();
    expect(readJsonPayload(deleted)).toEqual({ deleted: true });
    expect(listTasks()).toEqual([]);

    const restored = callTool("restore_task", { id });
    expect(restored.isError).toBeFalsy();
    expect(listTasks().map((task) => task.id)).toEqual([id]);
  });

  it("削除されていないタスクのrestore_taskはエラーを返す", () => {
    const id = createTaskThroughTool({ title: "未削除" });

    expect(callTool("restore_task", { id }).isError).toBe(true);
  });

  it("型が不正な引数にはMCPエラーを返す", () => {
    expect(callTool("update_task", { id: 42 }).isError).toBe(true);
  });

  it("DBクローズ後の呼び出しはクラッシュせずMCPエラーを返す", () => {
    closeDb();

    const result = callTool("list_tasks", {});

    expect(result.isError).toBe(true);
    const [firstContent] = result.content;
    expect(firstContent?.type).toBe("text");
  });
});
