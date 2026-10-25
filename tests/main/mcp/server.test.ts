import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { request } from "node:http";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { startMcpServer, type McpServerHandle } from "../../../src/main/mcp/server";

const PORT_RANGE_START = 40000;
const PORT_RANGE_SIZE = 10000;
const MAX_PORT_ATTEMPTS = 20;
const OK_STATUS = 200;
const FORBIDDEN_STATUS = 403;
const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;

const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.0.0" },
  },
});

const startOnFreePort = async (attemptsLeft = MAX_PORT_ATTEMPTS): Promise<McpServerHandle> => {
  if (attemptsLeft <= 0) throw new Error("No free port for the MCP server test");
  process.env.HANAMASK_MCP_PORT = String(
    PORT_RANGE_START + Math.floor(Math.random() * PORT_RANGE_SIZE),
  );
  try {
    return await startMcpServer();
  } catch {
    return startOnFreePort(attemptsLeft - 1);
  }
};

const postInitialize = (
  port: number,
  extraHeaders: Record<string, string>,
  requestBody: Buffer | string = INITIALIZE_BODY,
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "content-length": Buffer.byteLength(requestBody),
          ...extraHeaders,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(requestBody);
  });

describe("MCPサーバーのDNSリバインディング対策", () => {
  let handle: McpServerHandle;

  beforeEach(async () => {
    handle = await startOnFreePort();
  });

  afterEach(async () => {
    await handle.close();
    delete process.env.HANAMASK_MCP_PORT;
  });

  it("ローカルのMCPクライアント（Originなし・Hostは127.0.0.1）からの接続は通す", async () => {
    const response = await postInitialize(handle.port, {});
    expect(response.status).toBe(OK_STATUS);
    expect(response.body).toContain("serverInfo");
  });

  it("Hostがlocalhostの接続も通す", async () => {
    const response = await postInitialize(handle.port, { host: `localhost:${handle.port}` });
    expect(response.status).toBe(OK_STATUS);
  });

  it("攻撃者サイトのOriginを持つリクエストは拒否する", async () => {
    const response = await postInitialize(handle.port, { origin: "https://evil.example" });
    expect(response.status).toBe(FORBIDDEN_STATUS);
    expect(response.body).not.toContain("serverInfo");
  });

  it("DNSリバインディングで攻撃者ドメインのHostを持つリクエストは拒否する", async () => {
    const response = await postInitialize(handle.port, { host: `evil.example:${handle.port}` });
    expect(response.status).toBe(FORBIDDEN_STATUS);
    expect(response.body).not.toContain("serverInfo");
  });
});

describe("MCPサーバーの圧縮リクエスト拒否", () => {
  let handle: McpServerHandle;

  beforeEach(async () => {
    handle = await startOnFreePort();
  });

  afterEach(async () => {
    await handle.close();
    delete process.env.HANAMASK_MCP_PORT;
  });

  it("Brotli圧縮された本文は展開せずに拒否する", async () => {
    const compressed = brotliCompressSync(INITIALIZE_BODY);
    const response = await postInitialize(handle.port, { "content-encoding": "br" }, compressed);
    expect(response.status).toBe(UNSUPPORTED_MEDIA_TYPE_STATUS);
    expect(response.body).not.toContain("serverInfo");
  });

  it("gzip等の他の圧縮形式も拒否する", async () => {
    const compressed = gzipSync(INITIALIZE_BODY);
    const response = await postInitialize(handle.port, { "content-encoding": "gzip" }, compressed);
    expect(response.status).toBe(UNSUPPORTED_MEDIA_TYPE_STATUS);
  });

  it("Content-Encoding: identity は非圧縮として通す", async () => {
    const response = await postInitialize(handle.port, { "content-encoding": "identity" });
    expect(response.status).toBe(OK_STATUS);
  });
});
