/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import type { Note } from "../../src/shared/preload-api";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const MERMAID_SVG = '<svg data-name="rendered"></svg>';

const mockMermaidRender = () => {
  vi.mocked(mermaid.render).mockResolvedValue({ svg: MERMAID_SVG, diagramType: "flowchart" });
};

const queryRenderedSvg = (): SVGElement | null => document.querySelector("svg[data-name='rendered']");

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design", "mcp"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (getNote: (id: string) => Promise<Note | null>) => {
  const getNoteMock = vi.fn(getNote);
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    getNote: getNoteMock,
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
  };
  return { getNote: getNoteMock };
};

afterEach(() => {
  cleanup();
  // vi.mockのファクトリで作ったvi.fnはrestoreAllMocksでは呼び出し履歴が消えないため明示的にクリアする。
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("NoteDetail", () => {
  it("マウント時に指定IDのノートを取得してタイトル・本文・タグを表示する", async () => {
    const { getNote } = mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(screen.getByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.getByText("design")).toBeTruthy();
    expect(screen.getByText("mcp")).toBeTruthy();
    expect(getNote).toHaveBeenCalledWith("note-1");
  });

  it("本文の改行を含む全文を表示する", async () => {
    mockHanamask(async () => makeNote({ body: "1行目\n2行目" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/1行目/)).toBeTruthy();
    expect(screen.getByText(/2行目/)).toBeTruthy();
  });

  it("ノートが見つからない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => null);

    render(<NoteDetail noteId="missing-note" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
  });

  it("取得に失敗した場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => {
      throw new Error("boom");
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("タグが空の場合でもタイトルと本文を表示する", async () => {
    mockHanamask(async () => makeNote({ tags: [] }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
  });

  it("戻るボタンをクリックするとonBackを呼ぶ", async () => {
    mockHanamask(async () => makeNote());
    const onBack = vi.fn();

    render(<NoteDetail noteId="note-1" onBack={onBack} />);
    await screen.findByText("設計メモ");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗しても戻るボタンで一覧に戻れる", async () => {
    mockHanamask(async () => null);
    const onBack = vi.fn();

    render(<NoteDetail noteId="missing-note" onBack={onBack} />);
    await screen.findByRole("alert");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("noteIdが変わったら新しいノートを取得し直す", async () => {
    const { getNote } = mockHanamask(async () => makeNote());
    getNote.mockImplementation(async (id: string) =>
      id === "note-2" ? makeNote({ id: "note-2", title: "別のノート" }) : makeNote(),
    );

    const { rerender } = render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    rerender(<NoteDetail noteId="note-2" onBack={vi.fn()} />);

    expect(await screen.findByText("別のノート")).toBeTruthy();
    expect(getNote).toHaveBeenCalledTimes(2);
  });

  it("本文中のMermaidコードフェンスは図として描画し、フェンスのテキストは出力しない", async () => {
    mockMermaidRender();
    const body = "前書き\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n後書き";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    expect(vi.mocked(mermaid.render).mock.calls[0]?.[1]).toBe("graph TD;\n  A-->B;");
    expect(screen.queryByText(/```mermaid/)).toBeNull();
    expect(screen.queryByText(/graph TD;/)).toBeNull();
  });

  it("Mermaidコードフェンスの前後のプレーンテキストはそのまま表示する", async () => {
    mockMermaidRender();
    const body = "前書き\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n後書き";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/前書き/)).toBeTruthy();
    expect(screen.getByText(/後書き/)).toBeTruthy();
  });

  it("Mermaid以外のコードフェンスは図にせずプレーンテキストのまま表示する", async () => {
    mockMermaidRender();
    mockHanamask(async () => makeNote({ body: "```ts\nconst a = 1;\n```" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/const a = 1;/)).toBeTruthy();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("Mermaidコードフェンスが複数ある場合はそれぞれを図として描画する", async () => {
    mockMermaidRender();
    const body = "```mermaid\ngraph TD;\n  A-->B;\n```\n中間\n```mermaid\ngraph LR;\n  C-->D;\n```";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/中間/)).toBeTruthy();
  });
});
