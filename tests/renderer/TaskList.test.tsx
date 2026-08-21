/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import { renderWithMotion as render } from "./motion-render";
import { TaskList } from "../../src/renderer/components/TaskList";
import type { AppSettings, Image, Task } from "../../src/shared/preload-api";

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

const mockHanamask = (tasksByCall: Task[][]) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const listTasks = vi.fn(
    async () =>
      tasksByCall[Math.min(listTasks.mock.calls.length - 1, tasksByCall.length - 1)] ?? [],
  );
  const onTasksChanged = vi.fn((callback: () => void) => {
    listeners.push(callback);
    return unsubscribe;
  });
  const deleteTask = vi.fn(async () => {});
  window.hanamask = {
    deleteTask,
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
  listNotebooks: vi.fn(async () => []),
  getNotebook: vi.fn(async () => ({ notebook: null, notes: [] })),
  updateNotebook: vi.fn(async () => null),
  restoreNotebook: vi.fn(async () => true),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks,
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    updateTask: vi.fn(async () => null),
    onTasksChanged,
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
    semanticSearch: vi.fn(async () => ({ notes: [], tasks: [], notebooks: [] })),
    relatedNotes: vi.fn(async () => ({ notes: [] })),
    readEmbeddingStatus: vi.fn(async () => ({ state: "unavailable" as const, pending: 0 })),
    onEmbeddingStatusChanged: vi.fn(() => () => {}),
  };
  return { listTasks, onTasksChanged, listeners, unsubscribe, deleteTask };
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

