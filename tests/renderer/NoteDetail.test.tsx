/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { NoteDetail } from "../../src/renderer/components/NoteDetail";
import type { AppSettings, Image, Note, NoteVersion } from "../../src/shared/preload-api";

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
  entityType: "note",
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
  const onNotesChangedMock = vi.fn<(callback: () => void) => () => void>(() => () => {});
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNoteVersions: listNoteVersionsMock,
    restoreNoteVersion: restoreNoteVersionMock,
    listNotes: vi.fn(async () => []),
    getNote: getNoteMock,
    updateNote: updateNoteMock,
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: onNotesChangedMock,
    onNotebooksChanged: vi.fn(() => () => undefined),
    listDeletedNotebooks: vi.fn(async () => []),
    restoreNotebook: vi.fn(async () => true),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: attachImageMock,
    listImages: listImagesMock,
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
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [], notebooks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  return {
    getNote: getNoteMock,
    listImages: listImagesMock,
    attachImage: attachImageMock,
    updateNote: updateNoteMock,
    listNoteVersions: listNoteVersionsMock,
    restoreNoteVersion: restoreNoteVersionMock,
    onNotesChanged: onNotesChangedMock,
  };
};

const emitNotesChanged = async (
  onNotesChanged: ReturnType<typeof mockHanamask>["onNotesChanged"],
): Promise<void> => {
  await act(async () => {
    onNotesChanged.mock.calls.forEach(([callback]) => {
      callback();
    });
  });
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(screen.getByText("MCPサーバーの設計についてのメモ本文")).toBeTruthy();
    expect(screen.getByText("design")).toBeTruthy();
    expect(screen.getByText("mcp")).toBeTruthy();
    expect(getNote).toHaveBeenCalledWith("note-1");
  });

  it("本文の改行を含む全文を表示する", async () => {
    mockHanamask(async () => makeNote({ body: "1行目\n2行目" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText(/1行目/)).toBeTruthy();
    expect(screen.getByText(/2行目/)).toBeTruthy();
  });

  it("本文が空のノートでは本文が無いことを文字で示す", async () => {
    mockHanamask(async () => makeNote({ body: "   " }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("本文はまだありません")).toBeTruthy();
  });

  it("本文があるノートでは本文が無いという表示を出さない", async () => {
    mockHanamask(async () => makeNote({ body: "本文があります" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("本文があります")).toBeTruthy();
    expect(screen.queryByText("本文はまだありません")).toBeNull();
  });

  it("ノートが見つからない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => null);

    render(<NoteDetail noteId="missing-note" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
  });

  it("取得に失敗した場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => {
      throw new Error("boom");
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("タグが空の場合でもタイトルと本文を表示する", async () => {
    mockHanamask(async () => makeNote({ tags: [] }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("設計メモ")).toBeTruthy();
  });

  it("戻るボタンをクリックするとonBackを呼ぶ", async () => {
    mockHanamask(async () => makeNote());
    const onBack = vi.fn();

    render(<NoteDetail noteId="note-1" onBack={onBack} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗しても戻るボタンで一覧に戻れる", async () => {
    mockHanamask(async () => null);
    const onBack = vi.fn();

    render(<NoteDetail noteId="missing-note" onBack={onBack} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

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

  it("画像の添付操作には文字のラベルが見えている", async () => {
    mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");

    // アイコンや既定のファイル選択ボタンだけでは何を選ぶ入力なのか伝わらない。
    expect(screen.getByText("画像を添付").tagName).toBe("LABEL");
    expect(screen.getByLabelText("画像を添付").getAttribute("type")).toBe("file");
  });

  it("画像が無いときはプレビューを表示しない", async () => {
    mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

  it("MCP経由の変更通知を受けると画像一覧を再取得する", async () => {
    const attached = makeImage({ id: "image-mcp", filePath: "/data/images/mcp.png" });
    let stored: Image[] = [];
    const { listImages, onNotesChanged } = mockHanamask(async () => makeNote(), {
      listImages: async () => stored,
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    expect(screen.queryAllByRole("img")).toHaveLength(0);

    stored = [attached];
    await emitNotesChanged(onNotesChanged);

    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });
    expect(screen.getByRole("img").getAttribute("src")).toBe("file:///data/images/mcp.png");
    expect(listImages).toHaveBeenCalledTimes(2);
  });

  it("添付が形式・サイズエラーで失敗したらエラーメッセージを表示する", async () => {
    mockHanamask(async () => makeNote(), {
      attachImage: async () => {
        throw new Error("Unsupported image type: application/pdf");
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");

    await pasteFile(new File(["hello"], "clipboard.bmp", { type: "image/bmp" }));

    expect((await screen.findByRole("alert")).textContent).toContain("image/bmp");
  });

  it("noteIdが変わったら新しいノートを取得し直す", async () => {
    const { getNote } = mockHanamask(async () => makeNote());
    getNote.mockImplementation(async (id: string) =>
      id === "note-2" ? makeNote({ id: "note-2", title: "別のノート" }) : makeNote(),
    );

    const { rerender } = render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    rerender(<NoteDetail noteId="note-2" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("別のノート")).toBeTruthy();
    expect(getNote).toHaveBeenCalledTimes(2);
  });

  it("本文中のMermaidコードフェンスは図として描画し、フェンスのテキストは出力しない", async () => {
    mockMermaidRender();
    const body = "前書き\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n後書き";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    expect(vi.mocked(mermaid.render).mock.calls[0]?.[1]).toBe("graph TD;\n  A-->B;");
    expect(screen.queryByText(/```mermaid/)).toBeNull();
    expect(screen.queryByText(/graph TD;/)).toBeNull();
  });

  it("Mermaidコードフェンスの前後のプレーンテキストはそのまま表示する", async () => {
    mockMermaidRender();
    const body = "前書き\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n後書き";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText(/前書き/)).toBeTruthy();
    expect(screen.getByText(/後書き/)).toBeTruthy();
  });

  it("Mermaid以外のコードフェンスは図にせずプレーンテキストのまま表示する", async () => {
    mockMermaidRender();
    mockHanamask(async () => makeNote({ body: "```ts\nconst a = 1;\n```" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText(/const a = 1;/)).toBeTruthy();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("Mermaidコードフェンスが複数ある場合はそれぞれを図として描画する", async () => {
    mockMermaidRender();
    const body = "```mermaid\ngraph TD;\n  A-->B;\n```\n中間\n```mermaid\ngraph LR;\n  C-->D;\n```";
    mockHanamask(async () => makeNote({ body }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/中間/)).toBeTruthy();
  });
});

describe("NoteDetail の編集", () => {
  it("編集ボタンで編集フォームに現在の内容を表示する", async () => {
    mockHanamask(async () => makeNote());

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await waitFor(() => expect(queryRenderedSvg()).not.toBeNull());
    await startEditing();

    expect(fieldValue("本文")).toBe(body);
    expect(queryRenderedSvg()).toBeNull();
  });

  it("保存すると編集内容でupdateNoteを呼ぶ", async () => {
    const { updateNote } = mockHanamask(async () => makeNote(), {
      updateNote: async () => makeNote({ title: "改訂版", body: "新しい本文", tags: ["mcp"] }),
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "改訂版");
    await clickButton("保存");

    expect((await screen.findByRole("alert")).textContent).toContain("update failed");
    expect(fieldValue("タイトル")).toBe("改訂版");
  });

  it("更新対象のノートが存在しない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => makeNote(), { updateNote: async () => null });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
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

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("旧タイトル")).toBeTruthy();
    expect(screen.getByRole("button", { name: "このバージョンに戻す" })).toBeTruthy();
    expect(listNoteVersions).toHaveBeenCalledWith("note-1");
  });

  it("編集モードでは編集履歴を表示しない", async () => {
    mockHanamask(async () => makeNote(), { listNoteVersions: async () => [makeVersion()] });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await startEditing();

    expect(screen.queryByText("旧タイトル")).toBeNull();
    expect(screen.queryByRole("button", { name: "このバージョンに戻す" })).toBeNull();
  });

  it("復元の応答待ちの間は編集モードに入れず、復元結果が編集内容に上書きされない", async () => {
    let resolveRestore: ((note: Note) => void) | undefined;
    mockHanamask(async () => makeNote(), {
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: () =>
        new Promise<Note | null>((resolve) => {
          resolveRestore = resolve;
        }),
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickButton("このバージョンに戻す");

    // 応答待ちの間に編集を始めると、復元前の内容を基にしたフォームの保存で復元結果が失われる。
    expect(screen.getByRole("button", { name: "編集" }).hasAttribute("disabled")).toBe(true);
    await clickButton("編集");
    expect(screen.queryByLabelText("タイトル")).toBeNull();

    await act(async () => {
      resolveRestore?.(makeNote({ title: "復元されたタイトル", body: "復元された本文" }));
    });

    expect(await screen.findByText("復元されたタイトル")).toBeTruthy();
    expect(screen.getByRole("button", { name: "編集" }).hasAttribute("disabled")).toBe(false);
    await startEditing();
    expect(fieldValue("タイトル")).toBe("復元されたタイトル");
    expect(fieldValue("本文")).toBe("復元された本文");
    vi.unstubAllGlobals();
  });

  it("履歴から復元すると表示中の内容が復元後のノートになる", async () => {
    mockHanamask(async () => makeNote(), {
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: async () => makeNote({ title: "復元されたタイトル", body: "復元された本文" }),
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickButton("このバージョンに戻す");

    expect(await screen.findByText("復元されたタイトル")).toBeTruthy();
    expect(screen.getByText("復元された本文")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("NoteDetail の外部更新反映", () => {
  const EXTERNAL_NOTICE = /別の場所で更新されました/;

  const mockChangingNote = () => {
    let current = makeNote();
    const api = mockHanamask(async () => current);
    const updateExternally = (overrides: Partial<Note>): void => {
      current = makeNote({ ...current, ...overrides });
    };
    return { ...api, updateExternally };
  };

  it("表示モードで変更通知を受けるとタイトル・本文・タグを最新に更新する", async () => {
    const { onNotesChanged, updateExternally } = mockChangingNote();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");

    updateExternally({ title: "MCPが書き換えた", body: "MCPが書き換えた本文", tags: ["ai"] });
    await emitNotesChanged(onNotesChanged);

    expect(await screen.findByText("MCPが書き換えた")).toBeTruthy();
    expect(screen.getByText("MCPが書き換えた本文")).toBeTruthy();
    expect(screen.getByText("ai")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
  });

  it("編集中に変更通知を受けても編集内容を上書きしない", async () => {
    const { onNotesChanged, updateExternally } = mockChangingNote();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "編集中のタイトル");
    typeInto("本文", "編集中の本文");

    updateExternally({ title: "MCPが書き換えた", body: "MCPが書き換えた本文" });
    await emitNotesChanged(onNotesChanged);

    expect(fieldValue("タイトル")).toBe("編集中のタイトル");
    expect(fieldValue("本文")).toBe("編集中の本文");
  });

  it("編集中に変更通知を受けると通知を表示し、破棄して最新を読み込める", async () => {
    const { onNotesChanged, updateExternally } = mockChangingNote();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "編集中のタイトル");

    updateExternally({ title: "MCPが書き換えた", body: "MCPが書き換えた本文", tags: ["ai"] });
    await emitNotesChanged(onNotesChanged);

    expect(await screen.findByText(EXTERNAL_NOTICE)).toBeTruthy();

    await clickButton("破棄して最新を読み込む");

    expect(screen.getByText("MCPが書き換えた")).toBeTruthy();
    expect(screen.getByText("MCPが書き換えた本文")).toBeTruthy();
    expect(screen.queryByLabelText("タイトル")).toBeNull();
    expect(screen.queryByText(EXTERNAL_NOTICE)).toBeNull();
  });

  it("編集をキャンセルすると通知が消え最新の内容を表示する", async () => {
    const { onNotesChanged, updateExternally } = mockChangingNote();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();

    updateExternally({ title: "MCPが書き換えた" });
    await emitNotesChanged(onNotesChanged);
    await screen.findByText(EXTERNAL_NOTICE);
    await clickButton("キャンセル");

    expect(screen.queryByText(EXTERNAL_NOTICE)).toBeNull();
    expect(screen.getByText("MCPが書き換えた")).toBeTruthy();
  });

  it("編集中の保存後は通知が残らない", async () => {
    const { onNotesChanged, updateExternally } = mockChangingNote();
    window.hanamask.updateNote = vi.fn(async () => makeNote({ title: "利用者の保存結果" }));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "利用者の保存結果");

    updateExternally({ title: "MCPが書き換えた" });
    await emitNotesChanged(onNotesChanged);
    await screen.findByText(EXTERNAL_NOTICE);
    await clickButton("保存");

    expect(await screen.findByText("利用者の保存結果")).toBeTruthy();
    expect(screen.queryByText(EXTERNAL_NOTICE)).toBeNull();
  });

  it("復元の応答待ち中の変更通知では表示中のノートを取り直さない", async () => {
    let resolveRestore: ((note: Note) => void) | undefined;
    const { getNote, onNotesChanged } = mockHanamask(async () => makeNote(), {
      listNoteVersions: async () => [makeVersion()],
      restoreNoteVersion: () =>
        new Promise<Note | null>((resolve) => {
          resolveRestore = resolve;
        }),
    });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("旧タイトル");
    await clickButton("このバージョンに戻す");
    await emitNotesChanged(onNotesChanged);

    // 復元前の内容が後から届くと復元結果を打ち消すため、応答待ち中は取り直さない。
    expect(getNote).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRestore?.(makeNote({ title: "復元されたタイトル" }));
    });

    expect(await screen.findByText("復元されたタイトル")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("再取得の応答待ち中に履歴から復元すると、後から届いた取得結果で復元結果が消えない", async () => {
    let resolveReload: ((note: Note) => void) | undefined;
    let loadCount = 0;
    const { onNotesChanged } = mockHanamask(
      async () => {
        loadCount += 1;
        if (loadCount === 1) return makeNote();
        return new Promise<Note>((resolve) => {
          resolveReload = resolve;
        });
      },
      {
        listNoteVersions: async () => [makeVersion()],
        restoreNoteVersion: async () =>
          makeNote({ title: "復元されたタイトル", body: "復元された本文" }),
      },
    );
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("旧タイトル");
    // 取得が先に始まり、その応答待ちの間に復元が始まって先に完了する順序。
    await emitNotesChanged(onNotesChanged);
    await clickButton("このバージョンに戻す");
    await act(async () => {
      resolveReload?.(makeNote());
    });

    expect(screen.getByText("復元されたタイトル")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("再取得の応答待ち中に編集を保存すると、後から届いた取得結果で保存結果が消えない", async () => {
    let resolveReload: ((note: Note) => void) | undefined;
    let loadCount = 0;
    const { onNotesChanged } = mockHanamask(
      async () => {
        loadCount += 1;
        if (loadCount === 1) return makeNote();
        return new Promise<Note>((resolve) => {
          resolveReload = resolve;
        });
      },
      { updateNote: async () => makeNote({ title: "利用者の保存結果" }) },
    );

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await startEditing();
    typeInto("タイトル", "利用者の保存結果");
    // 取得が先に始まり、その応答待ちの間に保存が始まって先に完了する順序。
    await emitNotesChanged(onNotesChanged);
    await clickButton("保存");
    await act(async () => {
      resolveReload?.(makeNote());
    });

    expect(screen.getByText("利用者の保存結果")).toBeTruthy();
    expect(screen.queryByText("設計メモ")).toBeNull();
  });

  it("画像一覧の再取得の応答待ち中に画像を添付すると、後から届いた取得結果で添付が消えない", async () => {
    const attached = makeImage({ id: "image-9", filePath: "/data/images/new.png" });
    let resolvePendingList: ((images: Image[]) => void) | undefined;
    let stored: Image[] = [];
    let listCount = 0;
    const { onNotesChanged } = mockHanamask(async () => makeNote(), {
      listImages: async () => {
        listCount += 1;
        // 2回目＝変更通知による再取得。添付が終わったあとに解決させるため保留する。
        if (listCount !== 2) return stored;
        return new Promise<Image[]>((resolve) => {
          resolvePendingList = resolve;
        });
      },
      attachImage: async () => {
        stored = [attached];
        return attached;
      },
    });

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    // 取得が先に始まり、その応答待ちの間に添付が始まって先に完了する順序。
    await emitNotesChanged(onNotesChanged);
    await selectFile(new File(["hello"], "shot.png", { type: "image/png" }));
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });

    await act(async () => {
      resolvePendingList?.([]);
    });

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("src")).toBe("file:///data/images/new.png");
  });

  it("画像を添付しても応答待ち中だったノート本体の再取得は捨てられない", async () => {
    const attached = makeImage({ id: "image-9", filePath: "/data/images/new.png" });
    let resolveReload: ((note: Note) => void) | undefined;
    let loadCount = 0;
    let stored: Image[] = [];
    const { onNotesChanged } = mockHanamask(
      async () => {
        loadCount += 1;
        if (loadCount === 1) return makeNote();
        return new Promise<Note>((resolve) => {
          resolveReload = resolve;
        });
      },
      {
        listImages: async () => stored,
        attachImage: async () => {
          stored = [attached];
          return attached;
        },
      },
    );

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
    await emitNotesChanged(onNotesChanged);
    await selectFile(new File(["hello"], "shot.png", { type: "image/png" }));
    // 画像が出るまで待つことで、添付が完全に終わり加算も済んだことを保証する。ここで待たないと
    // 加算前にノートの取得が解決してしまい、相乗り実装にしてもこのテストが通ってしまう。
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(1);
    });

    await act(async () => {
      resolveReload?.(makeNote({ title: "MCPが書き換えた" }));
    });

    expect(screen.getByText("MCPが書き換えた")).toBeTruthy();
  });

  it("背景リロードの失敗はノートを切り替えると消える", async () => {
    let failReload = false;
    const { onNotesChanged } = mockHanamask(async (id) => {
      if (failReload) throw new Error("boom");
      return makeNote({ id, title: id === "note-1" ? "設計メモ" : "別のメモ" });
    });

    const { rerender } = render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");

    failReload = true;
    await emitNotesChanged(onNotesChanged);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "最新の内容の取得に失敗しました",
    );

    failReload = false;
    rerender(<NoteDetail noteId="note-2" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByText("別のメモ")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("NoteDetail のリンク", () => {
  const mockLinks = () => {
    mockHanamask(async () => makeNote());
    const listLinks = vi.fn(async () => []);
    window.hanamask.listLinks = listLinks;
    return { listLinks };
  };

  it("表示モードではリンクUIを表示する", async () => {
    const { listLinks } = mockLinks();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "リンク" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "リンクする" })).toBeTruthy();
    await waitFor(() => {
      expect(listLinks).toHaveBeenCalledWith("note", "note-1");
    });
  });

  it("編集モードではリンクUIを表示しない", async () => {
    mockLinks();

    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByRole("heading", { name: "リンク" });
    await startEditing();

    expect(screen.queryByRole("heading", { name: "リンク" })).toBeNull();
    expect(screen.queryByRole("button", { name: "リンクする" })).toBeNull();
  });
});

describe("NoteDetail の本文Markdown描画", () => {
  const renderBody = async (body: string): Promise<void> => {
    // タグ一覧も ul なので、本文の箇条書きだけを数えられるようタグは空にしておく。
    mockHanamask(async () => makeNote({ body, tags: [] }));
    render(<NoteDetail noteId="note-1" onBack={vi.fn()} onSelectNote={vi.fn()} />);
    await screen.findByText("設計メモ");
  };

  const bodyRoot = (): HTMLElement => screen.getByRole("article");

  it("見出し・箇条書き・強調・リンク・コードブロックを要素として描画する", async () => {
    await renderBody(
      [
        "## 進捗",
        "",
        "- 実装した",
        "- **重要**な残件",
        "",
        "[仕様](https://example.com/spec)",
        "",
        "```ts",
        "const a = 1;",
        "```",
      ].join("\n"),
    );

    expect(screen.getByRole("heading", { level: 2, name: "進捗" })).toBeTruthy();
    expect(bodyRoot().querySelectorAll("ul > li")).toHaveLength(2);
    expect(bodyRoot().querySelector("strong")?.textContent).toBe("重要");
    expect(screen.getByRole("link", { name: "仕様" }).getAttribute("href")).toBe(
      "https://example.com/spec",
    );
    expect(bodyRoot().querySelector("pre > code")?.textContent).toContain("const a = 1;");
    expect(screen.queryByText("## 進捗")).toBeNull();
  });

  it("本文に埋め込んだHTMLと表とstyle属性を描画する", async () => {
    await renderBody(
      [
        "<div>",
        '  <table><tbody><tr><td style="color: red">セル</td></tr></tbody></table>',
        "</div>",
      ].join("\n"),
    );

    expect(bodyRoot().querySelector("div > table")).not.toBeNull();
    const cell = bodyRoot().querySelector("td");
    expect(cell?.textContent).toBe("セル");
    expect(cell?.style.color).toBe("red");
  });

  it("scriptタグは要素としてもテキストとしても通さない", async () => {
    await renderBody('本文\n\n<script>window.__pwned = true;</script>\n');

    expect(bodyRoot().querySelector("script")).toBeNull();
    expect(screen.queryByText(/__pwned/)).toBeNull();
    expect(screen.getByText("本文")).toBeTruthy();
  });

  it("iframeは通さない", async () => {
    await renderBody('<iframe src="https://example.com"></iframe>');

    expect(bodyRoot().querySelector("iframe")).toBeNull();
  });

  it("javascript:スキームのリンクはhrefを落とす", async () => {
    await renderBody("[危険](javascript:alert(1))");

    const link = bodyRoot().querySelector("a");
    expect(link?.textContent).toBe("危険");
    expect(link?.getAttribute("href")).toBeNull();
  });

  it("イベントハンドラ属性は落とす", async () => {
    await renderBody('<img src="https://example.com/a.png" alt="図" onerror="alert(1)">');

    const image = bodyRoot().querySelector("img[alt='図']");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("onerror")).toBeNull();
    expect(image?.outerHTML).not.toContain("alert");
  });
});
