import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  createNote,
  getNote,
  listNoteVersions,
  restoreNote,
  restoreNoteVersion,
  searchNotes,
  softDeleteNote,
  updateNote,
} from "../db/notes-repo.js";
import {
  createTask,
  getTask,
  listTasks,
  restoreTask,
  softDeleteTask,
  toTaskStatus,
  updateTask,
} from "../db/tasks-repo.js";
import { listTagsInUse } from "../db/tags-repo.js";
import { createLink, deleteLink, listLinks, toEntityType } from "../db/links-repo.js";
import { attachImage } from "../images/attach-image.js";
import { navigateUi, showUiWindow } from "../ui/navigate.js";
import { emitLinksChanged, emitNotesChanged, emitTasksChanged } from "./change-emitter.js";
import type { EntityType, TaskStatus } from "../../shared/preload-api.js";

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

/*
 * タグはノートとタスクで同じ意味を持つ。片方だけ説明が変わると、エージェントが
 * 種別ごとに違う付け方をしてしまうので、宣言を1つにまとめる。
 */
const TAGS_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description:
    "Tags that group notes and tasks, typically by project or topic (for example a project name). " +
    "Always tag what you create so the user can tell which project a record belongs to. " +
    "Call list_tags first and reuse an existing tag when it means the same thing.",
} as const;


const createNoteTool: NoteTool = {
  definition: {
    name: "create_note",
    description:
      "Create a note in the local hanamask database. Tag it (see tags) so it can be grouped by project. " +
      "Write down what you finished, what you found out, and what is left for next time; " +
      "keep every decision in the body together with the reason why it was decided.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        body: { type: "string", description: "Note body in Markdown" },
        tags: TAGS_SCHEMA,
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
    emitNotesChanged({ entity: "note", action: "created", id: note.id, title: note.title });
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
    description:
      "Search notes whose title or body contains the query. An empty query returns all. " +
      "Search here before starting work, so past findings are not looked into twice and settled decisions are not reopened.",
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
        tags: TAGS_SCHEMA,
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
    emitNotesChanged({ entity: "note", action: "updated", id, title: note.title });
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
    // 削除するとタイトルを引けなくなるため、通知に載せる分を先に読んでおく。
    const title = getNote(id)?.title ?? "";
    const deleted = softDeleteNote(id);
    if (!deleted) {
      return errorResult(`Note not found or already deleted: ${id}`);
    }
    emitNotesChanged({ entity: "note", action: "deleted", id, title });
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
    emitNotesChanged({ entity: "note", action: "updated", id, title: note.title });
    return jsonResult({ note });
  }),
};

const listNoteVersionsTool: NoteTool = {
  definition: {
    name: "list_note_versions",
    description:
      "List a note's edit history, newest first. Each version is the content as it was just before an update.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) =>
    jsonResult({ versions: listNoteVersions(readString(args, "id")) }),
  ),
};

const restoreNoteVersionTool: NoteTool = {
  definition: {
    name: "restore_note_version",
    description:
      "Restore a note to a past version. The content being replaced is kept as a new version, so the restore itself can be undone.",
    inputSchema: {
      type: "object",
      properties: {
        version_id: { type: "string", description: "Note version id (uuid)" },
      },
      required: ["version_id"],
    },
  },
  handler: toToolHandler((args) => {
    const versionId = readString(args, "version_id");
    const note = restoreNoteVersion(versionId);
    if (note === null) {
      return errorResult(`Note version not found: ${versionId}`);
    }
    emitNotesChanged({ entity: "note", action: "updated", id: note.id, title: note.title });
    return jsonResult({ note });
  }),
};

const attachImageTool: NoteTool = {
  definition: {
    name: "attach_image",
    description:
      "Attach an image to a note. The image bytes are passed Base64 encoded, stored as a file under the app data directory, and the note keeps a path reference. Supported types: image/png, image/jpeg, image/gif, image/webp (10MB max).",
    inputSchema: {
      type: "object",
      properties: {
        note_id: { type: "string", description: "Note id (uuid) to attach the image to" },
        file_name: { type: "string", description: "Original file name, used for its extension" },
        data_base64: { type: "string", description: "Base64 encoded image bytes" },
        mime_type: { type: "string", description: "Image MIME type, e.g. image/png" },
      },
      required: ["note_id", "file_name", "data_base64", "mime_type"],
    },
  },
  handler: toToolHandler((args) => {
    const noteId = readString(args, "note_id");
    const image = attachImage({
      noteId,
      fileName: readString(args, "file_name"),
      dataBase64: readString(args, "data_base64"),
      mimeType: readString(args, "mime_type"),
    });
    emitNotesChanged({
      entity: "note",
      action: "updated",
      id: noteId,
      title: getNote(noteId)?.title ?? "",
    });
    return jsonResult({ image });
  }),
};

