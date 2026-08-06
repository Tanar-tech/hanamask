import { createAnthropicClient } from "./anthropic-client.js";
import { runChatTurn } from "./agent-loop.js";
import type { ChatEvent, ChatMessage } from "../../shared/preload-api.js";
import { readApiKey, readChatSettings } from "../settings/chat-settings.js";

export const API_KEY_MISSING_MESSAGE =
  "APIキーが未設定です。設定画面でAnthropic APIキーを入力してください。";

/*
 * 中止はターンの区切りでのみ効かせる。実行中のツールを途中で止める手段は無く、
 * 止められると誤解されると危険なので、UI側も「すでに実行されたツールは
 * 取り消されません」と明記している。
 */
let aborted = false;

export const abortChat = (): void => {
  aborted = true;
};

export const sendChatMessage = async (input: {
  history: ChatMessage[];
  userText: string;
  onEvent: (event: ChatEvent) => void;
}): Promise<ChatMessage[]> => {
  const apiKey = readApiKey();
  if (apiKey === null) {
    throw new Error(API_KEY_MISSING_MESSAGE);
  }
  aborted = false;
  const { model } = readChatSettings();
  return runChatTurn({
    client: createAnthropicClient(apiKey),
    model,
    history: input.history,
    userText: input.userText,
    onEvent: input.onEvent,
    shouldAbort: () => aborted,
  });
};
