import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMBEDDING_MANIFEST_FILE_NAME,
  isEmbeddingModelManifest,
  readEmbeddingModelManifest,
} from "../../../src/main/llm/model-manifest";

const validManifest = () => ({
  id: "ruri-v3-70m-q8_0",
  file: "ruri-v3-70m-q8_0.gguf",
  dimensions: 384,
  contextSize: 8192,
  queryPrefix: "検索クエリ: ",
  documentPrefix: "検索文書: ",
  license: { name: "Apache-2.0", file: "ruri-v3-70m.LICENSE" },
});

describe("isEmbeddingModelManifest", () => {
  it("必須フィールドが揃っていれば通す", () => {
    expect(isEmbeddingModelManifest(validManifest())).toBe(true);
  });

  it.each(["id", "file", "dimensions", "contextSize", "queryPrefix", "documentPrefix", "license"])(
    "%s が欠けていたら弾く",
    (field) => {
      const manifest: Record<string, unknown> = { ...validManifest() };
      delete manifest[field];
      expect(isEmbeddingModelManifest(manifest)).toBe(false);
    },
  );

  it("licenseの中身が欠けていたら弾く", () => {
    expect(isEmbeddingModelManifest({ ...validManifest(), license: { name: "MIT" } })).toBe(false);
  });

  it("数値であるべきフィールドが文字列なら弾く", () => {
    expect(isEmbeddingModelManifest({ ...validManifest(), dimensions: "384" })).toBe(false);
  });

  it("dimensions・contextSizeが0以下なら弾く", () => {
    expect(isEmbeddingModelManifest({ ...validManifest(), dimensions: 0 })).toBe(false);
    expect(isEmbeddingModelManifest({ ...validManifest(), contextSize: -1 })).toBe(false);
  });

  it("オブジェクトでない値を弾く", () => {
    expect(isEmbeddingModelManifest(null)).toBe(false);
    expect(isEmbeddingModelManifest("manifest")).toBe(false);
    expect(isEmbeddingModelManifest(undefined)).toBe(false);
  });

  it("prefixは空文字でも通す（prefixを持たないモデルがある）", () => {
    expect(isEmbeddingModelManifest({ ...validManifest(), queryPrefix: "", documentPrefix: "" })).toBe(
      true,
    );
  });
});

describe("readEmbeddingModelManifest", () => {
  let modelsDir: string;

  beforeEach(() => {
    modelsDir = join(tmpdir(), `hanamask-manifest-test-${randomUUID()}`);
    mkdirSync(modelsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(modelsDir, { recursive: true, force: true });
  });

  const writeManifest = (content: string): void => {
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), content, "utf8");
  };

  it("マニフェストを読んで返す", () => {
    writeManifest(JSON.stringify(validManifest()));
    expect(readEmbeddingModelManifest(modelsDir)).toEqual(validManifest());
  });

  it("ファイルが無ければ throw する", () => {
    expect(() => readEmbeddingModelManifest(modelsDir)).toThrow(EMBEDDING_MANIFEST_FILE_NAME);
  });

  it("JSONとして壊れていたら throw する", () => {
    writeManifest("{ではない");
    expect(() => readEmbeddingModelManifest(modelsDir)).toThrow();
  });

  it("フィールドが足りなければ throw する", () => {
    writeManifest(JSON.stringify({ id: "x" }));
    expect(() => readEmbeddingModelManifest(modelsDir)).toThrow();
  });
});
