import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMcpUrl, DEFAULT_MCP_PORT, MAX_PORT } from "../../../src/main/mcp/endpoint.js";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../../src/main/mcp/server.ts", import.meta.url)),
  "utf8",
);

const stringConstantInServer = (name: string): string => {
  const match = new RegExp(`const ${name} = "([^"]+)";`).exec(serverSource);
  if (match?.[1] === undefined) throw new Error(`server.ts has no ${name} constant`);
  return match[1];
};

describe("buildMcpUrl", () => {
  it("既定ポートのURLを組み立てる", () => {
    expect(buildMcpUrl(DEFAULT_MCP_PORT)).toBe("http://127.0.0.1:39217/mcp");
  });

  it("ポートを変えるとURLが追随する", () => {
    expect(buildMcpUrl(39299)).toBe("http://127.0.0.1:39299/mcp");
  });

  it("待ち受けは常にループバック（外部に開かない）", () => {
    expect(buildMcpUrl(DEFAULT_MCP_PORT).startsWith("http://127.0.0.1:")).toBe(true);
  });

  it("上限ぎりぎりのポートを受け付ける", () => {
    expect(buildMcpUrl(MAX_PORT)).toBe(`http://127.0.0.1:${String(MAX_PORT)}/mcp`);
  });

  it.each([0, -1, MAX_PORT + 1, 1.5, Number.NaN])("不正なポート %s では投げる", (port) => {
    expect(() => buildMcpUrl(port)).toThrow();
  });

  /*
   * ホストとパスは server.ts 側にも定数として存在する。片方だけ変えると、案内する
   * URLだけが実際の待ち受け先とずれて「繋がらない」になるため、ここで食い違いを検出する。
   */
  it("ホストとパスが server.ts の待ち受けと一致する", () => {
    const host = stringConstantInServer("HOST");
    const path = stringConstantInServer("MCP_PATH");
    expect(buildMcpUrl(DEFAULT_MCP_PORT)).toBe(
      `http://${host}:${String(DEFAULT_MCP_PORT)}${path}`,
    );
  });
});

describe("DEFAULT_MCP_PORT", () => {
  /*
   * READMEとインストール案内が載せている番号。変えると、既に登録済みの利用者の
   * 設定が黙って繋がらなくなるため、変更に気づけるよう固定する。
   */
  it("READMEに載せている 39217 のままである", () => {
    expect(DEFAULT_MCP_PORT).toBe(39217);
  });
});
