import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpTool {
  definition: Tool;
  // 第2引数はクライアントの中断シグナル。待ち受けツールだけが使い、他は受け取らない。
  handler: (args: unknown, signal?: AbortSignal) => CallToolResult | Promise<CallToolResult>;
}

export type NoteTool = McpTool;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const jsonResult = (payload: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

export const errorResult = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const toErrorResult = (error: unknown): CallToolResult =>
  errorResult(error instanceof Error ? error.message : String(error));

// Any failure (invalid arguments, database not open) must reach the MCP client as an
// error result rather than rejecting and tearing down the transport. 非同期ハンドラだけを
// Promise のまま返し、同期のハンドラは同期のまま返す（結果をそのまま読む呼び出し側が壊れない）。
export const toToolHandler =
  (run: (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>) =>
  (args: unknown): CallToolResult | Promise<CallToolResult> => {
    try {
      if (!isRecord(args)) {
        throw new Error("Tool arguments must be an object");
      }
      const result = run(args);
      return result instanceof Promise ? result.catch(toErrorResult) : result;
    } catch (error) {
      return toErrorResult(error);
    }
  };

export const readString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`"${key}" must be a string`);
  }
  return value;
};

export const readTags = (args: Record<string, unknown>): string[] => {
  const value = args.tags;
  if (value === undefined) return [];
  if (!isStringArray(value)) {
    throw new Error('"tags" must be an array of strings');
  }
  return value;
};

export const readOptionalString = (
  args: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`"${key}" must be a string`);
  }
  return value;
};

export const readOptionalTags = (args: Record<string, unknown>): string[] | undefined => {
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
export const TAGS_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description:
    "Tags that group notes and tasks, typically by project or topic (for example a project name). " +
    "Always tag what you create so the user can tell which project a record belongs to. " +
    "Call list_tags first and reuse an existing tag when it means the same thing.",
} as const;

export const TASK_STATUS_SCHEMA = {
  type: "string",
  enum: ["todo", "in_progress", "done"],
  description: "Task status",
} as const;

export const ENTITY_TYPE_SCHEMA = {
  type: "string",
  enum: ["note", "task", "notebook"],
  description: 'Entity type ("note", "task" or "notebook")',
} as const;
