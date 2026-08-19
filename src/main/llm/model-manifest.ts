import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asRecord } from "../records.js";

export const EMBEDDING_MANIFEST_FILE_NAME = "embedding.json";

export interface EmbeddingModelLicense {
  name: string;
  file: string;
}

export interface EmbeddingModelManifest {
  id: string;
  file: string;
  dimensions: number;
  contextSize: number;
  batchSize: number;
  queryPrefix: string;
  documentPrefix: string;
  license: EmbeddingModelLicense;
}

const isEmbeddingModelLicense = (value: unknown): value is EmbeddingModelLicense => {
  const license = asRecord(value);
  if (license === null) return false;
  return typeof license.name === "string" && typeof license.file === "string";
};

const isPositiveNumber = (value: unknown): boolean => typeof value === "number" && value > 0;

export const isEmbeddingModelManifest = (value: unknown): value is EmbeddingModelManifest => {
  const manifest = asRecord(value);
  if (manifest === null) return false;
  return (
    typeof manifest.id === "string" &&
    typeof manifest.file === "string" &&
    isPositiveNumber(manifest.dimensions) &&
    isPositiveNumber(manifest.contextSize) &&
    isPositiveNumber(manifest.batchSize) &&
    typeof manifest.queryPrefix === "string" &&
    typeof manifest.documentPrefix === "string" &&
    isEmbeddingModelLicense(manifest.license)
  );
};

export const readEmbeddingModelManifest = (modelsDir: string): EmbeddingModelManifest => {
  const manifestPath = join(modelsDir, EMBEDDING_MANIFEST_FILE_NAME);
  const raw = readFileSync(manifestPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isEmbeddingModelManifest(parsed)) {
    throw new Error(`モデルマニフェストの形式が正しくない: ${manifestPath}`);
  }
  return parsed;
};
