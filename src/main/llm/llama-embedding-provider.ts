import { existsSync } from "node:fs";
import { join } from "node:path";
import { asRecord } from "../records.js";
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
  getEmbeddingFor(tokens: number[]): Promise<LlamaEmbedding>;
}

interface LlamaModel {
  readonly tokens: { readonly bos: unknown; readonly eos: unknown };
  tokenize(text: string): number[];
  createEmbeddingContext(options: {
    contextSize: number;
    batchSize: number;
  }): Promise<LlamaEmbeddingContext>;
}

interface Llama {
  loadModel(options: { modelPath: string }): Promise<LlamaModel>;
}

interface NodeLlamaCpp {
  getLlama(options: { gpu: false }): Promise<Llama>;
}

const isNodeLlamaCpp = (value: unknown): value is NodeLlamaCpp => {
  const module = asRecord(value);
  return module !== null && typeof module.getLlama === "function";
};

const isLlamaEmbedding = (value: unknown): value is LlamaEmbedding => {
  const embedding = asRecord(value);
  if (embedding === null) return false;
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

const tokenOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

/*
 * 文字列をそのまま渡さずトークン列を組み立てているのは、node-llama-cpp 3.20 が
 * SentencePiece Unigram(UGM) 語彙のモデルに BOS を付けないため。付かないまま埋め込むと
 * エラーにはならず精度だけが静かに落ちる（実測: 関連文との内積 0.955 → 0.895）。
 */
const toTokenSequence = (model: LlamaModel, text: string, contextSize: number): number[] => {
  const bos = tokenOrNull(model.tokens.bos);
  const eos = tokenOrNull(model.tokens.eos);
  const reserved = (bos === null ? 0 : 1) + (eos === null ? 0 : 1);
  const body = model.tokenize(text).slice(0, contextSize - reserved);
  return [...(bos === null ? [] : [bos]), ...body, ...(eos === null ? [] : [eos])];
};

const createProvider = (
  manifest: EmbeddingModelManifest,
  model: LlamaModel,
  context: LlamaEmbeddingContext,
): EmbeddingProvider => {
  const embed = async (text: string): Promise<Float32Array> => {
    const tokens = toTokenSequence(model, text, manifest.contextSize);
    const embedding: unknown = await context.getEmbeddingFor(tokens);
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

/*
 * batchSize を contextSize と同値にするのは、既定の min(contextSize, 512) だと
 * 512トークンを超える入力が ubatch へ分割され、mean pooling が壊れるため。
 */
const openEmbeddingContext = async (
  llama: Llama,
  manifest: EmbeddingModelManifest,
  modelPath: string,
): Promise<EmbeddingProvider> => {
  const model = await llama.loadModel({ modelPath });
  const context = await model.createEmbeddingContext({
    contextSize: manifest.contextSize,
    batchSize: manifest.batchSize,
  });
  return createProvider(manifest, model, context);
};

/*
 * reason はレンダラーとMCPツール経由でエージェントにも渡るため、パスやSDKの生の文言は
 * 載せず定型文に丸める（SPEC S4）。原因の切り分けに要る詳細は main のログにだけ出す。
 */
export const MODEL_FILE_MISSING_REASON = "埋め込みモデルのファイルが見つかりません";
export const MODEL_LOAD_FAILED_REASON = "埋め込みモデルの読み込みに失敗しました";
export const ENGINE_UNAVAILABLE_REASON = "推論エンジンが利用できません";

const logDetail = (summary: string, detail: string): void => {
  console.error(`${summary}: ${detail}`);
};

const nameOfError = (error: unknown): string => (error instanceof Error ? error.name : "unknown");

// 推論エンジンの取得だけ切り分けるのは、モデルの問題と区別して伝えるため。
const loadEngine = async (): Promise<Llama | null> => {
  try {
    const { getLlama } = await importNodeLlamaCpp();
    return await getLlama({ gpu: false });
  } catch (error) {
    logDetail(ENGINE_UNAVAILABLE_REASON, nameOfError(error));
    return null;
  }
};

// 失敗はすべて unavailable に畳む。埋め込みが使えないことでアプリの起動や既存機能を止めない。
export const loadEmbeddingProvider = async (modelsDir: string): Promise<EmbeddingAvailability> => {
  try {
    const manifest = readEmbeddingModelManifest(modelsDir);
    const modelPath = join(modelsDir, manifest.file);
    if (!existsSync(modelPath)) {
      logDetail(MODEL_FILE_MISSING_REASON, modelPath);
      return { state: "unavailable", reason: MODEL_FILE_MISSING_REASON };
    }
    const llama = await loadEngine();
    if (llama === null) return { state: "unavailable", reason: ENGINE_UNAVAILABLE_REASON };
    return { state: "ready", provider: await openEmbeddingContext(llama, manifest, modelPath) };
  } catch (error) {
    logDetail(MODEL_LOAD_FAILED_REASON, nameOfError(error));
    return { state: "unavailable", reason: MODEL_LOAD_FAILED_REASON };
  }
};
