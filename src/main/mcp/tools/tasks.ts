import {
  createTask,
  getTask,
  listTasks,
  restoreTask,
  softDeleteTask,
  toTaskStatus,
  updateTask,
} from "../../db/tasks-repo.js";
import { listTagsInUse } from "../../db/tags-repo.js";
import { emitTasksChanged } from "../change-emitter.js";
import type { TaskStatus } from "../../../shared/preload-api.js";
import {
  errorResult,
  jsonResult,
  readOptionalString,
  readOptionalTags,
  readString,
  TAGS_SCHEMA,
  TASK_STATUS_SCHEMA,
  toToolHandler,
  type McpTool,
} from "./shared.js";

const DEFAULT_TASK_STATUS: TaskStatus = "todo";

// due_date accepts null explicitly so a caller can clear an existing deadline.
const readOptionalDueDate = (args: Record<string, unknown>): string | null | undefined => {
  const value = args.due_date;
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    throw new Error('"due_date" must be a string or null');
  }
  return value;
};

const readOptionalStatus = (args: Record<string, unknown>): TaskStatus | undefined => {
  const value = args.status;
  if (value === undefined) return undefined;
  return toTaskStatus(value);
};

const createTaskTool: McpTool = {
  definition: {
    name: "create_task",
    description:
      "Create a task in the local hanamask database. Tag it (see tags) so it can be grouped by project. " +
      "A title alone is not enough: put the background, the acceptance criteria, and any decision made so far " +
      "with the reason why in the body.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        body: { type: "string", description: "Task body in Markdown, omitted when there is none" },
        tags: TAGS_SCHEMA,
        status: TASK_STATUS_SCHEMA,
        due_date: { type: "string", description: "Due date (ISO date), omitted when there is none" },
      },
      required: ["title"],
    },
  },
  handler: toToolHandler((args) => {
    const task = createTask({
      title: readString(args, "title"),
      body: readOptionalString(args, "body"),
      tags: readOptionalTags(args),
      status: readOptionalStatus(args) ?? DEFAULT_TASK_STATUS,
      dueDate: readOptionalDueDate(args) ?? null,
    });
    emitTasksChanged({ entity: "task", action: "created", id: task.id, title: task.title });
    return jsonResult({ task });
  }),
};

const updateTaskTool: McpTool = {
  definition: {
    name: "update_task",
    description:
      "Update a task's title, body, status and/or due date. Omitted fields are left unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id (uuid)" },
        title: { type: "string", description: "New title" },
        body: { type: "string", description: "New body in Markdown" },
        tags: TAGS_SCHEMA,
        status: TASK_STATUS_SCHEMA,
        due_date: { type: ["string", "null"], description: "New due date, or null to clear it" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const task = updateTask(id, {
      title: readOptionalString(args, "title"),
      body: readOptionalString(args, "body"),
      tags: readOptionalTags(args),
      status: readOptionalStatus(args),
      dueDate: readOptionalDueDate(args),
    });
    if (task === null) {
      return errorResult(`Task not found: ${id}`);
    }
    emitTasksChanged({ entity: "task", action: "updated", id, title: task.title });
    return jsonResult({ task });
  }),
};

const listTasksTool: McpTool = {
  definition: {
    name: "list_tasks",
    description: "List tasks. Soft-deleted tasks are excluded.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: toToolHandler(() => jsonResult({ tasks: listTasks() })),
};

/*
 * エージェントは過去に自分が何と名付けたかを覚えていない。既存のタグを引けないと、
 * 同じ案件に「プロジェクトA」「project-a」のような別名が付き、グループとして
 * 機能しなくなる。付ける前にこれを引いてもらう。
 */
const listTagsTool: McpTool = {
  definition: {
    name: "list_tags",
    description:
      "List tags already in use, with how many notes and tasks carry each one. " +
      "Call this before tagging so you reuse an existing tag instead of inventing a new name for the same thing.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: toToolHandler(() => jsonResult({ tags: listTagsInUse() })),
};

const deleteTaskTool: McpTool = {
  definition: {
    name: "delete_task",
    description:
      "Soft-delete a task (sets deletedAt; the task stops appearing in list_tasks and can be restored). Requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id (uuid)" },
        confirm: { type: "boolean", description: "Must be true to actually delete" },
      },
      required: ["id", "confirm"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (args.confirm !== true) {
      throw new Error('delete_task requires "confirm: true"');
    }
    // 削除するとタイトルを引けなくなるため、通知に載せる分を先に読んでおく。
    const title = getTask(id)?.title ?? "";
    const deleted = softDeleteTask(id);
    if (!deleted) {
      return errorResult(`Task not found or already deleted: ${id}`);
    }
    emitTasksChanged({ entity: "task", action: "deleted", id, title });
    return jsonResult({ deleted: true });
  }),
};

const restoreTaskTool: McpTool = {
  definition: {
    name: "restore_task",
    description: "Restore a soft-deleted task so it reappears in list_tasks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const task = restoreTask(id);
    if (task === null) {
      return errorResult(`Task not found or not deleted: ${id}`);
    }
    emitTasksChanged({ entity: "task", action: "updated", id, title: task.title });
    return jsonResult({ task });
  }),
};

export const taskTools: readonly McpTool[] = [
  createTaskTool,
  updateTaskTool,
  listTasksTool,
  listTagsTool,
  deleteTaskTool,
  restoreTaskTool,
];

export const findTaskTool = (name: string): McpTool | undefined =>
  taskTools.find((tool) => tool.definition.name === name);
