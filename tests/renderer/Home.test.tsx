/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithMotion as render } from "./motion-render";
import { Home } from "../../src/renderer/components/Home";
import type { Image, Note, Task } from "../../src/shared/preload-api";

const MINUTE_MS = 60_000;
const now = Date.now();
const isoAgo = (minutes: number): string => new Date(now - minutes * MINUTE_MS).toISOString();
const isoMsAgo = (ms: number): string => new Date(Date.now() - ms).toISOString();

const AGENT_MARK = "たった今 · エージェントが更新";
// 実装のしきい値（Home.tsx の AGENT_UPDATE_WINDOW_MS）と対になる値
const AGENT_UPDATE_WINDOW_MS = 120_000;
// 実装のタイマー間隔（Home.tsx の AGENT_UPDATE_TICK_MS）と対になる値
const AGENT_UPDATE_TICK_MS = AGENT_UPDATE_WINDOW_MS / 8;

// テスト環境自身も setInterval を使うため、Homeが張ったものだけを間隔で見分ける
const tickTimerCallIndexOf = (spy: { mock: { calls: unknown[][] } }): number =>
  spy.mock.calls.findIndex((call) => call[1] === AGENT_UPDATE_TICK_MS);

// 並び替えを検証するため、入力を意図的に更新日時の順から崩す
const SCRAMBLE_ORDER = [3, 7, 0, 5, 1, 6, 2, 4];
const scrambled = (notes: Note[]): Note[] =>
  SCRAMBLE_ORDER.map((index) => notes[index]).filter((note): note is Note => note !== undefined);

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  fileUrl: "file:///data/images/a.png",
  mimeType: "image/png",
};

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "設計メモ",
  body: "MCPサーバーの設計についてのメモ本文",
  tags: ["design"],
  createdAt: isoAgo(120),
  updatedAt: isoAgo(120),
  ...overrides,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "UI一新のモックアップ",
  body: "",
  tags: [],
  status: "in_progress",
  dueDate: null,
  createdAt: isoAgo(120),
  updatedAt: isoAgo(120),
  ...overrides,
});

const makeNotes = (count: number): Note[] =>
  Array.from({ length: count }, (_unused, index) =>
    makeNote({
      id: `note-${String(index + 1)}`,
      title: `ノート${String(index + 1)}`,
      updatedAt: isoAgo(60 + index),
    }),
  );

const makeTasks = (count: number): Task[] =>
  Array.from({ length: count }, (_unused, index) =>
    makeTask({
      id: `task-${String(index + 1)}`,
      title: `タスク${String(index + 1)}`,
      status: "todo",
      updatedAt: isoAgo(60 + index),
    }),
  );

