/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import { renderWithMotion as render } from "./motion-render";
import { NoteList } from "../../src/renderer/components/NoteList";
import type { AppSettings, Image, Note } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
  mimeType: "image/png",
};

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (notesByCall: Note[][]) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const listNotes = vi.fn(async () => notesByCall[Math.min(listNotes.mock.calls.length - 1, notesByCall.length - 1)] ?? []);
  const onNotesChanged = vi.fn((callback: () => void) => {
    listeners.push(callback);
    return unsubscribe;
  });
  const deleteNote = vi.fn(async () => {});
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes,
    onNotesChanged,
    deleteNote,
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    onNavigate: vi.fn(() => () => {}),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    readActivity: vi.fn(async () => ({ lastRecordedAt: null, recentCount: 0 })),
    readMcpEndpoint: vi.fn(async () => ({ port: 39217, url: "http://127.0.0.1:39217/mcp" })),
    readAppSettings: vi.fn(async () => ({ closeToTray: true, openAtLogin: false })),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  return { listNotes, onNotesChanged, deleteNote, listeners, unsubscribe };
};

const clickDeleteButtonOf = async (title: string): Promise<void> => {
  const item = (await screen.findByText(title)).closest("li");
  if (item === null) throw new Error(`no list item for ${title}`);
  await act(async () => {
    within(item).getByRole("button", { name: "削除" }).click();
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NoteList", () => {
  it("初期表示でノート一覧をレンダリングする", async () => {
    mockHanamask([
      [makeNote(), makeNote({ id: "note-2", title: "TODO整理", body: "積み残しタスクの一覧" })],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(screen.getByText("TODO整理")).toBeTruthy();
    expect(screen.getByText(/MCPサーバーの設計/)).toBeTruthy();
    expect(screen.getByText("積み残しタスクの一覧")).toBeTruthy();
  });

  it("一覧に名前を付けて読み上げできるようにする", async () => {
    mockHanamask([[makeNote()]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByRole("list", { name: "ノート一覧" })).toBeTruthy();
  });

  it("onNotesChangedのコールバックでノート一覧を再取得して更新する", async () => {
    const { listNotes, listeners } = mockHanamask([
      [makeNote()],
      [makeNote(), makeNote({ id: "note-2", title: "追加されたノート" })],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(listNotes).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(listNotes).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたノート")).toBeTruthy();
  });

  it("ノートが0件のとき空状態メッセージを表示する", async () => {
    mockHanamask([[]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("ノートはまだありません")).toBeTruthy();
  });

  it("削除ボタンで確認してOKするとそのノートを削除する", async () => {
    const { deleteNote } = mockHanamask([[makeNote(), makeNote({ id: "note-2", title: "TODO整理" })]]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("TODO整理");

    expect(deleteNote).toHaveBeenCalledTimes(1);
    expect(deleteNote).toHaveBeenCalledWith("note-2");
  });

  it("削除後のonNotesChangedで削除したノートが一覧から消える", async () => {
    const { deleteNote, listeners } = mockHanamask([
      [makeNote(), makeNote({ id: "note-2", title: "TODO整理" })],
      [makeNote()],
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("TODO整理");
    expect(deleteNote).toHaveBeenCalledWith("note-2");

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(screen.queryByText("TODO整理")).toBeNull();
    expect(screen.getByText("設計メモ")).toBeTruthy();
  });

  it("削除の確認をキャンセルすると削除しない", async () => {
    const { deleteNote } = mockHanamask([[makeNote()]]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("設計メモ");

    expect(deleteNote).not.toHaveBeenCalled();
  });

  it("削除に失敗したらエラーを表示する", async () => {
    const { deleteNote } = mockHanamask([[makeNote()]]);
    deleteNote.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<NoteList onSelectNote={vi.fn()} />);
    await clickDeleteButtonOf("設計メモ");

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("本文があるノートはMarkdownの記号を落とした抜粋を表示する", async () => {
    mockHanamask([[makeNote({ body: "# 見出し\n- 箇条書き" })]]);

    const { container } = render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("見出し 箇条書き")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("Mermaidのコードフェンスは抜粋に出さない", async () => {
    const body = ["前書き", "```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    mockHanamask([[makeNote({ body })]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    expect(await screen.findByText("前書き")).toBeTruthy();
    expect(screen.queryByText(/```/)).toBeNull();
    expect(screen.queryByText(/flowchart/)).toBeNull();
  });

  it("本文が空のノートでは抜粋を描画しない", async () => {
    mockHanamask([
      [
        makeNote({ body: "" }),
        makeNote({ id: "note-2", title: "TODO整理", body: "抜粋される本文" }),
      ],
    ]);

    const { container } = render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("抜粋される本文");

    // タグも <li> なので、カードは一覧の直下だけを数える。
    const cards = container.querySelectorAll('ul[aria-label="ノート一覧"] > li');
    expect(cards).toHaveLength(2);
    // 抜粋を出すカードだけが段落を持つ。
    expect(cards[0]?.querySelectorAll("p")).toHaveLength(0);
    expect(cards[1]?.querySelectorAll("p")).toHaveLength(1);
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeNote()]]);

    const { unmount } = render(<NoteList onSelectNote={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  /*
   * 変更のたびに一覧を丸ごと取り直すため、これが効いていないと毎回すべての項目が
   * アニメーションする。「増えたものだけを対象にする」判定は useNewlyArrived が持ち、
   * その正しさは useNewlyArrived.test.tsx で網羅している（誤実装で落ちることも実測済み）。
   * ここでは NoteList がその判定を実際に使って描画できていること（＝結線）を確かめる。
   */
  it("ノートが増えても一覧が壊れない", async () => {
    const existing = makeNote({ id: "note-1", title: "元からあるノート" });
    const arrived = makeNote({ id: "note-2", title: "いま増えたノート" });
    const { listeners } = mockHanamask([[existing], [arrived, existing]]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("元からあるノート");
    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(await screen.findByText("いま増えたノート")).toBeTruthy();
    expect(screen.getByText("元からあるノート")).toBeTruthy();
    // タグも listitem なので、ノート一覧に属するものだけを数える。
    expect(within(screen.getByRole("list", { name: "ノート一覧" })).getAllByRole("listitem").filter((item) => item.parentElement?.getAttribute("aria-label") === "ノート一覧")).toHaveLength(2);
  });

  /*
   * タグは詳細画面にしか出ておらず、一覧を見てもどの記録がどの案件のものか
   * 分からなかった。案件で見分けられることがこの機能の目的なので、一覧に出す。
   */
  it("一覧のカードにタグを表示する", async () => {
    mockHanamask([[makeNote({ tags: ["プロジェクトA", "設計"] })]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    const card = (await screen.findAllByRole("listitem"))[0];
    expect(within(card!).getByText("プロジェクトA")).toBeTruthy();
    expect(within(card!).getByText("設計")).toBeTruthy();
  });

  it("タグが無いノートにはタグ欄を出さない", async () => {
    mockHanamask([[makeNote({ title: "タグなし", tags: [] })]]);

    render(<NoteList onSelectNote={vi.fn()} />);

    await screen.findByText("タグなし");
    expect(screen.queryByRole("list", { name: "タグ" })).toBeNull();
  });

  /*
   * この機能の目的そのもの。「あるノートがプロジェクトAに所属し、プロジェクトBには
   * 所属していない」ことを、利用者が選ぶだけで判別できること。
   */
  it("タグを選ぶと、そのタグを持たないノートが消える", async () => {
    mockHanamask([
      [
        makeNote({ id: "a", title: "Aのノート", tags: ["プロジェクトA"] }),
        makeNote({ id: "b", title: "Bのノート", tags: ["プロジェクトB"] }),
      ],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("Aのノート");

    const filter = screen.getByRole("group", { name: "タグで絞り込む" });
    await act(async () => {
      within(filter).getByRole("button", { name: "プロジェクトA" }).click();
    });

    expect(screen.getByText("Aのノート")).toBeTruthy();
    expect(screen.queryByText("Bのノート")).toBeNull();
  });

  it("複数のタグを選ぶと、どれかに一致するノートが残る", async () => {
    mockHanamask([
      [
        makeNote({ id: "a", title: "Aのノート", tags: ["プロジェクトA"] }),
        makeNote({ id: "b", title: "Bのノート", tags: ["プロジェクトB"] }),
        makeNote({ id: "c", title: "Cのノート", tags: ["その他"] }),
      ],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("Aのノート");
    const filter = screen.getByRole("group", { name: "タグで絞り込む" });

    await act(async () => {
      within(filter).getByRole("button", { name: "プロジェクトA" }).click();
    });
    await act(async () => {
      within(filter).getByRole("button", { name: "プロジェクトB" }).click();
    });

    expect(screen.getByText("Aのノート")).toBeTruthy();
    expect(screen.getByText("Bのノート")).toBeTruthy();
    expect(screen.queryByText("Cのノート")).toBeNull();
  });

  it("「すべて」で絞り込みを解除できる", async () => {
    mockHanamask([
      [
        makeNote({ id: "a", title: "Aのノート", tags: ["プロジェクトA"] }),
        makeNote({ id: "b", title: "Bのノート", tags: ["プロジェクトB"] }),
      ],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("Aのノート");
    const filter = screen.getByRole("group", { name: "タグで絞り込む" });

    await act(async () => {
      within(filter).getByRole("button", { name: "プロジェクトA" }).click();
    });
    await act(async () => {
      within(filter).getByRole("button", { name: "すべて" }).click();
    });

    expect(screen.getByText("Bのノート")).toBeTruthy();
  });

  it("タグが1つも無いときは絞り込みを出さない", async () => {
    mockHanamask([[makeNote({ tags: [] })]]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");

    expect(screen.queryByRole("group", { name: "タグで絞り込む" })).toBeNull();
  });

  /*
   * 絞り込みは「1つの案件だけ見る」ための道具。案件をまたいで全体を眺めたいときは、
   * 分けて並べた方が早い。同じノートが複数のタグを持つなら、両方の見出しの下に出る。
   */
  it("タグごとに分けて並べられる", async () => {
    mockHanamask([
      [
        makeNote({ id: "a", title: "Aのノート", tags: ["プロジェクトA"] }),
        makeNote({ id: "ab", title: "AとBのノート", tags: ["プロジェクトA", "プロジェクトB"] }),
        makeNote({ id: "none", title: "タグなしノート", tags: [] }),
      ],
    ]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("Aのノート");

    await act(async () => {
      screen.getByRole("button", { name: "タグごとに分ける" }).click();
    });

    const groupA = screen.getByRole("region", { name: "プロジェクトA" });
    expect(within(groupA).getByText("Aのノート")).toBeTruthy();
    expect(within(groupA).getByText("AとBのノート")).toBeTruthy();

    const groupB = screen.getByRole("region", { name: "プロジェクトB" });
    expect(within(groupB).getByText("AとBのノート")).toBeTruthy();
    expect(within(groupB).queryByText("Aのノート")).toBeNull();

    // タグが無いものも取りこぼさない。
    expect(within(screen.getByRole("region", { name: "タグなし" })).getByText("タグなしノート")).toBeTruthy();
  });

  /*
   * 記録が増えると一覧は下へ伸び続け、古いものに辿り着くまで延々とスクロールする
   * ことになる。1ページ20件で区切る。
   */
  const manyNotes = (count: number, tags: string[] = []) =>
    Array.from({ length: count }, (_, index) =>
      makeNote({ id: `n${index}`, title: `ノート${String(index).padStart(2, "0")}`, tags }),
    );

  it("20件を超えると区切って出し、次へで続きが見える", async () => {
    mockHanamask([manyNotes(25)]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("ノート00");

    expect(screen.getByText("25件中 1–20件")).toBeTruthy();
    expect(screen.queryByText("ノート20")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });

    expect(screen.getByText("ノート20")).toBeTruthy();
    expect(screen.queryByText("ノート00")).toBeNull();
  });

  it("20件以内なら操作列を出さない", async () => {
    mockHanamask([manyNotes(20)]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("ノート00");

    expect(screen.queryByRole("button", { name: "次へ" })).toBeNull();
  });

  it("タグを選ぶと1ページ目に戻る", async () => {
    // 絞り込んだ結果も複数ページ残る量にする。1ページに収まる量だと、
    // 範囲外を最後のページへ寄せる処理だけで辻褄が合ってしまい、戻す処理を検証できない。
    const tagged = manyNotes(30, ["A"]);
    const untagged = Array.from({ length: 20 }, (_, index) =>
      makeNote({ id: `u${index}`, title: `無タグ${String(index).padStart(2, "0")}` }),
    );
    mockHanamask([[...tagged, ...untagged]]);

    render(<NoteList onSelectNote={vi.fn()} />);
    await screen.findByText("ノート00");

    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });
    expect(screen.queryByText("ノート00")).toBeNull();

    await act(async () => {
      within(screen.getByRole("group", { name: "タグで絞り込む" }))
        .getByRole("button", { name: "A" })
        .click();
    });

    // 3ページ目に留まったままだと、絞り込んだ結果の先頭が見えない。
    expect(screen.getByText("ノート00")).toBeTruthy();
    expect(screen.getByText("30件中 1–20件")).toBeTruthy();
  });
});
