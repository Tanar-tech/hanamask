import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEmbeddingProvider } from "../../../src/main/llm/llama-embedding-provider";
import { readEmbeddingModelManifest } from "../../../src/main/llm/model-manifest";

/*
 * 実モデルが置かれている環境でだけ回る。CI とモデル未取得の作業ツリーでは丸ごと skip する
 * （GGUF は 77MB あるためリポジトリに置かず `npm run fetch:model` で取得する）。
 *
 * ここが守っているのは、BOS 付与と batchSize の指定という「抜けてもエラーにならず精度だけ
 * 静かに落ちる」2点。単体テストでは捕まえられないので、実モデルでの順位関係で確かめる。
 */
const modelsDir = join(import.meta.dirname, "../../../resources/models");
const modelPath = existsSync(join(modelsDir, "embedding.json"))
  ? join(modelsDir, readEmbeddingModelManifest(modelsDir).file)
  : "";
const hasModel = modelPath !== "" && existsSync(modelPath);

const dot = (a: Float32Array, b: Float32Array): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

describe.skipIf(!hasModel)("実モデルでの loadEmbeddingProvider", () => {
  it("関連する文が無関係な文より近くなる", async () => {
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("ready");
    if (availability.state !== "ready") throw new Error("ready でない");

    const query = await availability.provider.embedQuery("瑠璃色はどんな色？");
    const related = await availability.provider.embedDocument(
      "瑠璃色（るりいろ）は、紫みを帯びた濃い青。",
    );
    const unrelated = await availability.provider.embedDocument(
      "node-llama-cpp v3.20.0 は Node.js から llama.cpp を呼び出すライブラリ。",
    );

    expect(availability.provider.dimensions).toBe(384);
    expect(query.length).toBe(384);
    expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
    // 検証スパイクの実測は 0.932。BOS が落ちるとここが 0.9 を割る。
    expect(dot(query, related)).toBeGreaterThan(0.9);
  });
});
