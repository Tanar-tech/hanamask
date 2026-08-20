import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createNote,
  getNote,
  listNoteVersions,
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
];

export const findNoteTool = (name: string): NoteTool | undefined =>
  noteTools.find((tool) => tool.definition.name === name);
