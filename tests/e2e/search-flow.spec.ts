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
  reserveMcpPort,
} from "./helpers.js";

// ポートは実行時にOSから空きを取る（固定するとE2Eの同時実行で衝突する）。
let E2E_MCP_PORT = 0;

const SEARCH_FIELD_LABEL = "ページとタスクを検索";
const RESULT_LIST_LABEL = "検索結果";

/*
 * 検索は本文まで見に行く。エージェントが増やし続ける記録の中から目当てのものを
 * 見つける唯一の手段なので、「出るはずのものが出ない」と利用者は自分の記録に
 * 辿り着けなくなる。削除したものが出てこないことも同じくらい大事。
 */
describe("search flow (find notes from the home screen)", () => {
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
    workDir = mkdtempSync(join(tmpdir(), "hanamask-e2e-search-"));
    dbFilePath = join(workDir, "hanamask.sqlite3");
    app = await launchApp(dbFilePath, E2E_MCP_PORT);
    const window = await app.firstWindow();
    await window.waitForLoadState();
    return window;
  };

  /*
   * 検索窓はホームにしかない。検索結果の画面から続けて引き直すことはできず、
   * 「戻る」で一度ホームへ帰る必要がある。
   */
  const search = async (window: Page, query: string): Promise<void> => {
    const back = window.getByRole("button", { name: "戻る" });
    if ((await back.count()) > 0) await back.click();
    await window.getByLabel(SEARCH_FIELD_LABEL).fill(query);
    // ノートのタイトルにも「検索」を含むものがあるので、厳密一致で絞る。
    await window.getByRole("button", { name: "検索", exact: true }).click();
  };

  it("本文に含まれる語でノートを見つけられる", async () => {
    const window = await startApp();

    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "検索で見つかるノート",
      body: "本文にだけ書いてある目印はカワセミ",
      tags: [],
    });
    await createNoteViaMcp(E2E_MCP_PORT, {
      title: "無関係なノート",
      body: "こちらには入っていない",
      tags: [],
    });

    // タイトルではなく本文にしかない語で引く。
    await search(window, "カワセミ");

    const results = window.getByRole("list", { name: RESULT_LIST_LABEL });
    await results.getByText("検索で見つかるノート").waitFor();
    await expect.poll(() => results.getByText("無関係なノート").count()).toBe(0);
    await window.screenshot({ path: join(SCREENSHOT_DIR, "search-01-found.png") });
  });

  it("削除したノートは検索に出てこない", async () => {
    const window = await startApp();

    const noteId = await createNoteViaMcp(E2E_MCP_PORT, {
      title: "消されるノート",
      body: "目印はカワセミ",
      tags: [],
    });

    await search(window, "カワセミ");
    await window.getByRole("list", { name: RESULT_LIST_LABEL }).getByText("消されるノート").waitFor();

    await callMcpTool(E2E_MCP_PORT, "delete_note", { id: noteId, confirm: true });

    await search(window, "カワセミ");
    await window.getByText("該当するページはありません").waitFor();
    await window.screenshot({ path: join(SCREENSHOT_DIR, "search-02-deleted-hidden.png") });
  });

  it("見つからないときは、その旨が出る", async () => {
    const window = await startApp();

    await createNoteViaMcp(E2E_MCP_PORT, { title: "あるノート", body: "本文", tags: [] });

    await search(window, "どこにも書いていない語");

    await window.getByText("該当するページはありません").waitFor();
  });
});
