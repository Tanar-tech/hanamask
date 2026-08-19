import { describe, expect, it } from "vitest";
import {
  normalizeVector,
  rankBySimilarity,
  type EmbeddingCandidate,
} from "../../../src/main/llm/semantic-search";

const candidate = (
  entityId: string,
  vector: readonly number[],
  entityType: EmbeddingCandidate["entityType"] = "note",
): EmbeddingCandidate => ({
  entityType,
  entityId,
  vector: Float32Array.from(vector),
});

const scoresOf = (query: readonly number[], candidates: readonly EmbeddingCandidate[], limit = 10) =>
  rankBySimilarity(Float32Array.from(query), candidates, limit);

describe("normalizeVector", () => {
  it("L2ノルムが1になる", () => {
    const normalized = normalizeVector(Float32Array.from([3, 4]));
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);
  });

  it("元のベクトルを書き換えない", () => {
    const original = Float32Array.from([3, 4]);
    normalizeVector(original);
    expect(Array.from(original)).toEqual([3, 4]);
  });

  it("ゼロベクトルはゼロのまま返す（NaNにしない）", () => {
    const normalized = normalizeVector(Float32Array.from([0, 0, 0]));
    expect(Array.from(normalized)).toEqual([0, 0, 0]);
  });
});

describe("rankBySimilarity", () => {
  it("内積の降順に並べて返す", () => {
    const ranked = scoresOf(
      [1, 0],
      [candidate("far", [0, 1]), candidate("near", [1, 0]), candidate("mid", [0.6, 0.8])],
    );
    expect(ranked.map((row) => row.entityId)).toEqual(["near", "mid", "far"]);
    expect(ranked[0]?.score).toBeCloseTo(1, 5);
  });

  it("entityTypeを保って返す", () => {
    const ranked = scoresOf([1, 0], [candidate("t1", [1, 0], "task")]);
    expect(ranked[0]).toEqual({ entityType: "task", entityId: "t1", score: expect.closeTo(1, 5) });
  });

  it("limit件までに絞る", () => {
    const ranked = scoresOf(
      [1, 0],
      [candidate("a", [1, 0]), candidate("b", [0.9, 0.1]), candidate("c", [0.8, 0.2])],
      2,
    );
    expect(ranked.map((row) => row.entityId)).toEqual(["a", "b"]);
  });

  it("limitが0以下なら空を返す", () => {
    expect(scoresOf([1, 0], [candidate("a", [1, 0])], 0)).toEqual([]);
    expect(scoresOf([1, 0], [candidate("a", [1, 0])], -1)).toEqual([]);
  });

  it("同点は入力順を保つ", () => {
    const ranked = scoresOf(
      [1, 0],
      [candidate("first", [1, 0]), candidate("second", [1, 0]), candidate("third", [1, 0])],
    );
    expect(ranked.map((row) => row.entityId)).toEqual(["first", "second", "third"]);
  });

  it("候補が空なら空を返す", () => {
    expect(scoresOf([1, 0], [])).toEqual([]);
  });

  it("次元が違う候補は除外する", () => {
    const ranked = scoresOf([1, 0], [candidate("wrong", [1, 0, 0]), candidate("right", [1, 0])]);
    expect(ranked.map((row) => row.entityId)).toEqual(["right"]);
  });

  it("負の内積も順序に含める", () => {
    const ranked = scoresOf([1, 0], [candidate("opposite", [-1, 0]), candidate("orthogonal", [0, 1])]);
    expect(ranked.map((row) => row.entityId)).toEqual(["orthogonal", "opposite"]);
    expect(ranked[1]?.score).toBeCloseTo(-1, 5);
  });
});
