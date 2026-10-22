import { describe, expect, it } from "vitest";
import { chatTools } from "../../../src/main/mcp/tools/chat";
import { linkTools } from "../../../src/main/mcp/tools/links";
import { notebookTools } from "../../../src/main/mcp/tools/notebooks";
import { noteTools } from "../../../src/main/mcp/tools/notes";
import type { McpTool } from "../../../src/main/mcp/tools/shared";
import { taskTools } from "../../../src/main/mcp/tools/tasks";
import { uiTools } from "../../../src/main/mcp/tools/ui";

/*
 * 説明文は「エージェントが頼まれなくても読み書きする」ための唯一の手がかりなので、
 * 促しの一文が消えていないかを見る。文言そのものは改善のたびに変わるため固定しない。
 */

const allTools: readonly McpTool[] = [
  ...noteTools,
  ...notebookTools,
  ...taskTools,
  ...linkTools,
  ...uiTools,
  ...chatTools,
];

const describedText = (tool: McpTool): string => tool.definition.description ?? "";

const descriptionOf = (name: string): string => {
  const tool = allTools.find((candidate) => candidate.definition.name === name);
  if (tool === undefined) throw new Error(`Tool not found: ${name}`);
  return describedText(tool).toLowerCase();
};

describe("MCPツールの説明文", () => {
  it("どのツールも説明文が空でない", () => {
    allTools.forEach((tool) => {
      expect(describedText(tool).trim().length).toBeGreaterThan(0);
    });
  });

  it("search_notes が着手前に過去の記録を引くよう促している", () => {
    const description = descriptionOf("search_notes");
    expect(description).toMatch(/before/);
    expect(description).toMatch(/past|earlier|previous/);
  });

  it.each(["create_note", "create_task"])("%s が決定とその理由を書くよう促している", (name) => {
    const description = descriptionOf(name);
    expect(description).toMatch(/decision|decided/);
    expect(description).toMatch(/why|reason/);
  });

  it.each(["create_page", "move_page", "update_page", "update_note"])(
    "%s が所属ノート（束）の概要を update_notebook で追従更新するよう促している",
    (name) => {
      const description = descriptionOf(name);
      expect(description).toMatch(/update_notebook/);
      expect(description).toMatch(/summary/);
    },
  );

  it.each(["create_notebook", "update_notebook"])(
    "%s が概要をAIが書き・古くなれば書き直してよいと示している",
    (name) => {
      const description = descriptionOf(name);
      expect(description).toMatch(/summary/);
      expect(description).toMatch(/out of date|outdated|stale/);
      expect(description).toMatch(/history|restore/);
    },
  );
});