const mockHanamask = (notesByCall: Note[][], tasksByCall: Task[][] = [[]]) => {
  const noteListeners: Array<() => void> = [];
  const taskListeners: Array<() => void> = [];
  const unsubscribeNotes = vi.fn();
  const unsubscribeTasks = vi.fn();
  const nthOr = <T,>(source: T[][], call: number): T[] =>
    source[Math.min(call, source.length - 1)] ?? [];
  const listNotes = vi.fn(async () => nthOr(notesByCall, listNotes.mock.calls.length - 1));
  const listTasks = vi.fn(async () => nthOr(tasksByCall, listTasks.mock.calls.length - 1));
  const onNotesChanged = vi.fn((callback: () => void) => {
    noteListeners.push(callback);
    return unsubscribeNotes;
  });
  const onTasksChanged = vi.fn((callback: () => void) => {
    taskListeners.push(callback);
    return unsubscribeTasks;
  });
  window.hanamask = {
    deleteTask: vi.fn(async () => {}),
    listDeletedTasks: vi.fn(async () => []),
    restoreTask: vi.fn(async () => null),
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes,
    onNotesChanged,
    deleteNote: vi.fn(async () => {}),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
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
  return {
    listNotes,
    listTasks,
    noteListeners,
    taskListeners,
    unsubscribeNotes,
    unsubscribeTasks,
  };
};

const renderHome = (
  props: Partial<{
    onSelectNote: (id: string) => void;
    onSelectTask: (id: string) => void;
    onSearch: (query: string) => void;
  }> = {},
) =>
  render(
    <Home
      onSelectNote={props.onSelectNote ?? vi.fn()}
      onSelectTask={props.onSelectTask ?? vi.fn()}
      onSearch={props.onSearch ?? vi.fn()}
    />,
  );

const sectionOf = (name: string): HTMLElement => screen.getByRole("region", { name });

const titlesIn = (name: string): string[] =>
  within(sectionOf(name))
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Home", () => {
  it("最近のノートを新しい順に最大6件表示する", async () => {
    mockHanamask([scrambled(makeNotes(8))]);

    renderHome();

    expect(await screen.findByText("ノート1")).toBeTruthy();
    const titles = titlesIn("最近のノート");
    expect(titles).toHaveLength(6);
    expect(titles[0]).toBe("ノート1");
    expect(titles[5]).toBe("ノート6");
    expect(screen.queryByText("ノート7")).toBeNull();
  });

  it("未完了のタスクを最大5件表示し、完了したタスクは出さない", async () => {
    mockHanamask(
      [[]],
      [[...makeTasks(6), makeTask({ id: "task-done", title: "完了タスク", status: "done" })]],
    );

    renderHome();

    expect(await screen.findByText("タスク1")).toBeTruthy();
    const titles = titlesIn("進行中のタスク");
    expect(titles).toHaveLength(5);
    expect(screen.queryByText("タスク6")).toBeNull();
    expect(screen.queryByText("完了タスク")).toBeNull();
  });

  it("進行中のタスクを未着手より前に並べる", async () => {
    mockHanamask(
      [[]],
      [
        [
          makeTask({ id: "task-1", title: "未着手のタスク", status: "todo", updatedAt: isoAgo(1) }),
          makeTask({ id: "task-2", title: "作業中のタスク", status: "in_progress", updatedAt: isoAgo(90) }),
        ],
      ],
    );

    renderHome();

    expect(await screen.findByText("作業中のタスク")).toBeTruthy();
    expect(titlesIn("進行中のタスク")).toEqual(["作業中のタスク", "未着手のタスク"]);
  });

  it("タスクの状態を文字で示す", async () => {
    mockHanamask(
      [[]],
      [
        [
          makeTask({ id: "task-1", title: "着手前", status: "todo" }),
          makeTask({ id: "task-2", title: "作業中", status: "in_progress" }),
        ],
      ],
    );

    renderHome();

    expect(await screen.findByText("未着手")).toBeTruthy();
    expect(screen.getByText("進行中")).toBeTruthy();
  });

  it("ノートをクリックするとonSelectNoteを呼ぶ", async () => {
    mockHanamask([[makeNote({ id: "note-9", title: "開くノート" })]]);
    const onSelectNote = vi.fn();

    renderHome({ onSelectNote });
    const noteButton = await screen.findByRole("button", { name: "開くノート" });
    await act(async () => {
      noteButton.click();
    });

    expect(onSelectNote).toHaveBeenCalledWith("note-9");
  });

  it("タスクをクリックするとonSelectTaskを呼ぶ", async () => {
    mockHanamask([[]], [[makeTask({ id: "task-9", title: "開くタスク" })]]);
    const onSelectTask = vi.fn();

    renderHome({ onSelectTask });
    const taskButton = await screen.findByRole("button", { name: "開くタスク" });
    await act(async () => {
      taskButton.click();
    });

    expect(onSelectTask).toHaveBeenCalledWith("task-9");
  });

  it("検索を確定するとonSearchを呼ぶ", async () => {
    mockHanamask([[]]);
    const onSearch = vi.fn();

    renderHome({ onSearch });
    const input = await screen.findByLabelText("ノートとタスクを検索");
    const submitButton = screen.getByRole("button", { name: "検索" });
    fireEvent.change(input, { target: { value: "設計" } });
    await act(async () => {
      submitButton.click();
    });

    expect(onSearch).toHaveBeenCalledWith("設計");
  });

  it("検索語が空のときはonSearchを呼ばない", async () => {
    mockHanamask([[]]);
    const onSearch = vi.fn();

    renderHome({ onSearch });
    const submitButton = await screen.findByRole("button", { name: "検索" });
    await act(async () => {
      submitButton.click();
    });

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("onNotesChangedの通知でノートを再取得する", async () => {
    const { listNotes, noteListeners } = mockHanamask([
      [makeNote()],
      [makeNote(), makeNote({ id: "note-2", title: "追加されたノート", updatedAt: isoAgo(90) })],
    ]);

    renderHome();
    expect(await screen.findByText("設計メモ")).toBeTruthy();
    expect(listNotes).toHaveBeenCalledTimes(1);

    await act(async () => {
      noteListeners.forEach((listener) => listener());
    });

    expect(listNotes).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたノート")).toBeTruthy();
  });

  it("onTasksChangedの通知でタスクを再取得する", async () => {
    const { listTasks, taskListeners } = mockHanamask(
      [[]],
      [[makeTask()], [makeTask(), makeTask({ id: "task-2", title: "追加されたタスク" })]],
    );

    renderHome();
    expect(await screen.findByText("UI一新のモックアップ")).toBeTruthy();
    expect(listTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      taskListeners.forEach((listener) => listener());
    });

    expect(listTasks).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("追加されたタスク")).toBeTruthy();
  });

  it("直近に更新されたノートだけにエージェント更新の表示を出す", async () => {
    mockHanamask([
      [
        makeNote({ id: "note-1", title: "いま書き換えられたノート", updatedAt: isoAgo(0) }),
        makeNote({ id: "note-2", title: "前から在るノート", updatedAt: isoAgo(30) }),
      ],
    ]);

    renderHome();

    const marks = await screen.findAllByText(AGENT_MARK);
    expect(marks).toHaveLength(1);
    const markedItem = marks[0]?.closest("li");
    expect(markedItem).not.toBeNull();
    expect(within(markedItem as HTMLElement).getByText("いま書き換えられたノート")).toBeTruthy();
  });

  it("しきい値の直前に更新されたノートにはエージェント更新の表示を出す", async () => {
    mockHanamask([
      [
        makeNote({
          id: "note-1",
          title: "境界の内側",
          updatedAt: isoMsAgo(AGENT_UPDATE_WINDOW_MS - 1_000),
        }),
      ],
    ]);

    renderHome();

    expect(await screen.findByText("境界の内側")).toBeTruthy();
    expect(screen.getByText(AGENT_MARK)).toBeTruthy();
  });

  it("しきい値を超えて更新されたノートにはエージェント更新の表示を出さない", async () => {
    mockHanamask([
      [
        makeNote({
          id: "note-1",
          title: "境界の外側",
          updatedAt: isoMsAgo(AGENT_UPDATE_WINDOW_MS + 1_000),
        }),
      ],
    ]);

    renderHome();

    expect(await screen.findByText("境界の外側")).toBeTruthy();
    expect(screen.queryByText(AGENT_MARK)).toBeNull();
  });

  it("表示したまま時間が経つとエージェント更新の表示が消える", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockHanamask([
      [makeNote({ id: "note-1", title: "いま書き換えられたノート", updatedAt: isoMsAgo(0) })],
    ]);

    renderHome();
    expect(await screen.findByText(AGENT_MARK)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_UPDATE_WINDOW_MS * 2);
    });

    expect(screen.queryByText(AGENT_MARK)).toBeNull();
    expect(screen.getByText("いま書き換えられたノート")).toBeTruthy();
  });

  it("更新直後のノートが無いときはタイマーを動かさない", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    mockHanamask([[makeNote({ id: "note-1", title: "前から在るノート", updatedAt: isoAgo(30) })]]);

    renderHome();
    expect(await screen.findByText("前から在るノート")).toBeTruthy();

    expect(tickTimerCallIndexOf(setIntervalSpy)).toBe(-1);
  });

  it("ノートもタスクも無いとき空状態を表示する", async () => {
    mockHanamask([[]], [[]]);

    renderHome();

    expect(await screen.findByText("ノートはまだありません")).toBeTruthy();
    expect(screen.getByText("タスクはまだありません")).toBeTruthy();
  });

  it("ノートの取得に失敗したらエラーを表示する", async () => {
    const { listNotes } = mockHanamask([[]]);
    listNotes.mockRejectedValueOnce(new Error("boom"));

    renderHome();

    expect(await screen.findByText(/ノートの読み込みに失敗しました/)).toBeTruthy();
  });

  it("タスクの取得に失敗したらエラーを表示する", async () => {
    const { listTasks } = mockHanamask([[]], [[]]);
    listTasks.mockRejectedValueOnce(new Error("boom"));

    renderHome();

    expect(await screen.findByText(/タスクの読み込みに失敗しました/)).toBeTruthy();
  });

  it("更新直後のノートを表示したままアンマウントするとタイマーを解除する", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    mockHanamask([
      [makeNote({ id: "note-1", title: "いま書き換えられたノート", updatedAt: isoMsAgo(0) })],
    ]);

    const { unmount } = renderHome();
    expect(await screen.findByText(AGENT_MARK)).toBeTruthy();
    /*
     * 印が出た時点ではまだタイマーが張られていないことがある（effectは描画の後に走る）。
     * CIの遅い環境ではここが露わになり、待たずに読むと -1 を掴む。
     */
    await waitFor(() => {
      expect(tickTimerCallIndexOf(setIntervalSpy)).toBeGreaterThanOrEqual(0);
    });
    const tickCallIndex = tickTimerCallIndexOf(setIntervalSpy);
    const timerId: unknown = setIntervalSpy.mock.results[tickCallIndex]?.value;

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(timerId);
  });

  it("アンマウント時に購読を解除する", async () => {
    const { unsubscribeNotes, unsubscribeTasks } = mockHanamask([[makeNote()]]);

    const { unmount } = renderHome();
    expect(await screen.findByText("設計メモ")).toBeTruthy();

    unmount();

    expect(unsubscribeNotes).toHaveBeenCalledTimes(1);
    expect(unsubscribeTasks).toHaveBeenCalledTimes(1);
  });
});
