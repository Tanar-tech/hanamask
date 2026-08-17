/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { SearchResults } from "../../src/renderer/components/SearchResults";
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

const mockHanamask = (searchNotes: () => Promise<Note[]>) => {
  const search = vi.fn(searchNotes);
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    searchNotes: search,
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    onNavigate: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
    listLinks: vi.fn(async () => []),
    createLink: vi.fn(),
    deleteLink: vi.fn(async () => true),
    onLinksChanged: vi.fn(() => () => {}),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
    sendChatMessage: vi.fn(async () => []),
    abortChat: vi.fn(async () => {}),
    onChatEvent: vi.fn(() => () => {}),
    readAppSettings: vi.fn(async () => ({ closeToTray: true, openAtLogin: false })),
    saveAppSettings: vi.fn(async (settings: AppSettings) => settings),
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
  };
  return search;
};

const noop = (): void => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SearchResults", () => {
  it("クエリに一致したノートを一覧表示する", async () => {
    const search = mockHanamask(async () => [
      makeNote(),
      makeNote({ id: "note-2", title: "議事録" }),
    ]);

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);

    expect(await screen.findByRole("button", { name: "設計メモ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "議事録" })).toBeTruthy();
    expect(search).toHaveBeenCalledWith("設計");
  });

  it("検索キーワードを画面に表示する", async () => {
    mockHanamask(async () => [makeNote()]);

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);

    await screen.findByRole("button", { name: "設計メモ" });
    expect(screen.getByRole("heading", { name: "「設計」の検索結果" })).toBeTruthy();
  });

  it("一覧に何の一覧かが分かるラベルを付ける", async () => {
    mockHanamask(async () => [makeNote()]);

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);

    expect(await screen.findByRole("list", { name: "検索結果" })).toBeTruthy();
  });

  it("一致するノートが0件なら該当なしと表示する", async () => {
    mockHanamask(async () => []);

    render(<SearchResults query="存在しない" onSelectNote={noop} onBack={noop} />);

    expect(await screen.findByText("該当するノートはありません")).toBeTruthy();
  });

  it("ノートのタイトルをクリックすると選択を通知する", async () => {
    mockHanamask(async () => [makeNote()]);
    const onSelectNote = vi.fn();

    render(<SearchResults query="設計" onSelectNote={onSelectNote} onBack={noop} />);
    const button = await screen.findByRole("button", { name: "設計メモ" });
    await act(async () => {
      button.click();
    });

    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });

  it("戻るボタンで一覧へ戻ることを通知する", async () => {
    mockHanamask(async () => []);
    const onBack = vi.fn();

    render(<SearchResults query="設計" onSelectNote={noop} onBack={onBack} />);
    const button = await screen.findByRole("button", { name: "戻る" });
    await act(async () => {
      button.click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("クエリが変わると検索し直す", async () => {
    const search = mockHanamask(async () => [makeNote()]);

    const { rerender } = render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);
    await screen.findByRole("button", { name: "設計メモ" });
    await act(async () => {
      rerender(<SearchResults query="議事録" onSelectNote={noop} onBack={noop} />);
    });

    expect(search).toHaveBeenCalledWith("議事録");
  });

  it("検索に失敗したらエラーを表示する", async () => {
    mockHanamask(async () => {
      throw new Error("db closed");
    });

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });
  it("検索結果にもタグを出す", async () => {
    mockHanamask(async () => [makeNote({ tags: ["プロジェクトA", "設計"] })]);

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);
    await screen.findByRole("button", { name: "設計メモ" });

    const tags = within(screen.getByRole("list", { name: "タグ" }));
    expect(tags.getByText("プロジェクトA")).toBeTruthy();
    expect(tags.getByText("設計")).toBeTruthy();
  });

  it("タグが無いノートではタグの列を出さない", async () => {
    mockHanamask(async () => [makeNote({ tags: [] })]);

    render(<SearchResults query="設計" onSelectNote={noop} onBack={noop} />);
    await screen.findByRole("button", { name: "設計メモ" });

    expect(screen.queryByRole("list", { name: "タグ" })).toBeNull();
  });
});
