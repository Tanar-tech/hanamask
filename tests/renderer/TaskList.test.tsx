/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { renderWithMotion as render } from "./motion-render";
import { TaskList } from "../../src/renderer/components/TaskList";
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
    readChatSettings: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatApiKey: vi.fn(async () => ({ apiKeyMask: "4f2a", model: "claude-sonnet-4-5" })),
    clearChatApiKey: vi.fn(async () => ({ apiKeyMask: null, model: "claude-sonnet-4-5" })),
    saveChatModel: vi.fn(async (model: string) => ({ apiKeyMask: null, model })),
  };
  return { listTasks, onTasksChanged, listeners, unsubscribe };
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

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribe } = mockHanamask([[makeTask()]]);

    const { unmount } = render(<TaskList onSelectTask={vi.fn()} />);
    expect(await screen.findByText("MCPサーバーを実装する")).toBeTruthy();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
