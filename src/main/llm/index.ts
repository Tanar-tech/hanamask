import type { EmbeddingAvailability } from "./embedding-provider.js";

export interface EmbeddingRuntime {
  availability(): EmbeddingAvailability;
}

// エントリポイントから注入する。ここで node-llama-cpp を読まないことで、
// 意味検索を使う側（MCPツール・IPC）が実モデル無しでもテストできる。
let runtime: EmbeddingRuntime | undefined;

const NOT_CONFIGURED: EmbeddingRuntime = {
  availability: () => ({ state: "unavailable", reason: "埋め込みモデルが構成されていない" }),
};

export const setEmbeddingRuntime = (next: EmbeddingRuntime): void => {
  runtime = next;
};

export const getEmbeddingRuntime = (): EmbeddingRuntime => runtime ?? NOT_CONFIGURED;
