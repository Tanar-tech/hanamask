import Anthropic from "@anthropic-ai/sdk";
import type { ChatAssistantReply, ChatModelClient } from "./agent-loop.js";

/*
 * SDKとエージェントループの間の変換だけを持つ薄い層。ループ側がSDKの型を
 * 知らずに済むので、テストはSDK無しでループを回せる（agent-loop.test.ts）。
 */
const MAX_TOKENS = 4096;

export const createAnthropicClient = (apiKey: string): ChatModelClient => {
  const anthropic = new Anthropic({ apiKey });

  return {
    send: async ({ model, system, messages, tools }): Promise<ChatAssistantReply> => {
      const response = await anthropic.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: messages.map(({ role, content }) => ({ role, content })),
        tools: tools.map(({ name, description, input_schema }) => ({
          name,
          description,
          input_schema,
        })),
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      const toolUses = response.content
        .filter((block) => block.type === "tool_use")
        .map(({ id, name, input }) => ({ id, name, input }));

      return { text, toolUses, stopReason: response.stop_reason };
    },
  };
};
