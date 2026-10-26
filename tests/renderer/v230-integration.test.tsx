/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { Home } from "../../src/renderer/components/Home";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import { UnreadProvider } from "../../src/renderer/hooks/UnreadContext";
import { stubHanamask } from "./hanamask-stub";
import type { Note, UnreadEntry } from "../../src/shared/preload-api";

const UNREAD_PAGE: UnreadEntry[] = [{ entityType: "note", id: "note-1" }];

const NOW = new Date().toISOString();

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "自動更新の経過",
  body: "停止②は判断A",
  tags: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("v2.3.0 の画面の結線", () => {
  it("ページの詳細は前回からの差分とコメント欄を出す", async () => {
    stubHanamask({
      getNote: vi.fn(async () => makeNote()),
      readChangesSinceView: vi.fn(async () => ({
        viewedAt: NOW,
        previousTitle: "自動更新の経過",
        previousBody: "停止②待ち",
      })),
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    const changes = await screen.findByRole("region", { name: "前回から変わったところ" });
    expect(within(changes).getByText("停止②待ち")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "コメント" })).toBeTruthy();
  });

  it("ホームは未読の記録に印を付け、すべて既読にできる", async () => {
    const markAllViewed = vi.fn(async () => {});
    stubHanamask({
      listNotes: vi.fn(async () => [makeNote()]),
      listUnread: vi.fn(async () => UNREAD_PAGE),
      markAllViewed,
    });

    render(
      <UnreadProvider>
        <Home onSelectNote={vi.fn()} onSelectTask={vi.fn()} onSearch={vi.fn()} />
      </UnreadProvider>,
    );

    expect(await screen.findByText("未読")).toBeTruthy();
    await act(async () => {
      screen.getByRole("button", { name: "すべて既読にする" }).click();
    });
    expect(markAllViewed).toHaveBeenCalledTimes(1);
  });

  it("未読が無ければ「すべて既読にする」は押せない", async () => {
    stubHanamask({ listNotes: vi.fn(async () => [makeNote()]) });
    render(
      <UnreadProvider>
        <Home onSelectNote={vi.fn()} onSelectTask={vi.fn()} onSearch={vi.fn()} />
      </UnreadProvider>,
    );
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "すべて既読にする" });
    expect(button.disabled).toBe(true);
  });
});
