// 同梱する埋め込みモデル(GGUF)をビルド前に取得する。取得元は sources.json に固定した
// HTTPS の URL だけで、利用者や環境変数から差し替える口は作らない（SPEC セキュリティ要件 S1）。
// 実行時（アプリ本体）は一切通信しない。ここはビルド時専用。

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const SOURCES_FILE_NAME = "sources.json";
const PARTIAL_SUFFIX = ".part";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const isModelSource = (value) =>
  typeof value === "object" &&
  value !== null &&
  typeof value.url === "string" &&
  value.url.startsWith("https://") &&
  typeof value.sha256 === "string" &&
  SHA256_PATTERN.test(value.sha256) &&
  typeof value.sizeBytes === "number" &&
  value.sizeBytes > 0;

export const parseModelSources = (raw) => {
  const parsed = JSON.parse(raw);
  const entries = Object.entries(parsed ?? {});
  const invalid = entries.find(([, source]) => !isModelSource(source));
  if (entries.length === 0 || invalid !== undefined) {
    throw new Error(`${SOURCES_FILE_NAME} の形式が正しくない`);
  }
  return entries;
};

export const sha256OfFile = async (filePath) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
};

const hasMatchingFile = async (filePath, expectedSha256) => {
  const found = await stat(filePath).catch(() => undefined);
  if (found === undefined) return false;
  return (await sha256OfFile(filePath)) === expectedSha256;
};

const streamToFile = async (body, filePath) => {
  const hash = createHash("sha256");
  const hashing = async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(Readable.fromWeb(body), hashing, createWriteStream(filePath));
  return hash.digest("hex");
};

const downloadVerified = async (source, filePath, fetchImpl) => {
  const response = await fetchImpl(source.url);
  if (!response.ok || response.body === null) {
    throw new Error(`ダウンロードに失敗した: HTTP ${response.status}`);
  }
  const actual = await streamToFile(response.body, filePath);
  if (actual !== source.sha256) {
    throw new Error(`sha256 が一致しない: 期待 ${source.sha256} / 実際 ${actual}`);
  }
};

export const fetchModelFile = async ({ modelsDir, fileName, source, fetchImpl, log }) => {
  const filePath = join(modelsDir, fileName);
  if (await hasMatchingFile(filePath, source.sha256)) {
    log(`${fileName}: 取得済み（sha256 一致）`);
    return "skipped";
  }
  const partialPath = `${filePath}${PARTIAL_SUFFIX}`;
  log(`${fileName}: ${source.url} から取得する（${source.sizeBytes} bytes）`);
  try {
    await downloadVerified(source, partialPath, fetchImpl);
  } catch (error) {
    // 検証を通らなかったものを次回の「取得済み」と誤認させないため、必ず残骸を消す。
    await rm(partialPath, { force: true });
    throw error;
  }
  await rename(partialPath, filePath);
  log(`${fileName}: 保存した`);
  return "downloaded";
};

export const fetchEmbeddingModels = async ({
  modelsDir,
  fetchImpl = globalThis.fetch,
  log = console.log,
}) => {
  const raw = await readFile(join(modelsDir, SOURCES_FILE_NAME), "utf8");
  const results = [];
  for (const [fileName, source] of parseModelSources(raw)) {
    results.push(await fetchModelFile({ modelsDir, fileName, source, fetchImpl, log }));
  }
  return results;
};

export const defaultModelsDir = () =>
  join(dirname(dirname(fileURLToPath(import.meta.url))), "resources/models");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await fetchEmbeddingModels({ modelsDir: defaultModelsDir() });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