describe("TaskList", () => {
  it("初期表示でタスクのタイトル・ステータス・期限をレンダリングする", async () => {
    mockHanamask([
      [
        makeTask(),
        makeTask({ id: "task-2", title: "テストを書く", status: "done", dueDate: null }),
      ],
    ]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(screen.getByText("テストを書く")).toBeTruthy();
    expect(screen.getByText("未着手")).toBeTruthy();
    expect(screen.getByText("完了")).toBeTruthy();
    expect(screen.getByText("2026-08-10")).toBeTruthy();
  });

  it("一覧に名前を付けて読み上げできるようにする", async () => {
    mockHanamask([[makeTask()]]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByRole("list", { name: "タスク一覧" })).toBeTruthy();
  });

  it("onTasksChangedのコールバックでタスク一覧を再取得して更新する", async () => {
    const { listTasks, listeners } = mockHanamask([
      [makeTask()],
      [makeTask(), makeTask({ id: "task-2", title: "追加されたタスク" })],
    ]);

    render(<TaskList onSelectTask={vi.fn()} />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();
    expect(listTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたタスク")).toBeTruthy();
  });

  it("タスクが0件のとき空状態メッセージを表示する", async () => {
    mockHanamask([[]]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("タスクはまだありません")).toBeTruthy();
  });

  it("読み込みに失敗したときエラーを表示する", async () => {
    mockHanamask([[]]);
    window.hanamask.listTasks = vi.fn(() => Promise.reject(new Error("IPC失敗")));

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("本文があるタスクはMarkdownの記号を落とした抜粋を表示する", async () => {
    mockHanamask([[makeTask({ body: "# 見出し\n- 箇条書き" })]]);

    const { container } = render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("見出し 箇条書き")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("Mermaidのコードフェンスは抜粋に出さない", async () => {
    const body = ["前書き", "```mermaid", "flowchart TD", "  A --> B", "```"].join("\n");
    mockHanamask([[makeTask({ body })]]);

    render(<TaskList onSelectTask={vi.fn()} />);

    expect(await screen.findByText("前書き")).toBeTruthy();
    expect(screen.queryByText(/```/)).toBeNull();
    expect(screen.queryByText(/flowchart/)).toBeNull();
  });

  it("Mermaidだけの本文では抜粋を描画しない", async () => {
    mockHanamask([[makeTask({ body: "```mermaid\nflowchart TD\n```" })]]);

    const { container } = render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    expect(container.querySelectorAll("li p")).toHaveLength(2);
  });

  it("本文が空のタスクでは抜粋を描画しない", async () => {
    mockHanamask([[makeTask({ body: "" }), makeTask({ id: "task-2", body: "抜粋される本文" })]]);

    const { container } = render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("抜粋される本文");

    const cards = container.querySelectorAll("li");
    expect(cards).toHaveLength(2);
    // 抜粋を出すカードだけが段落を1つ多く持つ。
    expect(cards[0]?.querySelectorAll("p")).toHaveLength(2);
    expect(cards[1]?.querySelectorAll("p")).toHaveLength(3);
  });

  it("空白だけの本文では抜粋を描画しない", async () => {
    mockHanamask([[makeTask({ body: "   \n  " })]]);

    const { container } = render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("MCPサーバーを実装する");

    expect(container.querySelectorAll("li p")).toHaveLength(2);
  });

  it("削除ボタンで確認してOKするとそのタスクを削除する", async () => {
    const { deleteTask } = mockHanamask([
      [makeTask(), makeTask({ id: "task-2", title: "消すタスク" })],
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TaskList onSelectTask={vi.fn()} />);
    await clickDeleteButtonOf("消すタスク");

    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith("task-2");
  });

  it("削除の確認をキャンセルすると削除しない", async () => {
    const { deleteTask } = mockHanamask([[makeTask()]]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<TaskList onSelectTask={vi.fn()} />);
    await clickDeleteButtonOf("MCPサーバーを実装する");

    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("削除後のonTasksChangedで削除したタスクが一覧から消える", async () => {
    const { deleteTask, listeners } = mockHanamask([
      [makeTask(), makeTask({ id: "task-2", title: "消すタスク" })],
      [makeTask()],
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TaskList onSelectTask={vi.fn()} />);
    await clickDeleteButtonOf("消すタスク");
    expect(deleteTask).toHaveBeenCalledWith("task-2");

    await act(async () => {
      listeners.forEach((listener) => listener());
    });

    expect(screen.queryByText("消すタスク")).toBeNull();
    expect(screen.getByText("MCPサーバーを実装する")).toBeTruthy();
  });

  it("削除に失敗したらエラーを表示する", async () => {
    const { deleteTask } = mockHanamask([[makeTask()]]);
    deleteTask.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TaskList onSelectTask={vi.fn()} />);
    await clickDeleteButtonOf("MCPサーバーを実装する");

    expect((await screen.findByRole("alert")).textContent).toContain("タスクの削除に失敗しました");
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeTask()]]);

    const { unmount } = render(<TaskList onSelectTask={vi.fn()} />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  const manyTasks = (count: number, tags: string[] = []) =>
    Array.from({ length: count }, (_, index) =>
      makeTask({ id: `t${index}`, title: `タスク${String(index).padStart(2, "0")}`, tags }),
    );

  it("20件を超えると区切って出し、次へで続きが見える", async () => {
    mockHanamask([manyTasks(25)]);

    render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("タスク00");

    expect(screen.getByText("25件中 1–20件")).toBeTruthy();
    expect(screen.queryByText("タスク20")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });

    expect(screen.getByText("タスク20")).toBeTruthy();
    expect(screen.queryByText("タスク00")).toBeNull();
  });

  it("20件以内なら操作列を出さない", async () => {
    mockHanamask([manyTasks(20)]);

    render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("タスク00");

    expect(screen.queryByRole("button", { name: "次へ" })).toBeNull();
  });

  it("タグを選ぶと1ページ目に戻る", async () => {
    // 絞り込んだ結果も複数ページ残る量にする。1ページに収まる量だと、
    // 範囲外を最後のページへ寄せる処理だけで辻褄が合ってしまい、戻す処理を検証できない。
    const tagged = manyTasks(30, ["A"]);
    const untagged = Array.from({ length: 20 }, (_, index) =>
      makeTask({ id: `u${index}`, title: `無タグ${String(index).padStart(2, "0")}` }),
    );
    mockHanamask([[...tagged, ...untagged]]);

    render(<TaskList onSelectTask={vi.fn()} />);
    await screen.findByText("タスク00");

    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "次へ" }).click();
    });
    expect(screen.queryByText("タスク00")).toBeNull();

    await act(async () => {
      within(screen.getByRole("group", { name: "タグで絞り込む" }))
        .getByRole("button", { name: "A" })
        .click();
    });

    // 3ページ目に留まったままだと、絞り込んだ結果の先頭が見えない。
    expect(screen.getByText("タスク00")).toBeTruthy();
    expect(screen.getByText("30件中 1–20件")).toBeTruthy();
  });
});
