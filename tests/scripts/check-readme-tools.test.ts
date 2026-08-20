import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectImplementedToolNames } from "../../scripts/check-readme-tools.mjs";

const INDENT = " ".repeat(4);

const toolFile = (name: string): string =>
  ["const tool = {", "  definition: {", `${INDENT}name: "${name}",`, "  },", "};"].join("\n");

const createToolsDir = (): string => mkdtempSync(join(tmpdir(), "hanamask-tools-"));

const writeToolFile = (dir: string, fileName: string, toolName: string): void => {
  writeFileSync(join(dir, fileName), toolFile(toolName));
};

describe("collectImplementedToolNames", () => {
  it("ディレクトリ配下の全ファイルからツール名を集める", () => {
    const dir = createToolsDir();
    writeToolFile(dir, "notes.ts", "create_note");
    writeToolFile(dir, "tasks.ts", "create_task");

    expect(collectImplementedToolNames(dir)).toEqual(new Set(["create_note", "create_task"]));
  });

  // ファイルを増やしたときに走査から漏れると、READMEに載せ忘れても緑のままになる。
  it("ファイルを増やすと検出数が増える", () => {
    const dir = createToolsDir();
    writeToolFile(dir, "notes.ts", "create_note");
    const before = collectImplementedToolNames(dir).size;

    writeToolFile(dir, "notebooks.ts", "create_notebook");

    expect(collectImplementedToolNames(dir).size).toBe(before + 1);
    expect(collectImplementedToolNames(dir).has("create_notebook")).toBe(true);
  });

  it("TypeScript以外のファイルは走査しない", () => {
    const dir = createToolsDir();
    writeToolFile(dir, "notes.ts", "create_note");
    writeFileSync(join(dir, "notes.md"), toolFile("documented_only"));

    expect(collectImplementedToolNames(dir)).toEqual(new Set(["create_note"]));
  });
});