export const noteTools: readonly NoteTool[] = [
  createNoteTool,
  getNoteTool,
  searchNotesTool,
  updateNoteTool,
  deleteNoteTool,
  restoreNoteTool,
  listNoteVersionsTool,
  restoreNoteVersionTool,
  attachImageTool,
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

const ENTITY_TYPE_SCHEMA = {
  type: "string",
  enum: ["note", "task"],
  description: 'Entity type ("note" or "task")',
} as const;

const readEntityType = (args: Record<string, unknown>, key: string): EntityType =>
  toEntityType(args[key]);

const linkEntitiesTool: McpTool = {
  definition: {
    name: "link_entities",
    description: "Link two entities (notes and/or tasks) to each other.",
    inputSchema: {
      type: "object",
      properties: {
        from_type: ENTITY_TYPE_SCHEMA,
        from_id: { type: "string", description: "Id of the entity the link starts from" },
        to_type: ENTITY_TYPE_SCHEMA,
        to_id: { type: "string", description: "Id of the entity the link points to" },
      },
      required: ["from_type", "from_id", "to_type", "to_id"],
    },
  },
  handler: toToolHandler((args) => {
    const link = createLink({
      fromType: readEntityType(args, "from_type"),
      fromId: readString(args, "from_id"),
      toType: readEntityType(args, "to_type"),
      toId: readString(args, "to_id"),
    });
    emitLinksChanged();
    return jsonResult({ link });
  }),
};

const unlinkEntitiesTool: McpTool = {
  definition: {
    name: "unlink_entities",
    description: "Delete a link by its id. The linked entities themselves are left untouched.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Link id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (!deleteLink(id)) {
      return errorResult(`Link not found: ${id}`);
    }
    emitLinksChanged();
    return jsonResult({ deleted: true });
  }),
};

const listLinksTool: McpTool = {
  definition: {
    name: "list_links",
    description: "List every link attached to an entity, whether it is the from or the to side.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: ENTITY_TYPE_SCHEMA,
        entity_id: { type: "string", description: "Id of the entity to list links for" },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  handler: toToolHandler((args) =>
    jsonResult({
      links: listLinks(readEntityType(args, "entity_type"), readString(args, "entity_id")),
    }),
  ),
};

export const linkTools: readonly McpTool[] = [linkEntitiesTool, unlinkEntitiesTool, listLinksTool];

export const findLinkTool = (name: string): McpTool | undefined =>
  linkTools.find((tool) => tool.definition.name === name);

const OPENED_RESULT = { opened: true };

const openAppTool: McpTool = {
  definition: {
    name: "open_app",
    description:
      "Show the hanamask desktop window, starting it if it is not running yet and bringing it to the front if it is.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  handler: toToolHandler(() => {
    showUiWindow();
    return jsonResult(OPENED_RESULT);
  }),
};

const openNoteTool: McpTool = {
  definition: {
    name: "open_note",
    description: "Open a note's page in the desktop UI, bringing the window to the front.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    navigateUi({ kind: "note", id: readString(args, "id") });
    return jsonResult(OPENED_RESULT);
  }),
};

const openTaskTool: McpTool = {
  definition: {
    name: "open_task",
    description: "Open a task's page in the desktop UI, bringing the window to the front.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    navigateUi({ kind: "task", id: readString(args, "id") });
    return jsonResult(OPENED_RESULT);
  }),
};

const openSearchTool: McpTool = {
  definition: {
    name: "open_search",
    description:
      "Open the search result screen in the desktop UI for the given keyword. An empty query lists every note.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search notes for" },
      },
      required: ["query"],
    },
  },
  handler: toToolHandler((args) => {
    navigateUi({ kind: "search", query: readString(args, "query") });
    return jsonResult(OPENED_RESULT);
  }),
};

export const uiTools: readonly McpTool[] = [
  openAppTool,
  openNoteTool,
  openTaskTool,
  openSearchTool,
];

export const findUiTool = (name: string): McpTool | undefined =>
  uiTools.find((tool) => tool.definition.name === name);
