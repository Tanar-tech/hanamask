import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_CHAT_MODEL, type ChatSettings } from "../../shared/preload-api.js";

/*
 * APIキーはOSのセキュアストレージ（Windows DPAPI等）で暗号化してから保存する。
 * 復号できるのはmainプロセスだけで、レンダラーには末尾4文字しか渡さない。
 * 平文で書く経路は用意しない。暗号化が使えない環境では保存を断る（後述）。
 */
const MASK_VISIBLE_LENGTH = 4;

interface StoredSettings {
  apiKeyEncrypted?: string;
  model?: string;
}

let settingsFilePath = "";

export const setChatSettingsPath = (filePath: string): void => {
  settingsFilePath = filePath;
};

const requirePath = (): string => {
  if (settingsFilePath === "") {
    throw new Error("chat settings path is not configured");
  }
  return settingsFilePath;
};

const readStored = (): StoredSettings => {
  const path = requirePath();
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const { apiKeyEncrypted, model } = parsed as Record<string, unknown>;
    return {
      apiKeyEncrypted: typeof apiKeyEncrypted === "string" ? apiKeyEncrypted : undefined,
      model: typeof model === "string" ? model : undefined,
    };
  } catch {
    // 壊れた設定ファイルでアプリが起動しなくなる方が困るので、既定値で続行する。
    return {};
  }
};

const writeStored = (settings: StoredSettings): void => {
  const path = requirePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
};

const maskOf = (apiKey: string): string =>
  apiKey.length <= MASK_VISIBLE_LENGTH ? apiKey : apiKey.slice(-MASK_VISIBLE_LENGTH);

export const readChatSettings = (): ChatSettings => {
  const stored = readStored();
  const apiKey = stored.apiKeyEncrypted === undefined ? null : decryptApiKey(stored.apiKeyEncrypted);
  return {
    apiKeyMask: apiKey === null ? null : maskOf(apiKey),
    model: stored.model ?? DEFAULT_CHAT_MODEL,
  };
};

const decryptApiKey = (encrypted: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    // 別マシンへ設定ファイルだけ持ち込んだ場合など。入れ直してもらうしかない。
    return null;
  }
};

/*
 * 暗号化が使えない環境では保存しない。平文で書けば「保存できた」体験にはなるが、
 * 利用者は自分のAPIキーが平文で置かれたことに気づけない。断る方が誠実。
 */
export const saveApiKey = (apiKey: string): void => {
  if (apiKey.trim() === "") {
    throw new Error("APIキーが空です");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "この環境ではOSのセキュアストレージを利用できないため、APIキーを保存できません",
    );
  }
  writeStored({
    ...readStored(),
    apiKeyEncrypted: safeStorage.encryptString(apiKey).toString("base64"),
  });
};

export const clearApiKey = (): void => {
  const { model } = readStored();
  writeStored({ model });
};

export const saveChatModel = (model: string): void => {
  if (model.trim() === "") {
    throw new Error("モデル名が空です");
  }
  writeStored({ ...readStored(), model });
};

// mainプロセス内のエージェントループだけが使う。レンダラーへは決して返さない。
export const readApiKey = (): string | null => {
  const { apiKeyEncrypted } = readStored();
  return apiKeyEncrypted === undefined ? null : decryptApiKey(apiKeyEncrypted);
};
