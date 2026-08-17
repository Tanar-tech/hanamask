/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mermaid from "mermaid";

/*
 * docs/html/ の図は skill「docs-html-sync」に従って手書きしている。構文を間違えても
 * ブラウザで開くまで分からず、開かなければ壊れたまま残る。CDNのmermaidが描くものと
 * 同じバージョン系列（package.jsonのmermaid）でパースだけ通しておく。
 */

const HTML_DIR = "docs/html";
const MERMAID_BLOCK = /<pre class="mermaid">([\s\S]*?)<\/pre>/g;

const htmlFiles = readdirSync(HTML_DIR).filter((name) => name.endsWith(".html"));

const diagramsOf = (fileName: string): string[] =>
  [...readFileSync(join(HTML_DIR, fileName), "utf8").matchAll(MERMAID_BLOCK)]
    .map((match) => match[1])
    .filter((code): code is string => code !== undefined);

describe("docs/html の Mermaid 図", () => {
  it("図を載せているページが1つ以上ある", () => {
    const withDiagram = htmlFiles.filter((name) => diagramsOf(name).length > 0);
    expect(withDiagram.length).toBeGreaterThan(0);
  });

  htmlFiles.forEach((fileName) => {
    const diagrams = diagramsOf(fileName);
    if (diagrams.length === 0) return;

    it(`${fileName} の図が構文として通る`, async () => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      for (const code of diagrams) {
        await expect(mermaid.parse(code)).resolves.toBeTruthy();
      }
    });
  });
});
