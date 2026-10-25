/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommentPanel } from "../../src/renderer/components/CommentPanel";
import type {
  CommentAnchor,
  CommentStatus,
  CommentThread,
  HanamaskPreloadApi,
  NewCommentInput,
} from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

const BODY_TEXT = "前の文。ここを選ぶ。後の文。";
const ANCHOR: CommentAnchor = {
  quote: "ここを選ぶ",
  prefix: "前の文。",
  suffix: "。後の文。",
};

const makeThread = (overrides: Partial<CommentThread> = {}): CommentThread => ({
  id: "thread-1",
  entityType: "note",
  entityId: "note-1",
  anchor: ANCHOR,
  status: "open",
  createdAt: "2026-10-25T01:00:00.000Z",
  updatedAt: "2026-10-25T01:00:00.000Z",
  resolvedAt: null,
  messages: [
    {
      id: "m1",
      author: "user",
      body: "ここを直して",
      createdAt: "2026-10-25T01:00:00.000Z",
    },
  ],
  ...overrides,
});

type CommentApi = Pick<
  HanamaskPreloadApi,
  | "listComments"
  | "createComment"
  | "replyComment"
  | "setCommentStatus"
  | "deleteComment"
  | "onCommentsChanged"
>;

const mockComments = (threads: CommentThread[], overrides: Partial<CommentApi> = {}) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const api = {
    listComments: vi.fn(async () => threads),
    createComment: vi.fn(async (input: NewCommentInput) => makeThread({ anchor: input.anchor })),
    replyComment: vi.fn(async () => makeThread()),
    setCommentStatus: vi.fn(async (_id: string, status: CommentStatus) => makeThread({ status })),
    deleteComment: vi.fn(async () => true),
    onCommentsChanged: vi.fn((callback: () => void) => {
      listeners.push(callback);
      return unsubscribe;
    }),
    ...overrides,
  };
  stubHanamask(api);
  const emitChanged = async (): Promise<void> => {
    await act(async () => {
      listeners.forEach((listener) => {
        listener();
      });
    });
  };
  return { api, emitChanged, unsubscribe };
};

interface PanelProps {
  pendingAnchor?: CommentAnchor | null;
  onClearPending?: () => void;
  activeThreadId?: string | null;
  onSelectThread?: (thread: CommentThread) => void;
  bodyText?: string;
}

const renderPanel = (props: PanelProps = {}) =>
  render(
    <CommentPanel
      entityType="note"
      entityId="note-1"
      bodyText={props.bodyText ?? BODY_TEXT}
      pendingAnchor={props.pendingAnchor ?? null}
      onClearPending={props.onClearPending ?? vi.fn()}
      activeThreadId={props.activeThreadId ?? null}
      onSelectThread={props.onSelectThread ?? vi.fn()}
    />,
  );

afterEach(() => {
  cleanup();
});

