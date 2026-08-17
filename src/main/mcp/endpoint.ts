export const DEFAULT_MCP_PORT = 39217;
export const MAX_PORT = 65535;

const HOST = "127.0.0.1";
const MCP_PATH = "/mcp";

/*
 * URLの正はサーバーが実際に待ち受けているポート。環境変数から引き直すと、
 * ポート0（OSに空きを選ばせる指定）のときに実際の待ち受け先とずれる。
 */
export const buildMcpUrl = (port: number): string => {
  if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
    throw new Error(`MCP port must be between 1 and ${MAX_PORT}, got ${String(port)}`);
  }
  return `http://${HOST}:${port}${MCP_PATH}`;
};
