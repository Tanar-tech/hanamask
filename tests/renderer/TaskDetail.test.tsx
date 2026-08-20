/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import mermaid from "mermaid";
import { TaskDetail } from "../../src/renderer/components/TaskDetail";
import type { AppSettings, Image, Task } from "../../src/shared/preload-api";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

const mockMermaidRender = (): void => {
  vi.mocked(mermaid.render).mockResolvedValue({
    svg: '<svg data-name="rendered"></svg>',
    diagramType: "flowchart",
  });
};

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
  mimeType: "image/png",
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "MCPサーバーを実装する",
  body: "",
  tags: [],
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

type UpdateTaskImpl = (
  id: string,
  input: Partial<Pick<Task, "title" | "body" | "status" | "dueDate">>,
) => Promise<Task | null>;

const mockHanamask = (
  getTask: (id: string) => Promise<Task | null>,
  updateTaskStatusImpl: () => Promise<void> = async () => {},
  updateTaskImpl: UpdateTaskImpl = async (_id, input) => makeTask(input),
) => {
  const getTaskMock = vi.fn(getTask);
  const updateTaskStatus = vi.fn(updateTaskStatusImpl);
  const updateTaskMock = vi.fn(updateTaskImpl);
  const onTasksChangedMock = vi.fn<(callback: () => void) => () => void>(() => () => {});
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    onNotebooksChanged: vi.fn(() => () => undefined),
    listDeletedNotebooks: vi.fn(async () => []),
    restoreNotebook: vi.fn(async () => true),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: getTaskMock,
    updateTaskStatus,
    updateTask: updateTaskMock,
    onTasksChanged: onTasksChangedMock,
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
  return {
    getTask: getTaskMock,
    updateTaskStatus,
    updateTask: updateTaskMock,
    onTasksChanged: onTasksChangedMock,
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

const emitTasksChanged = async (
  onTasksChanged: ReturnType<typeof mockHanamask>["onTasksChanged"],
): Promise<void> => {
  await act(async () => {
    onTasksChanged.mock.calls.forEach(([callback]) => {
      callback();
    });
  });
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T,>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

afterEach(() => {
  cleanup();
  // vi.mockのファクトリで作ったvi.fnはrestoreAllMocksでは呼び出し履歴が消えないため明示的にクリアする。
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("TaskDetail", () => {
  it("マウント時に指定IDのタスクを取得してタイトル・ステータス・期限を表示する", async () => {
    const { getTask } = mockHanamask(async () => makeTask());

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(screen.getByText("2026-08-10")).toBeTruthy();
    expect(getTask).toHaveBeenCalledWith("task-1");
  });

  it("期限がないタスクでもタイトルを表示する", async () => {
    mockHanamask(async () => makeTask({ dueDate: null }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(screen.getByText("期限なし")).toBeTruthy();
  });

  it("タスクが見つからない場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => null);

    render(<TaskDetail taskId="missing-task" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("取得に失敗した場合はエラーメッセージを表示する", async () => {
    mockHanamask(async () => {
      throw new Error("boom");
    });

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("ステータス選択の初期値は現在のステータスである", async () => {
    mockHanamask(async () => makeTask({ status: "in_progress" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    const select = await screen.findByRole("combobox", { name: "ステータス" });
    expect((select as HTMLSelectElement).value).toBe("in_progress");
  });

  it("ステータスを変更するとupdateTaskStatusを呼び表示も更新される", async () => {
    const { updateTaskStatus } = mockHanamask(async () => makeTask());

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    const select = await screen.findByRole("combobox", { name: "ステータス" });
    await act(async () => {
      fireEvent.change(select, { target: { value: "done" } });
    });

    expect(updateTaskStatus).toHaveBeenCalledWith("task-1", "done");
    expect((select as HTMLSelectElement).value).toBe("done");
  });

  it("ステータス更新に失敗したらエラーを表示する", async () => {
    const { updateTaskStatus } = mockHanamask(async () => makeTask());
    updateTaskStatus.mockRejectedValueOnce(new Error("boom"));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    const select = await screen.findByRole("combobox", { name: "ステータス" });
    await act(async () => {
      fireEvent.change(select, { target: { value: "done" } });
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("ステータス更新の失敗はステータス欄の中に表示する", async () => {
    const { updateTaskStatus } = mockHanamask(async () => makeTask());
    updateTaskStatus.mockRejectedValueOnce(new Error("boom"));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    const select = await screen.findByRole("combobox", { name: "ステータス" });
    await act(async () => {
      fireEvent.change(select, { target: { value: "done" } });
    });

    const alert = await screen.findByRole("alert");
    expect(select.closest("div")?.contains(alert)).toBe(true);
  });

  it("ステータス更新に成功するとステータス欄のエラーが消える", async () => {
    const { updateTaskStatus } = mockHanamask(async () => makeTask());
    updateTaskStatus.mockRejectedValueOnce(new Error("boom"));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    const select = await screen.findByRole("combobox", { name: "ステータス" });
    await act(async () => {
      fireEvent.change(select, { target: { value: "done" } });
    });
    expect(await screen.findByRole("alert")).toBeTruthy();

    await act(async () => {
      fireEvent.change(select, { target: { value: "in_progress" } });
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("本文が空のタスクでは本文が無いことを文字で示す", async () => {
    mockHanamask(async () => makeTask({ body: "   " }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByText("本文はまだありません")).toBeTruthy();
  });

  it("本文があるタスクでは本文が無いという表示を出さない", async () => {
    mockHanamask(async () => makeTask({ body: "本文があります" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByText("本文があります")).toBeTruthy();
    expect(screen.queryByText("本文はまだありません")).toBeNull();
  });

  it("戻るボタンに一覧画面と違う面色を付けない", async () => {
    mockHanamask(async () => makeTask());

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    const back = await screen.findByRole("button", { name: "戻る" });
    expect(back.className).not.toContain("bg-paper-raised");
  });

  it("MCP経由の変更通知を受けるとタスクを再取得して表示を更新する", async () => {
    let stored = makeTask();
    const { getTask, onTasksChanged } = mockHanamask(async () => stored);

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    stored = makeTask({ title: "MCPサーバーを実装する(改題)", status: "in_progress" });
    await emitTasksChanged(onTasksChanged);

    expect(await screen.findByText("MCPサーバーを実装する(改題)")).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "ステータス" });
    expect((select as HTMLSelectElement).value).toBe("in_progress");
    expect(getTask).toHaveBeenCalledTimes(2);
  });

  it("ステータス変更の応答待ち中に変更通知が届いても変更結果が巻き戻らない", async () => {
    const update = createDeferred<void>();
    const staleReload = createDeferred<Task>();
    let loadCount = 0;
    const { onTasksChanged, getTask } = mockHanamask(
      async () => {
        loadCount += 1;
        return loadCount === 1 ? makeTask() : staleReload.promise;
      },
      async () => update.promise,
    );

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    const select = await screen.findByRole("combobox", { name: "ステータス" });
    await act(async () => {
      fireEvent.change(select, { target: { value: "done" } });
    });

    await emitTasksChanged(onTasksChanged);
    await act(async () => {
      update.resolve();
    });
    await act(async () => {
      staleReload.resolve(makeTask({ status: "todo" }));
    });

    expect((select as HTMLSelectElement).value).toBe("done");
    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it("変更通知後の再取得に失敗しても表示中のタスクは消えない", async () => {
    let failing = false;
    const { onTasksChanged } = mockHanamask(async () => {
      if (failing) throw new Error("boom");
      return makeTask();
    });

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    failing = true;
    await emitTasksChanged(onTasksChanged);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("MCPサーバーを実装する")).toBeTruthy();
  });

  it("戻るボタンをクリックするとonBackを呼ぶ", async () => {
    mockHanamask(async () => makeTask());
    const onBack = vi.fn();

    render(<TaskDetail taskId="task-1" onBack={onBack} />);
    await screen.findByText("MCPサーバーを実装する");
    await act(async () => {
      screen.getByRole("button", { name: "戻る" }).click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("TaskDetail の本文", () => {
  it("本文のMarkdownを見出し・箇条書き・表として描画する", async () => {
    mockHanamask(async () =>
      makeTask({ body: "## 見出し\n\n- 箇条書き\n\n| 項目 | 値 |\n|---|---|\n| a | b |" }),
    );

    const { container } = render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    expect(await screen.findByRole("heading", { name: "見出し", level: 2 })).toBeTruthy();
    expect(container.querySelector("li")?.textContent).toBe("箇条書き");
    expect(container.querySelectorAll("td")).toHaveLength(2);
  });

  it("本文のscriptタグは要素としてもテキストとしても通さない", async () => {
    mockHanamask(async () => makeTask({ body: "前<script>window.__pwned = true;</script>後" }));

    const { container } = render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    await waitFor(() => {
      expect(screen.getByText(/前/)).toBeTruthy();
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("window.__pwned");
  });

  it("本文のonerror属性を落とす", async () => {
    mockHanamask(async () =>
      makeTask({ body: '<img src="https://example.com/a.png" alt="図" onerror="alert(1)">' }),
    );

    const { container } = render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    const image = await waitFor(() => {
      const found = container.querySelector("img");
      expect(found).not.toBeNull();
      return found;
    });
    expect(image?.getAttribute("onerror")).toBeNull();
  });

  it("本文のmermaidフェンスを図として描画し、フェンスのテキストは出さない", async () => {
    mockMermaidRender();
    mockHanamask(async () => makeTask({ body: "前書き\n\n```mermaid\ngraph TD;\n  A-->B;\n```" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(mermaid.render).mock.calls[0]?.[1]).toBe("graph TD;\n  A-->B;");
    expect(screen.queryByText(/```mermaid/)).toBeNull();
  });
});

describe("TaskDetail の編集", () => {
  it("編集ボタンで現在のタイトルと本文をフォームに表示する", async () => {
    mockHanamask(async () => makeTask({ body: "元の本文" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();

    expect(fieldValue("タイトル")).toBe("MCPサーバーを実装する");
    expect(fieldValue("本文")).toBe("元の本文");
  });

  it("保存すると編集内容でupdateTaskを呼び表示を更新する", async () => {
    const { updateTask } = mockHanamask(async () => makeTask({ body: "元の本文" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("タイトル", "改題したタスク");
    typeInto("本文", "## 新しい本文");
    await clickButton("保存");

    expect(updateTask).toHaveBeenCalledWith("task-1", {
      title: "改題したタスク",
      body: "## 新しい本文",
    });
    expect(await screen.findByText("改題したタスク")).toBeTruthy();
    expect(screen.getByText("新しい本文")).toBeTruthy();
  });

  it("保存に失敗しても入力内容は残したままエラーを表示する", async () => {
    mockHanamask(
      async () => makeTask({ body: "元の本文" }),
      async () => {},
      async () => {
        throw new Error("boom");
      },
    );

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("本文", "書きかけの本文");
    await clickButton("保存");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fieldValue("本文")).toBe("書きかけの本文");
  });

  it("キャンセルすると編集前の内容に戻る", async () => {
    mockHanamask(async () => makeTask({ body: "元の本文" }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("本文", "捨てられる本文");
    await clickButton("キャンセル");

    expect(screen.queryByLabelText("本文")).toBeNull();
    expect(screen.getByText("元の本文")).toBeTruthy();
  });

  it("編集中に変更通知を受けても編集内容を上書きしない", async () => {
    let stored = makeTask({ body: "元の本文" });
    const { onTasksChanged } = mockHanamask(async () => stored);

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("タイトル", "編集中のタイトル");
    typeInto("本文", "編集中の本文");

    stored = makeTask({ title: "MCPが書き換えた", body: "MCPが書き換えた本文" });
    await emitTasksChanged(onTasksChanged);

    expect(fieldValue("タイトル")).toBe("編集中のタイトル");
    expect(fieldValue("本文")).toBe("編集中の本文");
  });

  it("編集中に変更通知を受けると通知を表示し、破棄して最新を読み込める", async () => {
    let stored = makeTask({ body: "元の本文" });
    const { onTasksChanged } = mockHanamask(async () => stored);

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("本文", "編集中の本文");

    stored = makeTask({ title: "MCPが書き換えた", body: "MCPが書き換えた本文" });
    await emitTasksChanged(onTasksChanged);

    expect(await screen.findByText(/別の場所で更新されました/)).toBeTruthy();

    await clickButton("破棄して最新を読み込む");

    expect(screen.getByText("MCPが書き換えた")).toBeTruthy();
    expect(screen.getByText("MCPが書き換えた本文")).toBeTruthy();
    expect(screen.queryByLabelText("本文")).toBeNull();
    expect(screen.queryByText(/別の場所で更新されました/)).toBeNull();
  });

  it("編集中の保存後は外部更新の通知が残らない", async () => {
    let stored = makeTask({ body: "元の本文" });
    const { onTasksChanged } = mockHanamask(async () => stored);

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");
    await startEditing();
    typeInto("タイトル", "利用者の保存結果");

    stored = makeTask({ title: "MCPが書き換えた" });
    await emitTasksChanged(onTasksChanged);
    await screen.findByText(/別の場所で更新されました/);
    await clickButton("保存");

    expect(await screen.findByText("利用者の保存結果")).toBeTruthy();
    expect(screen.queryByText(/別の場所で更新されました/)).toBeNull();
  });
});

describe("TaskDetail のリンク", () => {
  it("リンクUIを表示し自分を対象にリンク一覧を取得する", async () => {
    mockHanamask(async () => makeTask());
    const listLinks = vi.fn(async () => []);
    window.hanamask.listLinks = listLinks;

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "リンク" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "リンクする" })).toBeTruthy();
    await waitFor(() => {
      expect(listLinks).toHaveBeenCalledWith("task", "task-1");
    });
  });

  it("タスク詳細にタグを表示する", async () => {
    mockHanamask(async () => makeTask({ tags: ["プロジェクトB", "不具合"] }));

    render(<TaskDetail taskId="task-1" onBack={vi.fn()} />);

    const tags = await screen.findByRole("list", { name: "タグ" });
    expect(within(tags).getByText("プロジェクトB")).toBeTruthy();
    expect(within(tags).getByText("不具合")).toBeTruthy();
  });
});
