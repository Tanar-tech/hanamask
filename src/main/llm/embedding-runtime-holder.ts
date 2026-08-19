import type { EmbeddingAvailability } from "./embedding-provider.js";
import type { EmbeddingRuntime } from "./index.js";

export interface EmbeddingRuntimeHolder extends EmbeddingRuntime {
  onAvailabilityChanged: (listener: () => void) => () => void;
  setAvailability: (availability: EmbeddingAvailability) => void;
}

/*
 * モデルの読み込みはアプリ起動を待たせないよう非同期で走らせる。その間の問い合わせに
 * loading を返し、解決したら購読者へ知らせるための小さな状態置き場。
 */
export const createEmbeddingRuntimeHolder = (): EmbeddingRuntimeHolder => {
  let current: EmbeddingAvailability = { state: "loading" };
  const listeners = new Set<() => void>();
  return {
    availability: () => current,
    onAvailabilityChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setAvailability: (availability) => {
      current = availability;
      listeners.forEach((listener) => {
        listener();
      });
    },
  };
};
