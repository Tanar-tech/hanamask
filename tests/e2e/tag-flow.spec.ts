import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication, type Page } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  callMcpTool,
  createNoteViaMcp,
  launchApp,
  noteListOf,
  openNoteList,
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

/*
 * この機能の目的は「あるノートがプロジェクトAに所属し、プロジェクトBには
 * 所属していないことが明確に判別できる」こと。絞り込みとグループ表示は
 * 画面の結線なので、単体テストだけでは実際に効いているか分からない。
 */
describe("tag flow (filter and group notes by tag)", () => {
  let dbFilePath: string;
  let workDir: string;
  let app: ElectronApplication | undefined;

  beforeAll(async () => {
    E2E_MCP_PORT = await reserveMcpPort();
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
  });

  const startApp = async (): Promise<Page> => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-tags-"));
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    return window;
  };

  const seed = async (): Promise<void> => {
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "Aだけのノート",
      body: "案件Aの記録",
      tags: ["プロジェクトA"],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "Bだけのノート",
      body: "案件Bの記録",
      tags: ["プロジェクトB"],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "AとBのノート",
      body: "両方に関わる記録",
      tags: ["プロジェクトA", "プロジェクトB"],
    });
  };

  it("タグを選ぶと、そのタグを持たないノートが消える", async () => {
    const window = await startApp();
    await seed();
    await openNoteList(window);
    await noteListOf(window).getByText("Bだけのノート").waitFor();

    const filter = window.getByRole("group", { name: "タグで絞り込む" });
    await filter.getByRole("button", { name: "プロジェクトA" }).click();

    // Aに属するものだけが残る。Bだけのものは消える。
    await noteListOf(window).getByText("Aだけのノート").waitFor();
    await noteListOf(window).getByText("AとBのノート").waitFor();
    await expect.poll(() => noteListOf(window).getByText("Bだけのノート").count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "tag-01-filtered.png") });

    // 解除すると戻る。
    await filter.getByRole("button", { name: "すべて" }).click();
    await noteListOf(window).getByText("Bだけのノート").waitFor();
  });

  it("タグごとに分けると、複数のタグを持つノートは両方の見出しに出る", async () => {
    const window = await startApp();
    await seed();
    await openNoteList(window);
    await noteListOf(window).getByText("AとBのノート").waitFor();

    await window.getByRole("button", { name: "タグごとに分ける" }).click();

    const groupA = window.getByRole("region", { name: "プロジェクトA" });
    await groupA.getByText("Aだけのノート").waitFor();
    await groupA.getByText("AとBのノート").waitFor();
    await expect.poll(() => groupA.getByText("Bだけのノート").count()).toBe(0);

    const groupB = window.getByRole("region", { name: "プロジェクトB" });
    await groupB.getByText("AとBのノート").waitFor();
    await expect.poll(() => groupB.getByText("Aだけのノート").count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "tag-02-grouped.png") });
  });

  it("list_tagsは画面に出ているタグと件数を返す", async () => {
    await startApp();
    await seed();

    const listed = await callMcpTool(E2E_MCP_PORT, "list_tags", {});
    const text = JSON.stringify(listed.content);

    // プロジェクトAは2件（Aだけ・AとB）、プロジェクトBも2件。
    expect(text).toContain("プロジェクトA");
    expect(text).toContain("プロジェクトB");
    expect(text.replace(/\\"/g, '"')).toContain('"noteCount":2');
  });
});
