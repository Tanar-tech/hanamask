/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import type { Image, Note, NoteVersion } from "../../src/shared/preload-api";

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
  updateNote?: (
    id: string,
    input: { title?: string; body?: string; tags?: string[] },
  ) => Promise<Note | null>;
  listNoteVersions?: (noteId: string) => Promise<NoteVersion[]>;
  restoreNoteVersion?: (versionId: string) => Promise<Note | null>;
}

const makeVersion = (overrides: Partial<NoteVersion> = {}): NoteVersion => ({
  id: "version-1",
  noteId: "note-1",
  title: "旧タイトル",
  body: "旧本文",
  tags: ["design"],
  createdAt: "2026-08-03T09:00:00.000Z",
  ...overrides,
});

const mockHanamask = (
  getNote: (id: string) => Promise<Note | null>,
  imageApi: ImageApiOverrides = {},
) => {
  const getNoteMock = vi.fn(getNote);
  const listImagesMock = vi.fn(imageApi.listImages ?? (async () => []));
  const attachImageMock = vi.fn(imageApi.attachImage ?? (async () => makeImage()));
  const updateNoteMock = vi.fn(imageApi.updateNote ?? (async () => makeNote()));
  const listNoteVersionsMock = vi.fn(imageApi.listNoteVersions ?? (async () => []));
  const restoreNoteVersionMock = vi.fn(imageApi.restoreNoteVersion ?? (async () => makeNote()));
  window.hanamask = {
    listNoteVersions: listNoteVersionsMock,
    restoreNoteVersion: restoreNoteVersionMock,
    listNotes: vi.fn(async () => []),
    getNote: getNoteMock,
    updateNote: updateNoteMock,
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: attachImageMock,
    listImages: listImagesMock,
  };
  return {
    getNote: getNoteMock,
    listImages: listImagesMock,
    attachImage: attachImageMock,
    updateNote: updateNoteMock,
    listNoteVersions: listNoteVersionsMock,
    restoreNoteVersion: restoreNoteVersionMock,
  };
};

const startEditing = async (): Promise<void> => {
  await act(async () => {
    screen.getByRole("button", { name: "編集" }).click();
  });
};

const clickButton = async (name: string): Promise<void> => {
  await act(async () => {
    screen.getByRole("button", { name }).click();
  });
};

const typeInto = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

const fieldValue = (label: string): string =>
  screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label).value;

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

describe("NoteDetail の編集", () => {
  it("編集ボタンで編集フォームに現在の内容を表示する", async () => {
    mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();

    expect(fieldValue("タイトル")).toBe("設計メモ");
    expect(fieldValue("本文")).toBe("MCPサーバーの設計についてのメモ本文");
    expect(fieldValue("タグ")).toBe("design, mcp");
  });

  it("編集モードではMermaidを描画せず生のMarkdownを表示する", async () => {
    mockMermaidRender();
    const body = "```mermaid\ngraph TD;\n  A-->B;\n```";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    await startEditing();

    expect(fieldValue("本文")).toBe(body);
    expect(queryRenderedSvg()).toBeNull();
  });

  it("保存すると編集内容でupdateNoteを呼ぶ", async () => {
    const { updateNote } = mockHanamask(async () => makeNote(), {
      updateNote: async () => makeNote({ title: "改訂版", body: "新しい本文", tags: ["mcp"] }),
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "改訂版");
    typeInto("本文", "新しい本文");
    typeInto("タグ", "mcp");
    await clickButton("保存");

    expect(updateNote).toHaveBeenCalledWith("note-1", {
      title: "改訂版",
      body: "新しい本文",
      tags: ["mcp"],
    });
  });

  it("保存に成功すると表示モードに戻り新しい内容を表示する", async () => {
    mockHanamask(async () => makeNote(), {
      updateNote: async () => makeNote({ title: "改訂版", body: "新しい本文", tags: ["mcp"] }),
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "改訂版");
    await clickButton("保存");

    expect(await screen.findByText("改訂版")).toBeTruthy();
    expect(screen.getByText("新しい本文")).toBeTruthy();
    expect(screen.queryByLabelText("タイトル")).toBeNull();
    expect(screen.getByRole("button", { name: "編集" })).toBeTruthy();
  });

  it("キャンセルすると編集内容を破棄して元の内容に戻る", async () => {
    const { updateNote } = mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "破棄されるタイトル");
    await clickButton("キャンセル");

    expect(updateNote).not.toHaveBeenCalled();
    expect(screen.getByText("設計メモ")).toBeTruthy();
    expect(screen.queryByText("破棄されるタイトル")).toBeNull();

    await startEditing();
    expect(fieldValue("タイトル")).toBe("設計メモ");
  });

  it("保存に失敗したらエラーメッセージを表示し編集内容を保つ", async () => {
    mockHanamask(async () => makeNote(), {
      updateNote: async () => {
        throw new Error("update failed");
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "改訂版");
    await clickButton("保存");

    expect((await screen.findByRole("alert")).textContent).toContain("update failed");
    expect(fieldValue("タイトル")).toBe("改訂版");
  });

  it("更新対象のノートが存在しない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => makeNote(), { updateNote: async () => null });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    await clickButton("保存");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("タイトル")).toBeTruthy();
  });
});

describe("NoteDetail の編集履歴", () => {
  it("表示モードでは編集履歴を表示する", async () => {
    const { listNoteVersions } = mockHanamask(async () => makeNote(), {
      listNoteVersions: async () => [makeVersion()],
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);

    expect(await screen.findByText("旧タイトル")).toBeTruthy();
    expect(screen.getByRole("button", { name: "このバージョンに戻す" })).toBeTruthy();
    expect(listNoteVersions).toHaveBeenCalledWith("note-1");
  });

  it("編集モードでは編集履歴を表示しない", async () => {
    mockHanamask(async () => makeNote(), { listNoteVersions: async () => [makeVersion()] });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await startEditing();

    expect(screen.queryByText("旧タイトル")).toBeNull();
    expect(screen.queryByRole("button", { name: "このバージョンに戻す" })).toBeNull();
  });

  it("履歴から復元すると表示中の内容が復元後のノートになる", async () => {
    mockHanamask(async () => makeNote(), {
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: async () => makeNote({ title: "復元されたタイトル", body: "復元された本文" }),
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickButton("このバージョンに戻す");

    expect(await screen.findByText("復元されたタイトル")).toBeTruthy();
    expect(screen.getByText("復元された本文")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
