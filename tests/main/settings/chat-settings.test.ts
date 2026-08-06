import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const isEncryptionAvailable = vi.fn(() => true);
// 本物のOSセキュアストレージは使えないので、可逆な置換で「暗号化されたか」だけを見る。
const encryptString = vi.fn((plain: string) => Buffer.from(`enc:${plain}`, "utf-8"));
const decryptString = vi.fn((buffer: Buffer) => buffer.toString("utf-8").replace(/^enc:/, ""));

vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable, encryptString, decryptString },
}));

const importSettings = () => import("../../../src/main/settings/chat-settings");

const API_KEY = "sk-ant-api03-secret-value-4f2a";

let dir = "";
let settingsPath = "";

beforeEach(async () => {
  vi.resetModules();
  isEncryptionAvailable.mockReturnValue(true);
  dir = mkdtempSync(join(tmpdir(), "hanamask-chat-settings-"));
  settingsPath = join(dir, "chat-settings.json");
  const { setChatSettingsPath } = await importSettings();
  setChatSettingsPath(settingsPath);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("chat settings", () => {
  it("APIキーを平文で設定ファイルに書かない", async () => {
    const { saveApiKey } = await importSettings();

    saveApiKey(API_KEY);

    const written = readFileSync(settingsPath, "utf-8");
    expect(written).not.toContain(API_KEY);
    expect(written).not.toContain("secret-value");
    expect(encryptString).toHaveBeenCalledWith(API_KEY);
  });

  it("レンダラーには末尾4文字だけを渡す", async () => {
    const { saveApiKey, readChatSettings } = await importSettings();

    saveApiKey(API_KEY);

    const settings = readChatSettings();
    expect(settings.apiKeyMask).toBe("4f2a");
    expect(JSON.stringify(settings)).not.toContain(API_KEY);
  });

  it("mainプロセスからは復号した値を取り出せる", async () => {
    const { saveApiKey, readApiKey } = await importSettings();

    saveApiKey(API_KEY);

    expect(readApiKey()).toBe(API_KEY);
  });

  /*
   * 平文で書けば「保存できた」体験にはなるが、利用者は自分のAPIキーが平文で
   * 置かれたことに気づけない。断る方を選んでいるので、それをテストで固定する。
   */
  it("暗号化が使えない環境では保存せずエラーにする", async () => {
    const { saveApiKey } = await importSettings();
    isEncryptionAvailable.mockReturnValue(false);

    expect(() => {
      saveApiKey(API_KEY);
    }).toThrow(/セキュアストレージ/);
    expect(() => readFileSync(settingsPath, "utf-8")).toThrow();
  });

  it("空のAPIキーは保存しない", async () => {
    const { saveApiKey } = await importSettings();

    expect(() => {
      saveApiKey("   ");
    }).toThrow();
  });

  it("削除するとキーだけが消えモデルは残る", async () => {
    const { saveApiKey, saveChatModel, clearApiKey, readChatSettings } = await importSettings();
    saveApiKey(API_KEY);
    saveChatModel("claude-opus-4-5");

    clearApiKey();

    const settings = readChatSettings();
    expect(settings.apiKeyMask).toBeNull();
    expect(settings.model).toBe("claude-opus-4-5");
    expect(readFileSync(settingsPath, "utf-8")).not.toContain("4f2a");
  });

  it("復号できない値が入っていても未設定として扱う", async () => {
    const { readChatSettings } = await importSettings();
    writeFileSync(settingsPath, JSON.stringify({ apiKeyEncrypted: "not-base64-at-all" }), "utf-8");
    decryptString.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    expect(readChatSettings().apiKeyMask).toBeNull();
  });

  it("設定ファイルが壊れていても既定値で動く", async () => {
    const { readChatSettings } = await importSettings();
    writeFileSync(settingsPath, "{ broken", "utf-8");

    expect(readChatSettings()).toEqual({ apiKeyMask: null, model: "claude-sonnet-4-5" });
  });

  it("保存先が設定されていなければ読み書きしない", async () => {
    vi.resetModules();
    const { readChatSettings } = await importSettings();

    expect(() => readChatSettings()).toThrow(/not configured/);
  });
});
