/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskDetail } from "../../src/renderer/components/TaskDetail";
import type { Image, Task } from "../../src/shared/preload-api";

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
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (
  getTask: (id: string) => Promise<Task | null>,
  updateTaskStatusImpl: () => Promise<void> = async () => {},
) => {
  const getTaskMock = vi.fn(getTask);
  const updateTaskStatus = vi.fn(updateTaskStatusImpl);
  const onTasksChangedMock = vi.fn<(callback: () => void) => () => void>(() => () => {});
  window.hanamask = {
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: getTaskMock,
    updateTaskStatus,
    updateTask: vi.fn(async () => null),
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
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
  };
  return { getTask: getTaskMock, updateTaskStatus, onTasksChanged: onTasksChangedMock };
};

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
});
