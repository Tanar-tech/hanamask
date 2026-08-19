/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  AgentSetup,
  buildClaudeCodeCommand,
  buildMcpConfigJson,
} from "../../src/renderer/components/AgentSetup";
import { stubHanamask } from "./hanamask-stub";

const DEFAULT_URL = "http://127.0.0.1:39217/mcp";
const CUSTOM_URL = "http://127.0.0.1:40000/mcp";

const COMMAND_COPY_LABEL = "登録コマンドをコピー";
const JSON_COPY_LABEL = "JSONをコピー";

const stubEndpoint = (port: number, url: string): void => {
  stubHanamask({ readMcpEndpoint: vi.fn(async () => ({ port, url })) });
};

const stubClipboard = (writeText: (text: string) => Promise<void>): void => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
};

const clickButton = async (name: string): Promise<void> => {
  const button = await screen.findByRole("button", { name });
  await act(async () => {
    button.click();
  });
};

// 整形済みJSONは改行と字下げごと比較したいので、既定の空白圧縮を止める。
const findExactText = (text: string): Promise<HTMLElement> =>
  screen.findByText(text, { normalizer: (value) => value });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("buildClaudeCodeCommand", () => {
  /* --scope user が無いとそのプロジェクト内だけの登録になり、別フォルダで再登録が要る。 */
  it("--scope user 付きの登録コマンドを組み立てる", () => {
    expect(buildClaudeCodeCommand(DEFAULT_URL)).toBe(
      `claude mcp add --scope user --transport http hanamask ${DEFAULT_URL}`,
    );
  });

  it("接続先が変わるとコマンドも追随する", () => {
    expect(buildClaudeCodeCommand(CUSTOM_URL)).toContain(CUSTOM_URL);
    expect(buildClaudeCodeCommand(CUSTOM_URL)).not.toContain(DEFAULT_URL);
  });
});

describe("buildMcpConfigJson", () => {
  it("MCPクライアントの設定ファイルに貼れる形にする", () => {
    expect(JSON.parse(buildMcpConfigJson(DEFAULT_URL))).toEqual({
      mcpServers: { hanamask: { type: "http", url: DEFAULT_URL } },
    });
  });

  it("接続先が変わるとJSONも追随する", () => {
    expect(JSON.parse(buildMcpConfigJson(CUSTOM_URL))).toEqual({
      mcpServers: { hanamask: { type: "http", url: CUSTOM_URL } },
    });
  });
});

describe("AgentSetup", () => {
  it("現在の接続先を表示する", async () => {
    stubEndpoint(39217, DEFAULT_URL);

    render(<AgentSetup />);

    expect(await screen.findByText(DEFAULT_URL)).toBeTruthy();
  });

  it("ポートを変えているとコマンドとJSONの両方が追随する", async () => {
    stubEndpoint(40000, CUSTOM_URL);

    render(<AgentSetup />);

    expect(await findExactText(buildClaudeCodeCommand(CUSTOM_URL))).toBeTruthy();
    expect(await findExactText(buildMcpConfigJson(CUSTOM_URL))).toBeTruthy();
  });

  it("登録後にエージェントを立ち上げ直す必要があると案内する", async () => {
    stubEndpoint(39217, DEFAULT_URL);

    render(<AgentSetup />);

    expect((await screen.findByText(/立ち上げ直/)).textContent).toContain("立ち上げ直");
  });

  it("登録コマンドをクリップボードへ入れる", async () => {
    stubEndpoint(39217, DEFAULT_URL);
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);

    render(<AgentSetup />);
    await clickButton(COMMAND_COPY_LABEL);

    expect(writeText).toHaveBeenCalledWith(buildClaudeCodeCommand(DEFAULT_URL));
  });

  it("JSONをクリップボードへ入れる", async () => {
    stubEndpoint(40000, CUSTOM_URL);
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);

    render(<AgentSetup />);
    await clickButton(JSON_COPY_LABEL);

    expect(writeText).toHaveBeenCalledWith(buildMcpConfigJson(CUSTOM_URL));
  });

  it("コピーに失敗したら理由を出す", async () => {
    stubEndpoint(39217, DEFAULT_URL);
    stubClipboard(() => Promise.reject(new Error("クリップボードを使えません")));

    render(<AgentSetup />);
    await clickButton(COMMAND_COPY_LABEL);

    expect(screen.getByRole("alert").textContent).toContain("クリップボードを使えません");
  });

  it("接続先の読み込みに失敗したら理由を出す", async () => {
    stubHanamask({
      readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
      readMcpEndpoint: vi.fn(() => Promise.reject(new Error("接続先を取得できません"))),
    });

    render(<AgentSetup />);

    expect((await screen.findByRole("alert")).textContent).toContain("接続先を取得できません");
  });
});
