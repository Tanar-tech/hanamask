/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import type { Image, Note } from "../../src/shared/preload-api";

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design", "mcp"],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const makeImage = (overrides: Partial<Image> = {}): Image => {
  const filePath = overrides.filePath ?? "/data/images/a.png";
  return {
    id: "image-1",
    noteId: "note-1",
    mimeType: "image/png",
    fileUrl: `file://${filePath}`,
    ...overrides,
    filePath,
  };
};

interface ImageApiOverrides {
  listImages?: (noteId: string) => Promise<Image[]>;
  attachImage?: (
    noteId: string,
    fileName: string,
    dataBase64: string,
    mimeType: string,
  ) => Promise<Image>;
}

const mockHanamask = (
  getNote: (id: string) => Promise<Note | null>,
  imageApi: ImageApiOverrides = {},
) => {
  const getNoteMock = vi.fn(getNote);
  const listImagesMock = vi.fn(imageApi.listImages ?? (async () => []));
  const attachImageMock = vi.fn(imageApi.attachImage ?? (async () => makeImage()));
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    getNote: getNoteMock,
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: attachImageMock,
    listImages: listImagesMock,
  };
  return { getNote: getNoteMock, listImages: listImagesMock, attachImage: attachImageMock };
};

const selectFile = async (file: File): Promise<void> => {
  const input = screen.getByLabelText("画像を添付");
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
};

// 貼り付けはフォーカス可能な要素が無くても届く必要があるため、documentに対して発火させる。
const pasteItems = async (items: readonly Partial<DataTransferItem>[]): Promise<void> => {
  await act(async () => {
    fireEvent.paste(document, { clipboardData: { items } });
  });
};

const pasteFile = async (file: File): Promise<void> => {
  await pasteItems([{ kind: "file", type: file.type, getAsFile: () => file }]);
};

afterEach(() => {
  cleanup();
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

  it("マウント時に画像一覧を取得しfile:// URLでプレビュー表示する", async () => {
    const { listImages } = mockHanamask(async () => makeNote(), {
      listImages: async () => [
        makeImage({ id: "image-1", filePath: "/data/images/a.png" }),
        makeImage({ id: "image-2", filePath: "/data/images/b.webp", mimeType: "image/webp" }),
      ],
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    await screen.findByText("設計メモ");
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(2);
    });
    expect(screen.getAllByRole("img").map((image) => image.getAttribute("src"))).toEqual([
      "file:///data/images/a.png",
      "file:///data/images/b.webp",
    ]);
    expect(listImages).toHaveBeenCalledWith("note-1");
  });

  it("画像が無いときはプレビューを表示しない", async () => {
    mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    await screen.findByText("設計メモ");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("ファイルを選択するとattachImageを呼び一覧に反映する", async () => {
    const attached = makeImage({ id: "image-9", filePath: "/data/images/new.png" });
    let stored: Image[] = [];
    const { attachImage, listImages } = mockHanamask(async () => makeNote(), {
      listImages: async () => stored,
      attachImage: async () => {
        stored = [attached];
        return attached;
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await selectFile(new File(["hello"], "shot.png", { type: "image/png" }));

    await waitFor(() => {
      expect(attachImage).toHaveBeenCalledWith("note-1", "shot.png", "aGVsbG8=", "image/png");
    });
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });
    expect(screen.getByRole("img").getAttribute("src")).toBe("file:///data/images/new.png");
    expect(listImages).toHaveBeenCalledTimes(2);
  });

  it("添付が形式・サイズエラーで失敗したらエラーメッセージを表示する", async () => {
    mockHanamask(async () => makeNote(), {
      attachImage: async () => {
        throw new Error("Unsupported image type: application/pdf");
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await selectFile(new File(["hello"], "doc.pdf", { type: "application/pdf" }));

    expect((await screen.findByRole("alert")).textContent).toContain("application/pdf");
    // 添付の失敗はノート本体の表示を壊さない。
    expect(screen.getByText("設計メモ")).toBeTruthy();
  });

  it("プレビューのsrcにはmainプロセスが返したfileUrlをそのまま使う", async () => {
    // Windowsのバックスラッシュ区切りパスはレンダラー側で文字列連結してはURLにならない。
    mockHanamask(async () => makeNote(), {
      listImages: async () => [
        makeImage({ filePath: "C:\\Users\\me\\images\\a.png", fileUrl: "file:///C:/Users/me/images/a.png" }),
      ],
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await waitFor(() => {
      expect(screen.getByRole("img").getAttribute("src")).toBe("file:///C:/Users/me/images/a.png");
    });
  });

  it("クリップボードの画像を貼り付けるとattachImageを呼び一覧に反映する", async () => {
    const attached = makeImage({ id: "image-9", filePath: "/data/images/pasted.png" });
    let stored: Image[] = [];
    const { attachImage } = mockHanamask(async () => makeNote(), {
      listImages: async () => stored,
      attachImage: async () => {
        stored = [attached];
        return attached;
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await pasteFile(new File(["hello"], "clipboard.png", { type: "image/png" }));

    await waitFor(() => {
      expect(attachImage).toHaveBeenCalledWith("note-1", "clipboard.png", "aGVsbG8=", "image/png");
    });
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });
    expect(screen.getByRole("img").getAttribute("src")).toBe("file:///data/images/pasted.png");
  });

  it("画像以外の貼り付けでは添付しない", async () => {
    const { attachImage } = mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await pasteItems([{ kind: "string", type: "text/plain", getAsFile: () => null }]);

    expect(attachImage).not.toHaveBeenCalled();
  });

  it("貼り付けが失敗したらエラーメッセージを表示する", async () => {
    mockHanamask(async () => makeNote(), {
      attachImage: async () => {
        throw new Error("Unsupported image type: image/bmp");
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");

    await pasteFile(new File(["hello"], "clipboard.bmp", { type: "image/bmp" }));

    expect((await screen.findByRole("alert")).textContent).toContain("image/bmp");
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
});
