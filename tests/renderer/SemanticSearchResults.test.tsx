/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toUpdatedLabel } from "../../src/renderer/text/dateLabel";
import { SemanticSearchResults } from "../../src/renderer/components/SemanticSearchResults";
import type {
  EmbeddingStatus,
  ScoredNote,
  ScoredNotebook,
  ScoredTask,
  SemanticSearchResult,
} from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const NOTE_TITLE = "ポート固定をやめる";
const TASK_TITLE = "MCP接続手順を README に足す";
const NOTEBOOK_TITLE = "MCPの調べもの";

const makeNote = (overrides: Partial<ScoredNote> = {}): ScoredNote => ({
  id: "note-1",
  title: NOTE_TITLE,
  body: "固定ポートの見直し",
  tags: [],
  score: 0.8,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const makeTask = (overrides: Partial<ScoredTask> = {}): ScoredTask => ({
  id: "task-1",
  title: TASK_TITLE,
  body: "",
  tags: [],
  status: "todo",
  dueDate: null,
  score: 0.6,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const makeNotebook = (overrides: Partial<ScoredNotebook> = {}): ScoredNotebook => ({
  id: "notebook-1",
  title: NOTEBOOK_TITLE,
  summary: "接続まわりの概要",
  tags: [],
  score: 0.7,
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const READY: EmbeddingStatus = { state: "ready", pending: 0 };
const LOADING: EmbeddingStatus = { state: "loading", pending: 2 };
const UNAVAILABLE: EmbeddingStatus = {
  state: "unavailable",
  pending: 0,
  reason: "モデルなし",
};

const FOUND: SemanticSearchResult = {
  notes: [makeNote()],
  tasks: [makeTask()],
  notebooks: [makeNotebook()],
};

interface Stubs {
  readStatus: () => EmbeddingStatus;
  readResult?: () => SemanticSearchResult;
}

const mockEmbeddingApi = ({ readStatus, readResult }: Stubs) => {
  const readEmbeddingStatus = vi.fn(async () => readStatus());
  const semanticSearch = vi.fn(async () =>
    readResult === undefined ? { notes: [], tasks: [], notebooks: [] } : readResult(),
  );
  const listeners: Array<(status: EmbeddingStatus) => void> = [];
  stubHanamask({
    readEmbeddingStatus,
    semanticSearch,
    onEmbeddingStatusChanged: vi.fn((callback: (status: EmbeddingStatus) => void) => {
      listeners.push(callback);
      return vi.fn();
    }),
  });
  const emitStatusChanged = async (status: EmbeddingStatus): Promise<void> => {
    await act(async () => {
      listeners.forEach((listener) => {
        listener(status);
      });
    });
  };
  return { readEmbeddingStatus, semanticSearch, emitStatusChanged };
};

const noop = (): void => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SemanticSearchResults", () => {
  it("準備できているとき種別付きで一覧し、クリックで選択を通知する", async () => {
    const { semanticSearch } = mockEmbeddingApi({
      readStatus: () => READY,
      readResult: () => FOUND,
    });
    const onSelectNote = vi.fn();
    const onSelectTask = vi.fn();

    render(
      <SemanticSearchResults
        query="MCPの接続"
        onSelectNote={onSelectNote}
        onSelectTask={onSelectTask}
      />,
    );

    const list = await screen.findByRole("list", { name: "意味が近い記録" });
    expect(semanticSearch).toHaveBeenCalledWith("MCPの接続", 10);
    const [noteRow, notebookRow, taskRow] = within(list).getAllByRole("listitem");
    expect(noteRow?.textContent).toContain("ノート");
    expect(notebookRow?.textContent).toContain("ノート（束）");
    expect(taskRow?.textContent).toContain("タスク");

    fireEvent.click(screen.getByRole("button", { name: NOTE_TITLE }));
    expect(onSelectNote).toHaveBeenCalledWith("note-1");
    fireEvent.click(screen.getByRole("button", { name: TASK_TITLE }));
    expect(onSelectTask).toHaveBeenCalledWith("task-1");
  });

  it("ノート・ノート（束）・タスクをまたいでスコアの降順に並べ、種別と更新日を添える", async () => {
    mockEmbeddingApi({
      readStatus: () => READY,
      readResult: () => ({
        notes: [makeNote({ score: 0.2 })],
        tasks: [makeTask({ score: 0.5 })],
        notebooks: [makeNotebook({ score: 0.9 })],
      }),
    });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} onSelectTask={noop} />);

    const list = await screen.findByRole("list", { name: "意味が近い記録" });
    const updated = toUpdatedLabel("2026-08-03T00:00:00.000Z");
    expect(within(list).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      `${NOTEBOOK_TITLE}${updated}ノート（束）`,
      `${TASK_TITLE}${updated}タスク`,
      `${NOTE_TITLE}${updated}ノート`,
    ]);
  });

  it("ノート（束）の選択先が無いときはボタンにしない", async () => {
    mockEmbeddingApi({ readStatus: () => READY, readResult: () => FOUND });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    await screen.findByRole("list", { name: "意味が近い記録" });
    expect(screen.queryByRole("button", { name: NOTEBOOK_TITLE })).toBeNull();
    expect(screen.getByText(NOTEBOOK_TITLE)).toBeTruthy();
  });

  it("ノート（束）の選択先があればクリックで通知する", async () => {
    mockEmbeddingApi({ readStatus: () => READY, readResult: () => FOUND });
    const onSelectNotebook = vi.fn();

    render(
      <SemanticSearchResults
        query="MCPの接続"
        onSelectNote={noop}
        onSelectNotebook={onSelectNotebook}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: NOTEBOOK_TITLE }));
    expect(onSelectNotebook).toHaveBeenCalledWith("notebook-1");
  });

  // 種別ごとにまとめず、スコアの降順で1本に並べる（近い順に読めることを優先する）。
  it("ノートとタスクをまたいでスコアの降順に並べる", async () => {
    mockEmbeddingApi({
      readStatus: () => READY,
      readResult: () => ({
        notes: [makeNote({ score: 0.4 }), makeNote({ id: "note-2", title: "遠いノート", score: 0.1 })],
        tasks: [makeTask({ score: 0.9 })],
        notebooks: [],
      }),
    });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} onSelectTask={noop} />);

    const list = await screen.findByRole("list", { name: "意味が近い記録" });
    const rows = within(list).getAllByRole("listitem");
    const updated = toUpdatedLabel("2026-08-03T00:00:00.000Z");
    expect(rows.map((row) => row.textContent)).toEqual([
      `${TASK_TITLE}${updated}タスク`,
      `${NOTE_TITLE}${updated}ノート`,
      `遠いノート${updated}ノート`,
    ]);
  });

  it("各行に更新日が併記される", async () => {
    mockEmbeddingApi({ readStatus: () => READY, readResult: () => FOUND });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    const list = await screen.findByRole("list", { name: "意味が近い記録" });
    expect(within(list).getAllByText(toUpdatedLabel("2026-08-03T00:00:00.000Z")).length).toBeGreaterThan(0);
  });

  it("タスクの選択先が無いときタスクはボタンにしない", async () => {
    mockEmbeddingApi({ readStatus: () => READY, readResult: () => FOUND });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    await screen.findByRole("list", { name: "意味が近い記録" });
    expect(screen.queryByRole("button", { name: TASK_TITLE })).toBeNull();
    expect(screen.getByText(TASK_TITLE)).toBeTruthy();
  });

  it("準備中のときは「準備中です」と出す", async () => {
    mockEmbeddingApi({ readStatus: () => LOADING, readResult: () => FOUND });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    expect(await screen.findByText("準備中です")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("使えないときは欄そのものを出さない", async () => {
    const { readEmbeddingStatus } = mockEmbeddingApi({
      readStatus: () => UNAVAILABLE,
      readResult: () => FOUND,
    });

    const { container } = render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    await waitFor(() => {
      expect(readEmbeddingStatus).toHaveBeenCalled();
    });
    await act(async () => {});
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("結果に unavailable が入っていれば欄を出さない", async () => {
    const { readEmbeddingStatus } = mockEmbeddingApi({
      readStatus: () => READY,
      readResult: () => ({ notes: [], tasks: [], notebooks: [], unavailable: "モデルなし" }),
    });

    const { container } = render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);

    await waitFor(() => {
      expect(readEmbeddingStatus).toHaveBeenCalled();
    });
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("状態が変わったら読み直して結果に切り替える", async () => {
    let status = LOADING;
    const { emitStatusChanged, semanticSearch } = mockEmbeddingApi({
      readStatus: () => status,
      readResult: () => (status === READY ? FOUND : { notes: [], tasks: [], notebooks: [] }),
    });

    render(<SemanticSearchResults query="MCPの接続" onSelectNote={noop} />);
    expect(await screen.findByText("準備中です")).toBeTruthy();
    expect(semanticSearch).toHaveBeenCalledTimes(1);

    status = READY;
    await emitStatusChanged(READY);

    expect(await screen.findByRole("button", { name: NOTE_TITLE })).toBeTruthy();
    expect(screen.queryByText("準備中です")).toBeNull();
    expect(semanticSearch).toHaveBeenCalledTimes(2);
  });
});
