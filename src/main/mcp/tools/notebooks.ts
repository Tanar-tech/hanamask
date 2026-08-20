import type { McpTool } from "./shared.js";

export const notebookTools: McpTool[] = [];

export const findNotebookTool = (name: string): McpTool | undefined =>
  notebookTools.find((tool) => tool.definition.name === name);
