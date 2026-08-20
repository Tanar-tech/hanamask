import { navigateUi, showUiWindow } from "../../ui/navigate.js";
import { jsonResult, readString, toToolHandler, type McpTool } from "./shared.js";

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
