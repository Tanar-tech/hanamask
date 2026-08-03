// use-document-title.ts の単体テスト（docs/REQUIREMENTS.md §4.1、SPEC.md Set A参照）。
// vitestのデフォルト実行環境は"node"でjsdomを利用できないため、document操作を伴う
// applyDocumentTabStateはvi.stubGlobalで最小限のdocumentスタブを注入して検証する。

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDocumentTabState,
  buildFaviconDataUri,
  computeTabStatus,
  computeTabTitle,
} from "@/lib/use-document-title";

describe("computeTabTitle", () => {
  it("実行中タスクが無い場合はアプリ名のみを返す", () => {
    expect(computeTabTitle(null)).toBe("Chocotto");
  });

  it("作業タスク実行中はタスク名を含むタイトルを返す", () => {
    expect(computeTabTitle({ name: "〇〇の資料作成", type: "work" })).toBe(
      "〇〇の資料作成 - Chocotto",
    );
  });

  it("休憩中は休憩中を示すタイトルを返す", () => {
    expect(computeTabTitle({ name: "休憩", type: "break" })).toBe("休憩中 - Chocotto");
  });
});

describe("computeTabStatus", () => {
  it("タスクが無ければidle", () => {
    expect(computeTabStatus(null)).toBe("idle");
  });

  it("作業タスク実行中はwork", () => {
    expect(computeTabStatus({ type: "work" })).toBe("work");
  });

  it("休憩中はbreak", () => {
    expect(computeTabStatus({ type: "break" })).toBe("break");
  });
});

describe("buildFaviconDataUri", () => {
  it("ステータスごとに異なるdata URIを返す（視覚的に区別できる）", () => {
    const work = buildFaviconDataUri("work");
    const brk = buildFaviconDataUri("break");
    const idle = buildFaviconDataUri("idle");

    expect(work).toMatch(/^data:image\/svg\+xml,/);
    expect(work).not.toBe(brk);
    expect(brk).not.toBe(idle);
    expect(work).not.toBe(idle);
  });
});

describe("applyDocumentTabState", () => {
  function createFakeDocument() {
    const link: { rel: string; href: string } = { rel: "", href: "" };
    return {
      title: "",
      head: { appendChild: vi.fn() },
      querySelector: vi.fn(() => null as unknown as HTMLLinkElement | null),
      createElement: vi.fn(() => link as unknown as HTMLLinkElement),
      __link: link,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("タスク開始でdocument.titleがタスク名を含む表示になる", () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal("document", fakeDocument);

    applyDocumentTabState({ name: "〇〇の資料作成", type: "work" });

    expect(fakeDocument.title).toBe("〇〇の資料作成 - Chocotto");
  });

  it("休憩開始でdocument.titleが休憩中を示す表示になる", () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal("document", fakeDocument);

    applyDocumentTabState({ name: "休憩", type: "break" });

    expect(fakeDocument.title).toBe("休憩中 - Chocotto");
  });

  it("タスクが無い場合はアプリ名のみに戻る", () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal("document", fakeDocument);

    applyDocumentTabState(null);

    expect(fakeDocument.title).toBe("Chocotto");
  });

  it("既存のlink[rel=icon]が無い場合は新規作成してheadに追加する", () => {
    const fakeDocument = createFakeDocument();
    vi.stubGlobal("document", fakeDocument);

    applyDocumentTabState({ name: "作業", type: "work" });

    expect(fakeDocument.createElement).toHaveBeenCalledWith("link");
    expect(fakeDocument.head.appendChild).toHaveBeenCalled();
    expect(fakeDocument.__link.href).toMatch(/^data:image\/svg\+xml,/);
  });

  it("既存のlink[rel=icon]がある場合はhrefを書き換える（新規作成しない）", () => {
    const fakeDocument = createFakeDocument();
    const existingLink = { rel: "icon", href: "" };
    fakeDocument.querySelector = vi.fn(() => existingLink as unknown as HTMLLinkElement);
    vi.stubGlobal("document", fakeDocument);

    applyDocumentTabState({ name: "作業", type: "work" });

    expect(fakeDocument.createElement).not.toHaveBeenCalled();
    expect(existingLink.href).toMatch(/^data:image\/svg\+xml,/);
  });
});
