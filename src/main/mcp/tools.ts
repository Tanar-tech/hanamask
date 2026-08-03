import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { createNote, getNote, searchNotes } from "../db/notes-repo.js";
import { emitNotesChanged } from "./change-emitter.js";

export interface NoteTool {
  definition: Tool;
  handler: (args: unknown) => CallToolResult;
}

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

export const noteTools: readonly NoteTool[] = [createNoteTool, getNoteTool, searchNotesTool];

export const findNoteTool = (name: string): NoteTool | undefined =>
  noteTools.find((tool) => tool.definition.name === name);
