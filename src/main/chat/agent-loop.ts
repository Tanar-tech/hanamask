import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { linkTools, noteTools, taskTools, uiTools, type McpTool } from "../mcp/tools.js";

/*
 * チャットはhanamask独自のAIロジックを持たず、既にあるMCPツール群を
 * Claudeに渡して呼ばせるだけの薄い層（docs/REQUIREMENTS.md §1）。
 * ツール定義はMCPサーバーと同じ実体を使うので、CLIエージェントとチャットで
 * 呼べる操作が食い違うことがない。
 */
const allTools: readonly McpTool[] = [...noteTools, ...taskTools, ...linkTools, ...uiTools];

const SYSTEM_PROMPT = [
  "あなたはhanamaskというノート・タスク管理アプリの中で動くアシスタントです。",
  "利用者の依頼に応じて、提供されたツールでノートやタスクを読み書きしてください。",
  "ツールを使った後は、何をしたかを日本語で簡潔に伝えてください。",
  "破壊的な操作（削除）は、利用者が明示的に依頼したときだけ行ってください。",
].join("\n");

// 応答→ツール実行→再送、を繰り返す上限。無限に往復させないための歯止め。
const MAX_TURNS = 10;

export interface ChatToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatAssistantReply {
  text: string;
  toolUses: ChatToolUse[];
  stopReason: string | null;
}

export type ChatContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean };

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatContentBlock[];
}

// モデルへ渡すツールの形。MCPの inputSchema と名前が違うのでここで揃える。
export interface ChatToolDefinition {
  name: string;
  description: string;
  input_schema: Tool["inputSchema"];
}

/*
 * Anthropic SDKをそのまま持ち込まず、ここで必要な形だけを切り出す。
 * テストは実APIキー無しでこの口を差し替えて通す（docs/TASKS.md T12のテスト要件）。
 */
export interface ChatModelClient {
  send(input: {
    model: string;
    system: string;
    messages: ChatMessage[];
    tools: ChatToolDefinition[];
  }): Promise<ChatAssistantReply>;
}

export interface ChatEvent {
  kind: "assistant-text" | "tool-started" | "tool-finished" | "tool-failed";
  text?: string;
  toolName?: string;
  detail?: string;
}

const findTool = (name: string): McpTool | undefined =>
  allTools.find((tool) => tool.definition.name === name);

const textOf = (result: CallToolResult): string =>
  result.content
    .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
    .join("\n");

const runTool = (use: ChatToolUse): { text: string; isError: boolean } => {
  const tool = findTool(use.name);
  if (tool === undefined) {
    return { text: `ツール ${use.name} は存在しません`, isError: true };
  }
  try {
    const result = tool.handler(use.input);
    return { text: textOf(result), isError: result.isError === true };
  } catch (cause) {
    // ツールの失敗で会話ごと止めない。結果としてClaudeへ返し、次の判断を任せる。
    return { text: `ツールの実行に失敗しました: ${String(cause)}`, isError: true };
  }
};

export const chatToolDefinitions = (): ChatToolDefinition[] =>
  allTools.map(({ definition }) => ({
    name: definition.name,
    description: definition.description ?? "",
    input_schema: definition.inputSchema,
  }));

/*
 * 1回の利用者発言に対する応答を最後まで進める。ツールが要求されたら実行して
 * 結果を返し、ツール要求が無くなるまで繰り返す。経過はonEventで逐次通知する。
 */
export const runChatTurn = async (input: {
  client: ChatModelClient;
  model: string;
  history: ChatMessage[];
  userText: string;
  onEvent: (event: ChatEvent) => void;
}): Promise<ChatMessage[]> => {
  const messages: ChatMessage[] = [
    ...input.history,
    { role: "user", content: [{ type: "text", text: input.userText }] },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const reply = await input.client.send({
      model: input.model,
      system: SYSTEM_PROMPT,
      messages,
      tools: chatToolDefinitions(),
    });

    if (reply.text !== "") input.onEvent({ kind: "assistant-text", text: reply.text });

    const assistantContent: ChatContentBlock[] = [];
    if (reply.text !== "") assistantContent.push({ type: "text", text: reply.text });
    reply.toolUses.forEach((use) => {
      assistantContent.push({ type: "tool_use", id: use.id, name: use.name, input: use.input });
    });
    messages.push({ role: "assistant", content: assistantContent });

    if (reply.toolUses.length === 0) return messages;

    const results = reply.toolUses.map((use) => {
      input.onEvent({ kind: "tool-started", toolName: use.name });
      const { text, isError } = runTool(use);
      input.onEvent({
        kind: isError ? "tool-failed" : "tool-finished",
        toolName: use.name,
        detail: text,
      });
      const block: ChatContentBlock = {
        type: "tool_result",
        tool_use_id: use.id,
        content: text,
        is_error: isError,
      };
      return block;
    });
    messages.push({ role: "user", content: results });
  }

  input.onEvent({
    kind: "tool-failed",
    detail: `ツールの往復が${String(MAX_TURNS)}回に達したため打ち切りました`,
  });
  return messages;
};
