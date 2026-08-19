import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_FILE_MISSING_REASON,
  MODEL_LOAD_FAILED_REASON,
  loadEmbeddingProvider,
} from "../../../src/main/llm/llama-embedding-provider";
import { EMBEDDING_MANIFEST_FILE_NAME } from "../../../src/main/llm/model-manifest";

const manifest = {
  id: "ruri-v3-70m-q8_0",
  file: "ruri-v3-70m-q8_0.gguf",
  dimensions: 384,
  contextSize: 2048,
  batchSize: 2048,
  queryPrefix: "検索クエリ: ",
  documentPrefix: "検索文書: ",
  license: { name: "Apache-2.0", file: "ruri-v3-70m.LICENSE" },
};

describe("loadEmbeddingProvider", () => {
  let modelsDir: string;

  const readReason = (availability: Awaited<ReturnType<typeof loadEmbeddingProvider>>): string => {
    if (availability.state !== "unavailable") throw new Error("unavailable でない");
    return availability.reason;
  };

  beforeEach(() => {
    modelsDir = join(tmpdir(), `hanamask-llama-test-${randomUUID()}`);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(modelsDir, { recursive: true, force: true });
  });

  it("モデルディレクトリが無ければ unavailable を返す", async () => {
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
    expect(readReason(availability)).toBe(MODEL_LOAD_FAILED_REASON);
  });

  it("マニフェストが壊れていれば unavailable を返す", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), "{壊れている", "utf8");
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
    expect(readReason(availability)).toBe(MODEL_LOAD_FAILED_REASON);
  });

  it("GGUFファイルが無ければ unavailable を返す", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), JSON.stringify(manifest), "utf8");
    const availability = await loadEmbeddingProvider(modelsDir);
    expect(availability.state).toBe("unavailable");
    expect(readReason(availability)).toBe(MODEL_FILE_MISSING_REASON);
  });

  /*
   * reason はレンダラーとMCPツール経由でエージェントにも渡る。置き場所や生のエラー文言が
   * そこに混じらないことを固定する（SPEC S4）。
   */
  it("理由にモデルの置き場所やファイル名を含めない", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), JSON.stringify(manifest), "utf8");
    const reason = readReason(await loadEmbeddingProvider(modelsDir));
    expect(reason).not.toContain(modelsDir);
    expect(reason).not.toContain(manifest.file);
    expect(reason).not.toContain(EMBEDDING_MANIFEST_FILE_NAME);
  });

  it("マニフェストが無いときの理由にも置き場所を含めない", async () => {
    const reason = readReason(await loadEmbeddingProvider(modelsDir));
    expect(reason).not.toContain(modelsDir);
    expect(reason).not.toContain(EMBEDDING_MANIFEST_FILE_NAME);
  });

  it("詳しい内容はメインプロセスのログにだけ出す", async () => {
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME), JSON.stringify(manifest), "utf8");
    await loadEmbeddingProvider(modelsDir);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(modelsDir));
  });
});
