import {
  createNotebook,
  getActiveNotebook,
  listNotebooks,
  listNotesInNotebook,
  restoreNotebook,
  softDeleteNotebook,
  updateNotebook,
} from "../../db/notebooks-repo.js";
import { emitNotebooksChanged } from "../change-emitter.js";
import {
  errorResult,
  jsonResult,
  readOptionalString,
  readOptionalTags,
  readString,
  readTags,
  TAGS_SCHEMA,
  toToolHandler,
  type McpTool,
} from "./shared.js";

const NOTEBOOK_ID_SCHEMA = { type: "string", description: "Notebook id (uuid)" } as const;

const SUMMARY_SCHEMA = {
  type: "string",
  description:
    "Short description of what this notebook collects. semantic_search_notes matches notebooks on it, so say what belongs here.",
} as const;

const createNotebookTool: McpTool = {
  definition: {
    name: "create_notebook",
    description:
      "Create a notebook, a named bundle that pages (notes) belong to. " +
      "Use it when a project or topic grows past a single page, so its pages stay together instead of only sharing a tag.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Notebook title" },
        summary: SUMMARY_SCHEMA,
        tags: TAGS_SCHEMA,
      },
      required: ["title", "summary"],
    },
  },
  handler: toToolHandler((args) => {
    const notebook = createNotebook({
      title: readString(args, "title"),
      summary: readString(args, "summary"),
      tags: readTags(args),
    });
    emitNotebooksChanged({
      entity: "notebook",
      action: "created",
      id: notebook.id,
      title: notebook.title,
    });
    return jsonResult({ notebook });
  }),
};

const getNotebookTool: McpTool = {
  definition: {
    name: "get_notebook",
    description:
      "Get a notebook together with the pages that belong to it, newest updated first. " +
      "Read it before adding to a topic, to see what the bundle already holds. " +
      "Returns null with an empty page list when the notebook does not exist or is in the trash.",
    inputSchema: {
      type: "object",
      properties: { id: NOTEBOOK_ID_SCHEMA },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const notebook = getActiveNotebook(id);
    return jsonResult({ notebook, notes: notebook === null ? [] : listNotesInNotebook(id) });
  }),
};

const listNotebooksTool: McpTool = {
  definition: {
    name: "list_notebooks",
    description:
      "List all notebooks, newest updated first (deleted ones are excluded). " +
      "Look here first when starting work, to reuse an existing bundle instead of opening a second one for the same topic.",
    inputSchema: { type: "object", properties: {} },
  },
  handler: toToolHandler(() => jsonResult({ notebooks: listNotebooks() })),
};

const updateNotebookTool: McpTool = {
  definition: {
    name: "update_notebook",
    description:
      "Update a notebook's title, summary and/or tags. Omitted fields are left unchanged. " +
      "Keep the summary current as the bundle grows, since it is what semantic search matches on.",
    inputSchema: {
      type: "object",
      properties: {
        id: NOTEBOOK_ID_SCHEMA,
        title: { type: "string", description: "New title" },
        summary: SUMMARY_SCHEMA,
        tags: TAGS_SCHEMA,
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    // ゴミ箱の中の束は一覧にも出ないので、そこへの書き込みは取り違えとみなして断る。
    if (getActiveNotebook(id) === null) {
      return errorResult(`Notebook not found or deleted: ${id}`);
    }
    const notebook = updateNotebook(id, {
      title: readOptionalString(args, "title"),
      summary: readOptionalString(args, "summary"),
      tags: readOptionalTags(args),
    });
    if (notebook === null) {
      return errorResult(`Notebook not found: ${id}`);
    }
    emitNotebooksChanged({ entity: "notebook", action: "updated", id, title: notebook.title });
    return jsonResult({ notebook });
  }),
};

const deleteNotebookTool: McpTool = {
  definition: {
    name: "delete_notebook",
    description:
      "Soft-delete a notebook (sets deletedAt; it stops appearing in the notebook list and can be restored). " +
      "The pages inside are not deleted and stay attached, so restoring brings the bundle back whole. Requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: {
        id: NOTEBOOK_ID_SCHEMA,
        confirm: { type: "boolean", description: "Must be true to actually delete" },
      },
      required: ["id", "confirm"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (args.confirm !== true) {
      throw new Error('delete_notebook requires "confirm: true"');
    }
    // 削除するとタイトルを引けなくなるため、通知に載せる分を先に読んでおく。
    const title = getActiveNotebook(id)?.title ?? "";
    if (!softDeleteNotebook(id)) {
      return errorResult(`Notebook not found or already deleted: ${id}`);
    }
    emitNotebooksChanged({ entity: "notebook", action: "deleted", id, title });
    return jsonResult({ deleted: true });
  }),
};

const restoreNotebookTool: McpTool = {
  definition: {
    name: "restore_notebook",
    description:
      "Restore a soft-deleted notebook so it reappears in the notebook list with its pages still attached.",
    inputSchema: {
      type: "object",
      properties: { id: NOTEBOOK_ID_SCHEMA },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    const notebook = restoreNotebook(id);
    if (notebook === null) {
      return errorResult(`Notebook not found or not deleted: ${id}`);
    }
    emitNotebooksChanged({ entity: "notebook", action: "updated", id, title: notebook.title });
    return jsonResult({ notebook });
  }),
};

export const notebookTools: readonly McpTool[] = [
  createNotebookTool,
  getNotebookTool,
  listNotebooksTool,
  updateNotebookTool,
  deleteNotebookTool,
  restoreNotebookTool,
];

export const findNotebookTool = (name: string): McpTool | undefined =>
  notebookTools.find((tool) => tool.definition.name === name);
