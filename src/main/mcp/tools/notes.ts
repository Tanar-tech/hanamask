import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getActiveNotebook } from "../../db/notebooks-repo.js";
import {
  createNote,
  getNote,
  listNoteVersions,
  moveNoteToNotebook,
  restoreNote,
  restoreNoteVersion,
  searchNotes,
  softDeleteNote,
  updateNote,
} from "../../db/notes-repo.js";
import {
  DEFAULT_SEMANTIC_LIMIT,
  MAX_SEMANTIC_LIMIT,
  normalizeSemanticLimit,
  searchSemanticEntities,
} from "../../llm/semantic-search-service.js";
import { attachImage } from "../../images/attach-image.js";
import { emitNotesChanged } from "../change-emitter.js";
import {
  type McpTool,
  errorResult,
  jsonResult,
  readOptionalString,
  readOptionalTags,
  readString,
  readTags,
  TAGS_SCHEMA,
  toToolHandler,
  type NoteTool,
} from "./shared.js";

/*
 * 既存の *_note は *_page と同じ処理の別名として残る。「非推奨」とは書かない
 * ——deprecated と書くとエージェントが自発的に乗り換え、利用者の手順書と食い違い始める。
 */
const compatNote = (pageName: string): string =>
  ` Operates on pages (same as ${pageName}); kept for compatibility.`;

const NOTEBOOK_ID_SCHEMA = {
  type: "string",
  description: "Id (uuid) of the notebook the page belongs to",
} as const;

const readNullableString = (args: Record<string, unknown>, key: string): string | null => {
  const value = args[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`"${key}" must be a string or null`);
  }
  return value;
};

const requireLiveNotebook = (notebookId: string): void => {
  if (getActiveNotebook(notebookId) === null) {
    throw new Error(`Notebook not found or deleted: ${notebookId}`);
  }
};

const createNoteTool: NoteTool = {
  definition: {
    name: "create_note",
    description:
      "Create a note in the local hanamask database. Tag it (see tags) so it can be grouped by project. " +
      "Write down what you finished, what you found out, and what is left for next time; " +
      "keep every decision in the body together with the reason why it was decided." +
      compatNote("create_page"),
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
    const notebookId = readNullableString(args, "notebook_id");
    if (notebookId !== null) requireLiveNotebook(notebookId);
    const note = createNote(
      { title: readString(args, "title"), body: readString(args, "body"), tags: readTags(args) },
      notebookId,
    );
    emitNotesChanged({ entity: "note", action: "created", id: note.id, title: note.title });
    return jsonResult({ note });
  }),
};

const createPageTool: NoteTool = {
  definition: {
    name: "create_page",
    description:
      "Create a page in the local hanamask database. Tag it (see tags) so it can be grouped by project. " +
      "Write down what you finished, what you found out, and what is left for next time; " +
      "keep every decision in the body together with the reason why it was decided. " +
      "Pass notebook_id to file the page into a notebook right away.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Page title" },
        body: { type: "string", description: "Page body in Markdown" },
        tags: TAGS_SCHEMA,
        notebook_id: NOTEBOOK_ID_SCHEMA,
      },
      required: ["title", "body"],
    },
  },
  handler: createNoteTool.handler,
};

const getNoteTool: NoteTool = {
  definition: {
    name: "get_note",
    description:
      "Get a single note by id. Returns null when the note does not exist." + compatNote("get_page"),
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

const getPageTool: NoteTool = {
  definition: {
    name: "get_page",
    description:
      "Get a single page by id, including the notebook it belongs to (notebookId, null when it belongs to none). " +
      "Returns null when the page does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: getNoteTool.handler,
};

const searchNotesTool: NoteTool = {
  definition: {
    name: "search_notes",
    description:
      "Search notes whose title or body contains the query. An empty query returns all. " +
      "Search here before starting work, so past findings are not looked into twice and settled decisions are not reopened." +
      compatNote("search_pages"),
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to look for in title and body" },
      },
      required: ["query"],
    },
  },
  handler: toToolHandler((args) =>
    jsonResult({
      notes: searchNotes(
        readString(args, "query"),
        readOptionalString(args, "notebook_id"),
      ),
    }),
  ),
};

const searchPagesTool: NoteTool = {
  definition: {
    name: "search_pages",
    description:
      "Search pages whose title or body contains the query. An empty query returns all. " +
      "Pass notebook_id to look only inside one notebook. " +
      "Search here before starting work, so past findings are not looked into twice and settled decisions are not reopened.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to look for in title and body" },
        notebook_id: NOTEBOOK_ID_SCHEMA,
      },
      required: ["query"],
    },
  },
  handler: searchNotesTool.handler,
};

const updateNoteTool: NoteTool = {
  definition: {
    name: "update_note",
    description:
      "Update a note's title, body and/or tags. Omitted fields are left unchanged." +
      compatNote("update_page"),
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

const updatePageTool: NoteTool = {
  definition: {
    name: "update_page",
    description: "Update a page's title, body and/or tags. Omitted fields are left unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
        title: { type: "string", description: "New title" },
        body: { type: "string", description: "New body in Markdown" },
        tags: TAGS_SCHEMA,
      },
      required: ["id"],
    },
  },
  handler: updateNoteTool.handler,
};

// confirm エラーの文言だけツール名ごとに変える（互換名 delete_note の既存文言を変えないため）。
const deletePageHandlerWith = (confirmError: string): McpTool["handler"] =>
  toToolHandler((args) => {
    const id = readString(args, "id");
    if (args.confirm !== true) {
      throw new Error(confirmError);
    }
    // 削除するとタイトルを引けなくなるため、通知に載せる分を先に読んでおく。
    const title = getNote(id)?.title ?? "";
    const deleted = softDeleteNote(id);
    if (!deleted) {
      return errorResult(`Note not found or already deleted: ${id}`);
    }
    emitNotesChanged({ entity: "note", action: "deleted", id, title });
    return jsonResult({ deleted: true });
  });

