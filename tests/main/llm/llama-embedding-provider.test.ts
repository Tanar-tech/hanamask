import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEmbeddingProvider } from "../../../src/main/llm/llama-embedding-provider";
import { EMBEDDING_MANIFEST_FILE_NAME } from "../../../src/main/llm/model-manifest";

const manifest = {
  id: "ruri-v3-70m-q8_0",
  file: "ruri-v3-70m-q8_0.gguf",
  dimensions: 384,
  contextSize: 8192,
  queryPrefix: "検索クエリ: ",
  documentPrefix: "検索文書: ",
  license: { name: "Apache-2.0", file: "ruri-v3-70m.LICENSE" },
};

describe("loadEmbeddingProvider", () => {
  let modelsDir: string;

  beforeEach(() => {
    modelsDir = join(tmpdir(), `hanamask-llama-test-${randomUUID()}`);
  });

  afterEach(() => {
    rmSync(modelsDir, { recursive: true, force: true });
  });

  it("モデルディレクトリが無ければ unavailable を返す", async () => {
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
    if (availability.state !== "unavailable") throw new Error("unavailable でない");
    expect(availability.reason).toContain(EMBEDDING_MANIFEST_FILE_NAME);
  });

  it("マニフェストが壊れていれば unavailable を返す", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), "{壊れている", "utf8");
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
  });

  it("GGUFファイルが無ければ unavailable を返し、理由にファイル名を含む", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), JSON.stringify(manifest), "utf8");
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
    if (availability.state !== "unavailable") throw new Error("unavailable でない");
    expect(availability.reason).toContain(manifest.file);
  });
});
