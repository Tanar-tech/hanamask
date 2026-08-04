import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  createNote,
  getNote,
  restoreNote,
  searchNotes,
  softDeleteNote,
  updateNote,
} from "../db/notes-repo.js";
import {
  createTask,
  listTasks,
  restoreTask,
  softDeleteTask,
  toTaskStatus,
  updateTask,
} from "../db/tasks-repo.js";
import { emitNotesChanged, emitTasksChanged } from "./change-emitter.js";
import type { TaskStatus } from "../../shared/preload-api.js";

export interface McpTool {
  definition: Tool;
  handler: (args: unknown) => CallToolResult;
}

export type NoteTool = McpTool;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const jsonResult = (payload: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

const errorResult = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// Any failure (invalid arguments, database not open) must reach the MCP client as an
// error result rather than rejecting and tearing down the transport.
const toToolHandler =
  (run: (args: Record<string, unknown>) => CallToolResult) =>
  (args: unknown): CallToolResult => {
    try {
      if (!isRecord(args)) {
        throw new Error("Tool arguments must be an object");
      }
      return run(args);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  };

const readString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`"${key}" must be a string`);
  }
  return value;
};

const readTags = (args: Record<string, unknown>): string[] => {
  const value = args.tags;
  if (value === undefined) return [];
  if (!isStringArray(value)) {
    throw new Error('"tags" must be an array of strings');
  }
  return value;
};

const readOptionalString = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`"${key}" must be a string`);
  }
  return value;
};

const readOptionalTags = (args: Record<string, unknown>): string[] | undefined => {
  const value = args.tags;
  if (value === undefined) return undefined;
  if (!isStringArray(value)) {
    throw new Error('"tags" must be an array of strings');
  }
  return value;
};

const createNoteTool: NoteTool = {
  definition: {
    name: "create_note",
    description: "Create a note in the local hanamask database.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        body: { type: "string", description: "Note body in Markdown" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for the note" },
      },
      required: ["title", "body"],
    },
  },
  handler: toToolHandler((args) => {
    const note = createNote({
      title: readString(args, "title"),
      body: readString(args, "body"),
      tags: readTags(args),
    });
    emitNotesChanged();
    return jsonResult({ note });
  }),
};

const getNoteTool: NoteTool = {
  definition: {
    name: "get_note",
    description: "Get a single note by id. Returns null when the note does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => jsonResult({ note: getNote(readString(args, "id")) })),
};

const searchNotesTool: NoteTool = {
  definition: {
    name: "search_notes",
    description: "Search notes whose title or body contains the query. An empty query returns all.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to look for in title and body" },
      },
      required: ["query"],
    },
  },
  handler: toToolHandler((args) => jsonResult({ notes: searchNotes(readString(args, "query")) })),
};

const updateNoteTool: NoteTool = {
  definition: {
    name: "update_note",
    description: "Update a note's title, body and/or tags. Omitted fields are left unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
        title: { type: "string", description: "New title" },
        body: { type: "string", description: "New body in Markdown" },
        tags: { type: "array", items: { type: "string" }, description: "New tags" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const note = updateNote(id, {
      title: readOptionalString(args, "title"),
      body: readOptionalString(args, "body"),
      tags: readOptionalTags(args),
    });
    if (note === null) {
      return errorResult(`Note not found: ${id}`);
    }
    emitNotesChanged();
    return jsonResult({ note });
  }),
};

const deleteNoteTool: NoteTool = {
  definition: {
    name: "delete_note",
    description:
      "Soft-delete a note (sets deletedAt; the note stops appearing in search and can be restored). Requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
        confirm: { type: "boolean", description: "Must be true to actually delete" },
      },
      required: ["id", "confirm"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (args.confirm !== true) {
      throw new Error('delete_note requires "confirm: true"');
    }
    const deleted = softDeleteNote(id);
    if (!deleted) {
      return errorResult(`Note not found or already deleted: ${id}`);
    }
    emitNotesChanged();
    return jsonResult({ deleted: true });
  }),
};

const restoreNoteTool: NoteTool = {
  definition: {
    name: "restore_note",
    description: "Restore a soft-deleted note so it reappears in search.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const note = restoreNote(id);
    if (note === null) {
      return errorResult(`Note not found or not deleted: ${id}`);
    }
    emitNotesChanged();
    return jsonResult({ note });
  }),
};

export const noteTools: readonly NoteTool[] = [
  createNoteTool,
  getNoteTool,
  searchNotesTool,
  updateNoteTool,
  deleteNoteTool,
  restoreNoteTool,
];

export const findNoteTool = (name: string): NoteTool | undefined =>
  noteTools.find((tool) => tool.definition.name === name);

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

const TASK_STATUS_SCHEMA = {
  type: "string",
  enum: ["todo", "in_progress", "done"],
  description: "Task status",
} as const;

const createTaskTool: McpTool = {
  definition: {
    name: "create_task",
    description: "Create a task in the local hanamask database.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        status: TASK_STATUS_SCHEMA,
        due_date: { type: "string", description: "Due date (ISO date), omitted when there is none" },
      },
      required: ["title"],
    },
  },
  handler: toToolHandler((args) => {
    const task = createTask({
      title: readString(args, "title"),
      status: readOptionalStatus(args) ?? DEFAULT_TASK_STATUS,
      dueDate: readOptionalDueDate(args) ?? null,
    });
    emitTasksChanged();
    return jsonResult({ task });
  }),
};

const updateTaskTool: McpTool = {
  definition: {
    name: "update_task",
    description: "Update a task's title, status and/or due date. Omitted fields are left unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id (uuid)" },
        title: { type: "string", description: "New title" },
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
      status: readOptionalStatus(args),
      dueDate: readOptionalDueDate(args),
    });
    if (task === null) {
      return errorResult(`Task not found: ${id}`);
    }
    emitTasksChanged();
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
    const deleted = softDeleteTask(id);
    if (!deleted) {
      return errorResult(`Task not found or already deleted: ${id}`);
    }
    emitTasksChanged();
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
    emitTasksChanged();
    return jsonResult({ task });
  }),
};

export const taskTools: readonly McpTool[] = [
  createTaskTool,
  updateTaskTool,
  listTasksTool,
  deleteTaskTool,
  restoreTaskTool,
];

export const findTaskTool = (name: string): McpTool | undefined =>
  taskTools.find((tool) => tool.definition.name === name);