const deleteNoteTool: NoteTool = {
  definition: {
    name: "delete_note",
    description:
      "Soft-delete a note (sets deletedAt; the note stops appearing in search and can be restored). Requires confirm: true." +
      compatNote("delete_page"),
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id (uuid)" },
        confirm: { type: "boolean", description: "Must be true to actually delete" },
      },
      required: ["id", "confirm"],
    },
  },
  handler: deletePageHandlerWith('delete_note requires "confirm: true"'),
};

const deletePageTool: NoteTool = {
  definition: {
    name: "delete_page",
    description:
      "Soft-delete a page (sets deletedAt; the page stops appearing in search and can be restored). Requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
        confirm: { type: "boolean", description: "Must be true to actually delete" },
      },
      required: ["id", "confirm"],
    },
  },
  handler: deletePageHandlerWith('delete_page requires "confirm: true"'),
};

const restoreNoteTool: NoteTool = {
  definition: {
    name: "restore_note",
    description:
      "Restore a soft-deleted note so it reappears in search." + compatNote("restore_page"),
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

const restorePageTool: NoteTool = {
  definition: {
    name: "restore_page",
    description: "Restore a soft-deleted page so it reappears in search.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: restoreNoteTool.handler,
};

const movePageTool: NoteTool = {
  definition: {
    name: "move_page",
    description:
      "File a page into a notebook, move it to another one, or take it out. " +
      "Pass notebook_id: null to leave the page in no notebook.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
        notebook_id: {
          type: ["string", "null"],
          description: "Destination notebook id (uuid), or null to take the page out",
        },
      },
      required: ["id", "notebook_id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (!("notebook_id" in args)) {
      throw new Error('"notebook_id" is required (pass null to detach the page)');
    }
    const notebookId = readNullableString(args, "notebook_id");
    if (notebookId !== null) requireLiveNotebook(notebookId);
    const note = moveNoteToNotebook(id, notebookId);
    if (note === null) {
      return errorResult(`Page not found or deleted: ${id}`);
    }
    emitNotesChanged({ entity: "note", action: "updated", id, title: note.title });
    return jsonResult({ note });
  }),
};

const listNoteVersionsTool: NoteTool = {
  definition: {
    name: "list_note_versions",
    description:
      "List a note's edit history, newest first. Each version is the content as it was just before an update." +
      compatNote("list_page_versions"),
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

const listPageVersionsTool: NoteTool = {
  definition: {
    name: "list_page_versions",
    description:
      "List a page's edit history, newest first. Each version is the content as it was just before an update.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: listNoteVersionsTool.handler,
};

const restoreNoteVersionTool: NoteTool = {
  definition: {
    name: "restore_note_version",
    description:
      "Restore a note to a past version. The content being replaced is kept as a new version, so the restore itself can be undone." +
      compatNote("restore_page_version"),
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

const restorePageVersionTool: NoteTool = {
  definition: {
    name: "restore_page_version",
    description:
      "Restore a page to a past version. The content being replaced is kept as a new version, so the restore itself can be undone.",
    inputSchema: {
      type: "object",
      properties: {
        version_id: { type: "string", description: "Page version id (uuid)" },
      },
      required: ["version_id"],
    },
  },
  handler: restoreNoteVersionTool.handler,
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

// 検索そのものは semantic-search-service にある。画面（IPC）と同じ結果を返すため共有する。
const searchSemantically = async (query: string, limit: number): Promise<CallToolResult> =>
  jsonResult(await searchSemanticEntities(query, limit));

const semanticSearchNotesTool: NoteTool = {
  definition: {
    name: "semantic_search_notes",
    description:
      "Find notes, notebooks, and tasks whose meaning is close to a natural-language query, nearest first. " +
      "Results are grouped into `notes`, `notebooks` (a notebook matches on its summary), and `tasks`. " +
      "Unlike search_notes (keyword match), this finds records phrased differently but about the same thing. " +
      "Use it before starting work to pull up past findings even when you do not know the exact wording. " +
      "When the embedding model is not ready it returns empty results with an `unavailable` reason; fall back to search_notes then.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "探したい内容を表す自然文" },
        limit: {
          type: "integer",
          description: `返す件数の上限（既定 ${DEFAULT_SEMANTIC_LIMIT}、最大 ${MAX_SEMANTIC_LIMIT}）`,
        },
      },
      required: ["query"],
    },
  },
  handler: toToolHandler((args) =>
    searchSemantically(readString(args, "query"), normalizeSemanticLimit(args.limit)),
  ),
};

// *_page が正式名、*_note は同じ処理を指す互換名。両者は handler を共有する。
export const pageTools: readonly NoteTool[] = [
  createPageTool,
  getPageTool,
  searchPagesTool,
  updatePageTool,
  deletePageTool,
  restorePageTool,
  movePageTool,
  listPageVersionsTool,
  restorePageVersionTool,
];

export const noteTools: readonly NoteTool[] = [
  createNoteTool,
  getNoteTool,
  searchNotesTool,
  semanticSearchNotesTool,
  updateNoteTool,
  deleteNoteTool,
  restoreNoteTool,
  listNoteVersionsTool,
  restoreNoteVersionTool,
  attachImageTool,
  ...pageTools,
];

export const findNoteTool = (name: string): NoteTool | undefined =>
  noteTools.find((tool) => tool.definition.name === name);