describe("CommentPanel", () => {
  it("記録のコメントを読み込み、未解決の数を見出しに出す", async () => {
    const { api } = mockComments([makeThread(), makeThread({ id: "t2", status: "resolved" })]);
    renderPanel();
    expect(await screen.findByText("ここを直して")).toBeTruthy();
    expect(api.listComments).toHaveBeenCalledWith("note", "note-1");
    expect(screen.getByRole("heading", { name: "コメント" })).toBeTruthy();
    expect(screen.getByText("未解決 1")).toBeTruthy();
  });

  it("コメントが無ければその旨を出す", async () => {
    mockComments([]);
    renderPanel();
    expect(await screen.findByText("コメントはありません")).toBeTruthy();
    expect(screen.getByText("未解決 0")).toBeTruthy();
  });

  it("引用と、書き手（あなた・エージェント）を区別して出す", async () => {
    mockComments([
      makeThread({
        messages: [
          {
            id: "m1",
            author: "user",
            body: "質問",
            createdAt: "2026-10-25T01:00:00.000Z",
          },
          {
            id: "m2",
            author: "agent",
            body: "直しました",
            createdAt: "2026-10-25T02:00:00.000Z",
          },
        ],
      }),
    ]);
    renderPanel();
    expect(await screen.findByText("直しました")).toBeTruthy();
    expect(screen.getByText("ここを選ぶ")).toBeTruthy();
    expect(screen.getByText("あなた")).toBeTruthy();
    expect(screen.getByText("エージェント")).toBeTruthy();
  });

  it("コメント本文の HTML・Markdown は解釈せず文字のまま出す", async () => {
    const hostile = "<img src=x onerror=alert(1)> **太字** [link](javascript:alert(1))";
    mockComments([
      makeThread({
        anchor: { quote: "<b>引用</b>", prefix: "", suffix: "" },
        messages: [
          {
            id: "m1",
            author: "agent",
            body: hostile,
            createdAt: "2026-10-25T01:00:00.000Z",
          },
        ],
      }),
    ]);
    const view = renderPanel({ bodyText: "<b>引用</b>" });
    expect(await screen.findByText(hostile)).toBeTruthy();
    expect(screen.getByText("<b>引用</b>")).toBeTruthy();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("b")).toBeNull();
    expect(view.container.querySelector("strong")).toBeNull();
    expect(view.container.querySelector("a")).toBeNull();
  });

  it("引用が本文に見つからなければ「元の箇所が変わりました」と出す", async () => {
    mockComments([makeThread()]);
    renderPanel({ bodyText: "全部書き換えた本文" });
    expect(await screen.findByText("元の箇所が変わりました")).toBeTruthy();
  });

  it("引用が本文にあれば「元の箇所が変わりました」は出さない", async () => {
    mockComments([makeThread()]);
    renderPanel();
    await screen.findByText("ここを直して");
    expect(screen.queryByText("元の箇所が変わりました")).toBeNull();
  });

  it("引用を押すとスレッドを選んだことを知らせる", async () => {
    const thread = makeThread();
    mockComments([thread]);
    const onSelectThread = vi.fn();
    renderPanel({ onSelectThread });
    fireEvent.click(await screen.findByRole("button", { name: /ここを選ぶ/ }));
    expect(onSelectThread).toHaveBeenCalledWith(thread);
  });

  it("選択中のスレッドは印が付く", async () => {
    mockComments([makeThread()]);
    renderPanel({ activeThreadId: "thread-1" });
    const card = await screen.findByRole("article");
    expect(card.getAttribute("aria-current")).toBe("true");
  });

  it("未解決を上に、解決済みは畳んで「解決済み N件を表示」で開く", async () => {
    mockComments([
      makeThread({
        id: "done",
        status: "resolved",
        messages: [
          {
            id: "m9",
            author: "agent",
            body: "済んだ話",
            createdAt: "2026-10-25T01:00:00.000Z",
          },
        ],
      }),
      makeThread(),
    ]);
    renderPanel();
    await screen.findByText("ここを直して");
    expect(screen.queryByText("済んだ話")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "解決済み 1件を表示" }));
    const cards = screen.getAllByRole("article");
    expect(within(cards[0] ?? document.body).queryByText("ここを直して")).toBeTruthy();
    expect(within(cards[1] ?? document.body).queryByText("済んだ話")).toBeTruthy();
  });

  it("範囲を選んで来たら、引用付きの入力欄を出して作成し、選択を片付ける", async () => {
    const { api } = mockComments([]);
    const onClearPending = vi.fn();
    renderPanel({ pendingAnchor: ANCHOR, onClearPending });
    await screen.findByText("コメントはありません");
    expect(screen.getByText("ここを選ぶ")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "コメント本文" }), {
      target: { value: "  ここが分かりにくい  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "コメントする" }));
    await waitFor(() => {
      expect(api.createComment).toHaveBeenCalledWith({
        entityType: "note",
        entityId: "note-1",
        body: "ここが分かりにくい",
        anchor: ANCHOR,
      });
    });
    await waitFor(() => {
      expect(onClearPending).toHaveBeenCalled();
    });
    expect(api.listComments).toHaveBeenCalledTimes(2);
  });

  it("「記録へのコメントを書く」で範囲なしのコメントを書ける", async () => {
    const { api } = mockComments([]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "記録へのコメントを書く" }));
    fireEvent.change(screen.getByRole("textbox", { name: "コメント本文" }), {
      target: { value: "全体の感想" },
    });
    fireEvent.click(screen.getByRole("button", { name: "コメントする" }));
    await waitFor(() => {
      expect(api.createComment).toHaveBeenCalledWith({
        entityType: "note",
        entityId: "note-1",
        body: "全体の感想",
        anchor: null,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "コメント本文" })).toBeNull();
    });
  });

  it("空のコメントは送れない", async () => {
    const { api } = mockComments([]);
    renderPanel({ pendingAnchor: ANCHOR });
    const submit = await screen.findByRole("button", { name: "コメントする" });
    fireEvent.change(screen.getByRole("textbox", { name: "コメント本文" }), {
      target: { value: "   " },
    });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(submit);
    expect(api.createComment).not.toHaveBeenCalled();
  });

  it("「やめる」で入力欄を閉じ、選択を片付ける", async () => {
    const { api } = mockComments([]);
    const onClearPending = vi.fn();
    renderPanel({ pendingAnchor: ANCHOR, onClearPending });
    fireEvent.click(await screen.findByRole("button", { name: "やめる" }));
    expect(onClearPending).toHaveBeenCalled();
    expect(api.createComment).not.toHaveBeenCalled();
  });

  it("返信を送り、取り直す", async () => {
    const { api } = mockComments([makeThread()]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "返信" }));
    fireEvent.change(screen.getByRole("textbox", { name: "返信の本文" }), {
      target: { value: "補足です" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返信する" }));
    await waitFor(() => {
      expect(api.replyComment).toHaveBeenCalledWith("thread-1", "補足です");
    });
    await waitFor(() => {
      expect(api.listComments).toHaveBeenCalledTimes(2);
    });
  });

  it("「解決にする」で解決済みにし、解決済みは「再開する」で戻せる", async () => {
    const { api } = mockComments([
      makeThread(),
      makeThread({ id: "t2", status: "resolved", messages: [] }),
    ]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "解決にする" }));
    await waitFor(() => {
      expect(api.setCommentStatus).toHaveBeenCalledWith("thread-1", "resolved");
    });
    fireEvent.click(screen.getByRole("button", { name: "解決済み 1件を表示" }));
    fireEvent.click(screen.getByRole("button", { name: "再開する" }));
    await waitFor(() => {
      expect(api.setCommentStatus).toHaveBeenCalledWith("t2", "open");
    });
  });

  it("削除は画面内の確認を経てから行う", async () => {
    const { api } = mockComments([makeThread()]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    expect(api.deleteComment).not.toHaveBeenCalled();
    expect(screen.getByText("このスレッドを削除しますか？")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => {
      expect(api.deleteComment).toHaveBeenCalledWith("thread-1");
    });
  });

  it("削除の確認で「やめる」を押すと消さない", async () => {
    const { api } = mockComments([makeThread()]);
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(api.deleteComment).not.toHaveBeenCalled();
    expect(screen.queryByText("このスレッドを削除しますか？")).toBeNull();
  });

  it("変更の知らせで取り直し、アンマウントで購読を外す", async () => {
    const { api, emitChanged, unsubscribe } = mockComments([makeThread()]);
    const view = renderPanel();
    await screen.findByText("ここを直して");
    await emitChanged();
    expect(api.listComments).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("読み込みに失敗したら警告を出す", async () => {
    mockComments([], {
      listComments: vi.fn(async () => Promise.reject(new Error("boom"))),
    });
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
  });

  it("操作に失敗したら警告を出す", async () => {
    mockComments([makeThread()], {
      setCommentStatus: vi.fn(async () => Promise.reject(new Error("nope"))),
    });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "解決にする" }));
    expect((await screen.findByRole("alert")).textContent).toContain("nope");
  });

  it("対象を切り替えたら、古い取得結果で上書きしない", async () => {
    const resolvers: Array<(threads: CommentThread[]) => void> = [];
    mockComments([], {
      listComments: vi.fn(
        () =>
          new Promise<CommentThread[]>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    });
    const view = renderPanel();
    view.rerender(
      <CommentPanel
        entityType="task"
        entityId="task-1"
        bodyText=""
        pendingAnchor={null}
        onClearPending={vi.fn()}
        activeThreadId={null}
        onSelectThread={vi.fn()}
      />,
    );
    await act(async () => {
      resolvers[1]?.([makeThread({ id: "new", anchor: null, messages: [] })]);
      resolvers[0]?.([makeThread()]);
    });
    expect(screen.queryByText("ここを直して")).toBeNull();
  });
});
