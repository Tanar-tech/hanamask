/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RelatedNotes } from "../../src/renderer/components/RelatedNotes";
import type {
  EmbeddingStatus,
  RelatedNotesResult,
  ScoredNote,
} from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const RELATED_TITLE = "WSLからWindowsのMCPサーバーへ接続する";

const makeNote = (overrides: Partial<ScoredNote> = {}): ScoredNote => ({
  id: "note-2",
  title: RELATED_TITLE,
  body: "接続手順のメモ",
  tags: [],
  score: 0.9,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const READY: EmbeddingStatus = { state: "ready", pending: 0 };
const LOADING: EmbeddingStatus = { state: "loading", pending: 3 };
const UNAVAILABLE: EmbeddingStatus = {
  state: "unavailable",
  pending: 0,
  reason: "モデルなし",
};

interface Stubs {
  readStatus: () => EmbeddingStatus;
  readRelated?: () => RelatedNotesResult;
}

const mockEmbeddingApi = ({ readStatus, readRelated }: Stubs) => {
  const readEmbeddingStatus = vi.fn(async () => readStatus());
  const relatedNotes = vi.fn(async () =>
    readRelated === undefined ? { notes: [] } : readRelated(),
  );
  const listeners: Array<(status: EmbeddingStatus) => void> = [];
  const unsubscribe = vi.fn();
  stubHanamask({
    readEmbeddingStatus,
    relatedNotes,
    onEmbeddingStatusChanged: vi.fn((callback: (status: EmbeddingStatus) => void) => {
      listeners.push(callback);
      return unsubscribe;
    }),
  });
  const emitStatusChanged = async (status: EmbeddingStatus): Promise<void> => {
    await act(async () => {
      listeners.forEach((listener) => {
        listener(status);
      });
    });
  };
  return { readEmbeddingStatus, relatedNotes, emitStatusChanged, unsubscribe };
};

const noop = (): void => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RelatedNotes", () => {
  it("準備できているとき関連ノートを一覧し、クリックで選択を通知する", async () => {
    const { relatedNotes } = mockEmbeddingApi({
      readStatus: () => READY,
      readRelated: () => ({ notes: [makeNote()] }),
    });
    const onSelectNote = vi.fn();

    render(<RelatedNotes noteId="note-1" onSelectNote={onSelectNote} />);

    expect(await screen.findByRole("list", { name: "関連するノート" })).toBeTruthy();
    expect(relatedNotes).toHaveBeenCalledWith("note-1", 5);
    fireEvent.click(screen.getByRole("button", { name: RELATED_TITLE }));
    expect(onSelectNote).toHaveBeenCalledWith("note-2");
  });

  it("いま開いているノート自身は一覧に出さない", async () => {
    mockEmbeddingApi({
      readStatus: () => READY,
      readRelated: () => ({
        notes: [makeNote({ id: "note-1", title: "自分自身" }), makeNote()],
      }),
    });

    render(<RelatedNotes noteId="note-1" onSelectNote={noop} />);

    await screen.findByRole("list", { name: "関連するノート" });
    expect(screen.queryByText("自分自身")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("準備中のときは「準備中です」と出す", async () => {
    mockEmbeddingApi({
      readStatus: () => LOADING,
      readRelated: () => ({ notes: [makeNote()] }),
    });

    render(<RelatedNotes noteId="note-1" onSelectNote={noop} />);

    expect(await screen.findByText("準備中です")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("使えないときは欄そのものを出さない", async () => {
    const { readEmbeddingStatus } = mockEmbeddingApi({
      readStatus: () => UNAVAILABLE,
      readRelated: () => ({ notes: [makeNote()] }),
    });

    const { container } = render(<RelatedNotes noteId="note-1" onSelectNote={noop} />);

    await waitFor(() => {
      expect(readEmbeddingStatus).toHaveBeenCalled();
    });
    // 結果が返っていても、状態が unavailable なら見出しごと出さない。
    await act(async () => {});
    expect(screen.queryByText(RELATED_TITLE)).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("状態が変わったら読み直して結果に切り替える", async () => {
    let status = LOADING;
    const { emitStatusChanged, relatedNotes } = mockEmbeddingApi({
      readStatus: () => status,
      readRelated: () => (status === READY ? { notes: [makeNote()] } : { notes: [] }),
    });

    render(<RelatedNotes noteId="note-1" onSelectNote={noop} />);
    expect(await screen.findByText("準備中です")).toBeTruthy();
    expect(relatedNotes).toHaveBeenCalledTimes(1);

    status = READY;
    await emitStatusChanged(READY);

    expect(await screen.findByRole("button", { name: RELATED_TITLE })).toBeTruthy();
    expect(screen.queryByText("準備中です")).toBeNull();
    expect(relatedNotes).toHaveBeenCalledTimes(2);
  });
});
