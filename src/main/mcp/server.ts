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

// The SDK refuses to reuse a stateless transport, so every request gets its own
// server/transport pair. All state lives in SQLite, so nothing is lost between requests.
const handleMcpRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createNoteMcpServer();
  res.on("close", () => {
    // The response is already gone, so a failed teardown has nowhere to be reported.
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
};

const routeRequest = (req: IncomingMessage, res: ServerResponse): void => {
  if (req.url === undefined || !req.url.startsWith(MCP_PATH)) {
    res.writeHead(NOT_FOUND_STATUS).end();
    return;
  }
  handleMcpRequest(req, res).catch(() => {
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

const closeHttpServer = (httpServer: HttpServer): Promise<void> =>
  new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });

export const startMcpServer = async (): Promise<McpServerHandle> => {
  const port = resolvePort();
  const httpServer = createServer(routeRequest);
  try {
    await listen(httpServer, port);
  } catch (error) {
    throw new Error(`Failed to start MCP server on ${HOST}:${port}: ${String(error)}`);
  }

  return {
    port,
    close: () => closeHttpServer(httpServer),
  };
};
