// 同梱GGUFが Hugging Face 版と同じベクトルを返すことを確かめるための Node 側。
// 出力した JSON を compare-with-hf.py に渡す。node-llama-cpp を更新したら回すこと。
//
//   node scripts/embedding-model/verify-embedding.mjs <model.gguf> <sentences.json> <out.json>

import { readFileSync, writeFileSync } from "node:fs";
import { getLlama } from "node-llama-cpp";

const CONTEXT_SIZE = 8192;

const [modelPath, sentencesPath, outPath] = process.argv.slice(2);
if (modelPath === undefined || sentencesPath === undefined || outPath === undefined) {
  console.error("使い方: verify-embedding.mjs <model.gguf> <sentences.json> <out.json>");
  process.exit(1);
}

const sentences = JSON.parse(readFileSync(sentencesPath, "utf8"));

const llama = await getLlama({ gpu: false });
const model = await llama.loadModel({ modelPath });
// batchSize を contextSize と同値にしないと、512トークン超の入力で pooling が壊れる。
const context = await model.createEmbeddingContext({
  contextSize: CONTEXT_SIZE,
  batchSize: CONTEXT_SIZE,
});

// node-llama-cpp 3.20 は UGM 語彙に BOS を付けないため、トークン列を自分で組み立てる。
const embed = async (text) => {
  const tokens = [model.tokens.bos, ...model.tokenize(text), model.tokens.eos];
  const vector = Array.from((await context.getEmbeddingFor(tokens)).vector);
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
};

await embed(sentences[0]); // ロード直後の1回目は計測から外す
const startedAt = Date.now();
const vectors = [];
for (const sentence of sentences) vectors.push(await embed(sentence));
const embedMs = Date.now() - startedAt;

writeFileSync(outPath, JSON.stringify({ vectors, embedMs }));
console.log(`dims=${vectors[0].length} sentences=${vectors.length} embedMs=${embedMs}`);

await context.dispose();
await model.dispose();
await llama.dispose();
