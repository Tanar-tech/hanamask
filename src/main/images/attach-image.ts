import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createImage } from "../db/images-repo.js";
import type { Image } from "../../shared/preload-api.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

// Set from the entry point rather than read from electron here, so this module (and the MCP
// tools that use it) stay importable outside an Electron runtime.
let imagesDirPath = "";

export const setImagesDirPath = (dirPath: string): void => {
  imagesDirPath = dirPath;
};

const resolveImagesDirPath = (): string => {
  if (imagesDirPath === "") {
    throw new Error("Images directory is not configured");
  }
  if (!existsSync(imagesDirPath)) mkdirSync(imagesDirPath, { recursive: true });
  return imagesDirPath;
};

const resolveImageExtension = (fileName: string, mimeType: string): string => {
  const fromFileName = extname(fileName);
  return fromFileName === "" ? (IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] ?? "") : fromFileName;
};

const decodeImageData = (dataBase64: string, mimeType: string): Buffer => {
  if (!(mimeType in IMAGE_EXTENSION_BY_MIME_TYPE)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  const data = Buffer.from(dataBase64, "base64");
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES} byte limit: ${data.byteLength} bytes`);
  }
  return data;
};

export interface AttachImageInput {
  noteId: string;
  fileName: string;
  dataBase64: string;
  mimeType: string;
}

// The source file is copied under the app data directory with a generated name so two
// attachments sharing a file name cannot overwrite each other.
export const attachImage = ({
  noteId,
  fileName,
  dataBase64,
  mimeType,
}: AttachImageInput): Image => {
  const data = decodeImageData(dataBase64, mimeType);
  const filePath = join(
    resolveImagesDirPath(),
    `${randomUUID()}${resolveImageExtension(fileName, mimeType)}`,
  );
  writeFileSync(filePath, data);
  return createImage({ noteId, filePath, mimeType });
};
