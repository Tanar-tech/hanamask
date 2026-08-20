import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer } from "node:net";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type CallToolResult = Awaited<ReturnType<Client["callTool"]>>;

export const SCREENSHOT_DIR = join(import.meta.dirname, ".artifacts");

// VITE_DEV_SERVER_URL must not be forwarded: its presence tells src/main/index.ts to load
// the Vite dev server instead of the built dist/renderer/index.html these tests rely on.
const buildLaunchEnv = (dbFilePath: string, mcpPort: number): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "VITE_DEV_SERVER_URL") env[key] = value;
  }
  env.HANAMASK_DB_PATH = dbFilePath;
  env.HANAMASK_MCP_PORT = String(mcpPort);
  return env;
};

/*
 * ポートを定数で固定すると、worktree を分けて同時にE2Eを走らせたときに衝突して
 * 30秒タイムアウトで落ちる（落ちるspecが毎回変わるため原因の切り分けが難しい）。
 * OSに空きポートを選ばせてから解放し、その番号をアプリに渡す。解放から
 * アプリの bind までの隙間に他プロセスが同じ番号を取る可能性は理論上残るが、
 * OSは直前に払い出した番号を再利用しにくいため実用上は衝突しない。
 */
export const reserveMcpPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("could not determine a free port for the MCP server"));
        return;
      }
      const { port } = address;
      probe.close(() => {
        resolve(port);
      });
    });
  });

export const launchApp = (dbFilePath: string, mcpPort: number): Promise<ElectronApplication> =>
  electron.launch({ args: ["."], env: buildLaunchEnv(dbFilePath, mcpPort) });

export const callMcpTool = async (
  mcpPort: number,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> => {
  const client = new Client({ name: "hanamask-e2e", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`));
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError === true) {
      throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    }
    return result;
  } finally {
    await client.close();
  }
};

const readNoteId = (result: CallToolResult): string => {
  if (!("content" in result) || !Array.isArray(result.content)) {
    throw new Error(`Tool result has no content array: ${JSON.stringify(result)}`);
  }
  const [firstContent] = result.content;
  if (firstContent === undefined || firstContent.type !== "text") {
    throw new Error(`Tool result has no text content: ${JSON.stringify(result)}`);
  }
  const payload: unknown = JSON.parse(firstContent.text);
  if (typeof payload !== "object" || payload === null || !("note" in payload)) {
    throw new Error("payload has no note");
  }
  const { note } = payload;
  if (typeof note !== "object" || note === null || !("id" in note)) {
    throw new Error("note has no id");
  }
  const { id } = note;
  if (typeof id !== "string") throw new Error("note id is not a string");
  return id;
};

export const createNoteViaMcp = async (
  mcpPort: number,
  input: { title: string; body: string; tags: string[] },
): Promise<string> => readNoteId(await callMcpTool(mcpPort, "create_note", input));

// Several views render a <ul>, so scope note locators by NoteList's own accessible name
// to keep them unambiguous under Playwright's strict mode.
export const noteListOf = (window: Page) => window.getByRole("list", { name: "ページ一覧" });

export const taskListOf = (window: Page) => window.getByRole("list", { name: "タスク一覧" });

// The app now opens on the home screen, so reach the list views through the left rail.
export const openNoteList = (window: Page): Promise<void> =>
  window.getByRole("button", { name: "ノート", exact: true }).click();

export const openTaskList = (window: Page): Promise<void> =>
  window.getByRole("button", { name: "タスク", exact: true }).click();

export const openNoteDetail = async (window: Page, title: string): Promise<void> => {
  await noteListOf(window).getByRole("button", { name: title }).click();
  await window.getByRole("heading", { name: title }).waitFor();
};
