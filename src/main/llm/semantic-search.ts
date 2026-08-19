import type { EmbeddedEntityType } from "../db/embeddings-repo.js";

export interface EmbeddingCandidate {
  entityType: EmbeddedEntityType;
  entityId: string;
  vector: Float32Array;
}

export interface Ranked {
  entityType: EmbeddedEntityType;
  entityId: string;
  score: number;
}

export const normalizeVector = (vector: Float32Array): Float32Array => {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return Float32Array.from(vector);
  return vector.map((value) => value / norm);
};

const dotProduct = (left: Float32Array, right: Float32Array): number =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

// 双方がL2正規化済みである前提なので、コサイン類似度は内積だけで求まる。
export const rankBySimilarity = (
  query: Float32Array,
  candidates: readonly EmbeddingCandidate[],
  limit: number,
): Ranked[] => {
  if (limit <= 0) return [];
  return candidates
    .filter((candidate) => candidate.vector.length === query.length)
    .map((candidate) => ({
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      score: dotProduct(query, candidate.vector),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};
