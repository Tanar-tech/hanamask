// 返すベクトルはL2正規化済みであること。検索側はコサイン類似度を内積だけで求める。
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<Float32Array>;
  embedDocument(text: string): Promise<Float32Array>;
}

export type EmbeddingAvailability =
  | { state: "ready"; provider: EmbeddingProvider }
  | { state: "loading" }
  | { state: "unavailable"; reason: string };
