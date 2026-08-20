import type { EmbeddingProvider } from "../../../src/main/llm/embedding-provider";
import { normalizeVector } from "../../../src/main/llm/semantic-search";

const DEFAULT_DIMENSIONS = 8;

/*
 * 文字の出現を次元に振り分けるだけの決定的な埋め込み。実モデルを読まずに
 * 「似た文字列は似たベクトルになる」だけを再現し、意味検索まわりのテストで使う。
 */
const fakeVector = (text: string, dimensions: number): Float32Array => {
  const vector = new Float32Array(dimensions);
  Array.from(text).forEach((character, index) => {
    const bucket = (character.codePointAt(0) ?? 0) % dimensions;
    vector[bucket] = (vector[bucket] ?? 0) + 1 / (1 + index / text.length);
  });
  return normalizeVector(vector);
};

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  readonly embeddedQueries: string[] = [];
  readonly embeddedDocuments: string[] = [];

  constructor(options: { modelId?: string; dimensions?: number } = {}) {
    this.modelId = options.modelId ?? "fake-embedding-model";
    this.dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    this.embeddedQueries.push(text);
    return fakeVector(text, this.dimensions);
  }

  async embedDocument(text: string): Promise<Float32Array> {
    this.embeddedDocuments.push(text);
    return fakeVector(text, this.dimensions);
  }
}
