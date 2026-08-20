import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fetchEmbeddingModels,
  parseModelSources,
  type ModelSource,
} from "../../scripts/fetch-embedding-model.mjs";

const MODEL_FILE_NAME = "model.gguf";
const CONTENT = "gguf bytes";
const CONTENT_SHA256 = createHash("sha256").update(CONTENT).digest("hex");

const createModelsDir = (source: ModelSource): string => {
  const modelsDir = mkdtempSync(join(tmpdir(), "hanamask-models-"));
  writeFileSync(join(modelsDir, "sources.json"), JSON.stringify({ [MODEL_FILE_NAME]: source }));
  return modelsDir;
};

const source = (sha256: string): ModelSource => ({
  url: "https://example.invalid/model.gguf",
  sha256,
  sizeBytes: CONTENT.length,
});

const respondWith = (body: string) => () => Promise.resolve(new Response(body));

const silently = (): void => undefined;

describe("fetch-embedding-model", () => {
  it("sha256 が一致したら本名で保存する", async () => {
    const modelsDir = createModelsDir(source(CONTENT_SHA256));

    const results = await fetchEmbeddingModels({
      modelsDir,
      fetchImpl: respondWith(CONTENT),
      log: silently,
    });

    expect(results).toEqual(["downloaded"]);
    expect(readFileSync(join(modelsDir, MODEL_FILE_NAME), "utf8")).toBe(CONTENT);
  });

  it("sha256 が一致しなければ失敗し、部分ファイルを残さない", async () => {
    const modelsDir = createModelsDir(source("0".repeat(64)));

    await expect(
      fetchEmbeddingModels({ modelsDir, fetchImpl: respondWith(CONTENT), log: silently }),
    ).rejects.toThrow(/sha256/);

    expect(readdirSync(modelsDir)).toEqual(["sources.json"]);
  });

  it("HTTP エラーでも部分ファイルを残さない", async () => {
    const modelsDir = createModelsDir(source(CONTENT_SHA256));
    const notFound = () => Promise.resolve(new Response("", { status: 404 }));

    await expect(
      fetchEmbeddingModels({ modelsDir, fetchImpl: notFound, log: silently }),
    ).rejects.toThrow(/404/);

    expect(readdirSync(modelsDir)).toEqual(["sources.json"]);
  });

  it("既にあるファイルの sha256 が一致したら取得しない", async () => {
    const modelsDir = createModelsDir(source(CONTENT_SHA256));
    writeFileSync(join(modelsDir, MODEL_FILE_NAME), CONTENT);
    const refuse = () => Promise.reject(new Error("取得してはいけない"));

    const results = await fetchEmbeddingModels({ modelsDir, fetchImpl: refuse, log: silently });

    expect(results).toEqual(["skipped"]);
  });

  it("既にあるファイルの sha256 が違えば取り直す", async () => {
    const modelsDir = createModelsDir(source(CONTENT_SHA256));
    writeFileSync(join(modelsDir, MODEL_FILE_NAME), "古い中身");

    const results = await fetchEmbeddingModels({
      modelsDir,
      fetchImpl: respondWith(CONTENT),
      log: silently,
    });

    expect(results).toEqual(["downloaded"]);
    expect(readFileSync(join(modelsDir, MODEL_FILE_NAME), "utf8")).toBe(CONTENT);
  });

  it("https 以外の URL を受け付けない", () => {
    const raw = JSON.stringify({
      [MODEL_FILE_NAME]: { ...source(CONTENT_SHA256), url: "http://example.invalid/model.gguf" },
    });

    expect(() => parseModelSources(raw)).toThrow(/sources.json/);
  });

  it("sha256 が無い項目を受け付けない", () => {
    const raw = JSON.stringify({
      [MODEL_FILE_NAME]: { url: "https://example.invalid/model.gguf", sizeBytes: 1 },
    });

    expect(() => parseModelSources(raw)).toThrow(/sources.json/);
  });
});
