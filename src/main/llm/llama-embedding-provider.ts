import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddingAvailability, EmbeddingProvider } from "./embedding-provider.js";
import { readEmbeddingModelManifest, type EmbeddingModelManifest } from "./model-manifest.js";
import { normalizeVector } from "./semantic-search.js";

/*
 * node-llama-cpp から使う部分だけを写した型。実体は動的 import で入ってくるため、
 * パッケージの型定義に依存せずに検査できるようにここで最小限を定義する。
 */
interface LlamaEmbedding {
  readonly vector: readonly number[];
}

interface LlamaEmbeddingContext {
  getEmbeddingFor(text: string): Promise<LlamaEmbedding>;
}

interface LlamaModel {
  createEmbeddingContext(options: { contextSize: number }): Promise<LlamaEmbeddingContext>;
}

interface Llama {
  loadModel(options: { modelPath: string }): Promise<LlamaModel>;
}

interface NodeLlamaCpp {
  getLlama(options: { gpu: false }): Promise<Llama>;
}

const isNodeLlamaCpp = (value: unknown): value is NodeLlamaCpp => {
  if (typeof value !== "object" || value === null) return false;
  const module: Record<string, unknown> = { ...value };
  return typeof module.getLlama === "function";
};

const isLlamaEmbedding = (value: unknown): value is LlamaEmbedding => {
  if (typeof value !== "object" || value === null) return false;
  const embedding: Record<string, unknown> = { ...value };
  return (
    Array.isArray(embedding.vector) &&
    embedding.vector.every((entry: unknown) => typeof entry === "number")
  );
};

/*
 * 動的 import にしている理由は2つ。CPU向けバイナリを含む重い依存を、モデルが無い環境で
 * 読み込まないため。そして依存追加（同梱作業）と本ファイルの実装を並行して進められるように、
 * モジュール解決の失敗も unavailable に畳めるようにするため。
 */
const NODE_LLAMA_CPP_MODULE_ID = "node-llama-cpp";

const importNodeLlamaCpp = async (): Promise<NodeLlamaCpp> => {
  const imported: unknown = await import(NODE_LLAMA_CPP_MODULE_ID);
  if (!isNodeLlamaCpp(imported)) {
    throw new Error("node-llama-cpp が期待する形で読み込めない");
  }
  return imported;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const createProvider = (
  manifest: EmbeddingModelManifest,
  context: LlamaEmbeddingContext,
): EmbeddingProvider => {
  const embed = async (text: string): Promise<Float32Array> => {
    const embedding: unknown = await context.getEmbeddingFor(text);
    if (!isLlamaEmbedding(embedding)) {
      throw new Error("埋め込みの戻り値が期待する形でない");
    }
    return normalizeVector(Float32Array.from(embedding.vector));
  };
  return {
    modelId: manifest.id,
    dimensions: manifest.dimensions,
    embedQuery: (text) => embed(`${manifest.queryPrefix}${text}`),
    embedDocument: (text) => embed(`${manifest.documentPrefix}${text}`),
  };
};

// 失敗はすべて unavailable に畳む。埋め込みが使えないことでアプリの起動や既存機能を止めない。
export const loadEmbeddingProvider = async (modelsDir: string): Promise<EmbeddingAvailability> => {
  try {
    const manifest = readEmbeddingModelManifest(modelsDir);
    const modelPath = join(modelsDir, manifest.file);
    if (!existsSync(modelPath)) {
      return { state: "unavailable", reason: `モデルファイルが見つからない: ${modelPath}` };
    }
    const { getLlama } = await importNodeLlamaCpp();
    const llama = await getLlama({ gpu: false });
    const model = await llama.loadModel({ modelPath });
    const context = await model.createEmbeddingContext({ contextSize: manifest.contextSize });
    return { state: "ready", provider: createProvider(manifest, context) };
  } catch (error) {
    return { state: "unavailable", reason: describeError(error) };
  }
};
