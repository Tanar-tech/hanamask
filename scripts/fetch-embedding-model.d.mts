// tsconfig は allowJs:false なので、テストから .mjs を型付きで import するための宣言。
export interface ModelSource {
  url: string;
  sha256: string;
  sizeBytes: number;
}

export type FetchResult = "downloaded" | "skipped";

export const SOURCES_FILE_NAME: string;

export function parseModelSources(raw: string): [string, ModelSource][];

export function sha256OfFile(filePath: string): Promise<string>;

export function fetchModelFile(options: {
  modelsDir: string;
  fileName: string;
  source: ModelSource;
  fetchImpl: (url: string) => Promise<Response>;
  log: (message: string) => void;
}): Promise<FetchResult>;

export function fetchEmbeddingModels(options: {
  modelsDir: string;
  fetchImpl?: (url: string) => Promise<Response>;
  log?: (message: string) => void;
}): Promise<FetchResult[]>;

export function defaultModelsDir(): string;
