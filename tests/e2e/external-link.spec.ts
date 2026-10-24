import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type ElectronApplication } from "playwright";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SCREENSHOT_DIR,
  createNoteViaMcp,
  launchApp,
  noteListOf,
  openNoteDetail,
  openNoteList,
  reserveMcpPort,
} from "./helpers.js";

let E2E_MCP_PORT = 0;

// .invalid は名前解決されないため、ガードが外れて実際に開いてしまっても外部へは出ない。
const EXTERNAL_URL = "https://hanamask-e2e.invalid/page";

const captureOpenExternal = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedExternalUrls: opened });
    shell.openExternal = async (url: string) => {
      opened.push(url);
    };
  });

const openedExternalUrls = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => {
    const value: unknown = Reflect.get(globalThis, "openedExternalUrls");
    return Array.isArray(value) ? value.filter((url) => typeof url === "string") : [];
  });

describe("external link (本文のリンクはアプリ内で開かない)", () => {
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

  it("本文のリンクをクリックすると新しいウィンドウを作らず、システムのブラウザへ渡す", async () => {
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-link-"));
    app = await launchApp(join(workDir, "hanamask.sqlite3"), E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    await captureOpenExternal(app);
    await openNoteList(window);

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "リンクのあるページ",
      body: `[外部のページ](${EXTERNAL_URL})`,
      tags: [],
    });
    await noteListOf(window).getByRole("button", { name: "リンクのあるページ" }).waitFor();
    await openNoteDetail(window, "リンクのあるページ");

    await window.getByRole("link", { name: "外部のページ" }).click();

    const launched = app;
    await expect.poll(() => openedExternalUrls(launched)).toEqual([EXTERNAL_URL]);
    expect(app.windows()).toHaveLength(1);
    expect(window.url()).not.toContain("hanamask-e2e.invalid");
    await window.screenshot({ path: join(SCREENSHOT_DIR, "external-link-01-stayed.png") });
  });
});
