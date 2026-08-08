import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { linkTools, noteTools, taskTools, uiTools, type McpTool } from "./tools.js";

const DEFAULT_PORT = 39217;
const MAX_PORT = 65535;
const HOST = "127.0.0.1";
const MCP_PATH = "/mcp";
const NOT_FOUND_STATUS = 404;
const INTERNAL_ERROR_STATUS = 500;

export interface McpServerHandle {
  port: number;
  close(): Promise<void>;
}

const resolvePort = (): number => {
  const configured = process.env.HANAMASK_MCP_PORT;
  if (configured === undefined || configured === "") return DEFAULT_PORT;
  const port = Number.parseInt(configured, 10);
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
    throw new Error(`HANAMASK_MCP_PORT must be a port number, got "${configured}"`);
  }
  return port;
};

const allTools: readonly McpTool[] = [...noteTools, ...taskTools, ...linkTools, ...uiTools];

const callTool = (name: string, args: unknown): CallToolResult => {
  const tool = allTools.find((candidate) => candidate.definition.name === name);
  if (tool === undefined) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  return tool.handler(args);
};

const createNoteMcpServer = (): Server => {
  const server = new Server(
    { name: "hanamask", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: allTools.map((tool) => tool.definition),
  }));
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(request.params.name, request.params.arguments),
  );
  return server;
};

// DNSリバインディング対策。攻撃者ドメインを127.0.0.1へ再解決させたページからでも、
// Hostは攻撃者ドメインのまま・Originは攻撃者オリジンのままなので、ここで弾ける。
// 正規のMCPクライアント（Claude Code等）はOriginを送らず、Hostはループバックになる。
const allowedHosts = (port: number): string[] => [
  `${HOST}:${port}`,
  `localhost:${port}`,
  `[::1]:${port}`,
];

const allowedOrigins = (port: number): string[] => [
  `http://${HOST}:${port}`,
  `http://localhost:${port}`,
  `http://[::1]:${port}`,
];

// The SDK refuses to reuse a stateless transport, so every request gets its own
// server/transport pair. All state lives in SQLite, so nothing is lost between requests.
const handleMcpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  port: number,
): Promise<void> => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableDnsRebindingProtection: true,
    allowedHosts: allowedHosts(port),
    allowedOrigins: allowedOrigins(port),
  });
  const server = createNoteMcpServer();
  res.on("close", () => {
    // The response is already gone, so a failed teardown has nowhere to be reported.
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
};

const routeRequest = (req: IncomingMessage, res: ServerResponse, port: number): void => {
  if (req.url === undefined || !req.url.startsWith(MCP_PATH)) {
    res.writeHead(NOT_FOUND_STATUS).end();
    return;
  }
  handleMcpRequest(req, res, port).catch(() => {
    if (!res.headersSent) {
      res.writeHead(INTERNAL_ERROR_STATUS).end();
      return;
    }
    res.end();
  });
};

const listen = (httpServer: HttpServer, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, HOST, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

// 許可Hostは実際に待ち受けているポートで組み立てる必要がある（HANAMASK_MCP_PORT=0 なら
// OSが割り当てた番号になるため、設定値をそのまま使うと正規の接続まで弾かれる）。
const boundPort = (httpServer: HttpServer): number => {
  const address = httpServer.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("MCP server is not listening on a TCP port");
  }
  return address.port;
};

const closeHttpServer = (httpServer: HttpServer): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });

export const startMcpServer = async (): Promise<McpServerHandle> => {
  const port = resolvePort();
  const httpServer: HttpServer = createServer((req, res) =>
    routeRequest(req, res, boundPort(httpServer)),
  );
  try {
    await listen(httpServer, port);
  } catch (error) {
    throw new Error(`Failed to start MCP server on ${HOST}:${port}: ${String(error)}`);
  }

  return {
    port: boundPort(httpServer),
    close: () => closeHttpServer(httpServer),
  };
};
