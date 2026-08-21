import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SemanticSearchResult } from "../../../src/shared/preload-api";

const searchSemanticEntities = vi.fn(
  async (): Promise<SemanticSearchResult> => ({ notes: [], tasks: [], notebooks: [] }),
);

vi.mock("../../../src/main/llm/semantic-search-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/main/llm/semantic-search-service")>()),
  searchSemanticEntities,
}));

const { findNoteTool } = await import("../../../src/main/mcp/tools/notes");

const callTool = async (args: unknown): Promise<void> => {
  const tool = findNoteTool("semantic_search_notes");
  if (tool === undefined) throw new Error("Tool not found");
  await tool.handler(args);
};

// 画面（IPC）と同じ件数の扱いになることを、MCP側でも固定する。
describe("semantic_search_notes の件数指定", () => {
  beforeEach(() => {
    searchSemanticEntities.mockClear();
  });

  it("上限を超える件数は丸める", async () => {
    await callTool({ query: "MCPの接続", limit: 101 });

    expect(searchSemanticEntities).toHaveBeenCalledWith("MCPの接続", 100);
  });

  it("件数を省略すると既定の10件になる", async () => {
    await callTool({ query: "MCPの接続" });

    expect(searchSemanticEntities).toHaveBeenCalledWith("MCPの接続", 10);
  });
});
