/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { JSX } from "react";
import { useUnread } from "../../src/renderer/hooks/useUnread";
import { useMarkViewed } from "../../src/renderer/hooks/useMarkViewed";
import type { EntityType, UnreadEntry } from "../../src/shared/preload-api";
import { stubHanamask } from "./hanamask-stub";

type Listener = () => void;

interface ChannelStub {
  subscribe: Mock<(callback: Listener) => () => void>;
  unsubscribe: Mock<() => void>;
  emit: () => void;
}

const makeChannel = (): ChannelStub => {
  const listeners: Listener[] = [];
  const unsubscribe = vi.fn<() => void>();
  const subscribe = vi.fn((callback: Listener) => {
    listeners.push(callback);
    return unsubscribe;
  });
  return {
    subscribe,
    unsubscribe,
    emit: () => listeners.forEach((listener) => listener()),
  };
};

const Probe = ({
  entityType,
  id,
}: {
  entityType: EntityType;
  id: string;
}): JSX.Element => {
  const { isUnread, markAllViewed } = useUnread();
  return (
    <div>
      <span data-testid="state">
        {isUnread(entityType, id) ? "unread" : "read"}
      </span>
      <button type="button" onClick={() => void markAllViewed()}>
        all
      </button>
    </div>
  );
};

const stateText = (): string => screen.getByTestId("state").textContent ?? "";

const setup = (listUnread: () => Promise<UnreadEntry[]>) => {
  const channels = {
    views: makeChannel(),
    notes: makeChannel(),
    notebooks: makeChannel(),
    tasks: makeChannel(),
  };
  const listUnreadMock = vi.fn(listUnread);
  const markAllViewed = vi.fn(async () => {});
  stubHanamask({
    listUnread: listUnreadMock,
    markAllViewed,
    markViewed: vi.fn(async () => {}),
    onViewsChanged: channels.views.subscribe,
    onNotesChanged: channels.notes.subscribe,
    onNotebooksChanged: channels.notebooks.subscribe,
    onTasksChanged: channels.tasks.subscribe,
  });
  return { channels, listUnreadMock, markAllViewed };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useUnread", () => {
  it("listUnread の結果で種類とidごとに未読を判定する", async () => {
    setup(async () => [{ entityType: "note", id: "n1" }]);

    const { rerender } = render(<Probe entityType="note" id="n1" />);
    await waitFor(() => expect(stateText()).toBe("unread"));

    rerender(<Probe entityType="task" id="n1" />);
    expect(stateText()).toBe("read");
  });

  it.each(["views", "notes", "notebooks", "tasks"] as const)(
    "%s の変更通知で取り直す",
    async (channel) => {
      const entries: UnreadEntry[][] = [[], [{ entityType: "task", id: "t1" }]];
      const { channels, listUnreadMock } = setup(
        async () => entries.shift() ?? [],
      );
      render(<Probe entityType="task" id="t1" />);
      await waitFor(() => expect(listUnreadMock).toHaveBeenCalledTimes(1));
      expect(stateText()).toBe("read");

      act(() => channels[channel].emit());

      await waitFor(() => expect(stateText()).toBe("unread"));
    },
  );

  it("後から届いた古い結果で新しい結果を上書きしない", async () => {
    const resolvers: ((entries: UnreadEntry[]) => void)[] = [];
    const { channels } = setup(
      () => new Promise<UnreadEntry[]>((resolve) => resolvers.push(resolve)),
    );
    render(<Probe entityType="note" id="n1" />);
    act(() => channels.views.emit());
    expect(resolvers).toHaveLength(2);

    await act(async () => resolvers[1]?.([]));
    await act(async () => resolvers[0]?.([{ entityType: "note", id: "n1" }]));

    expect(stateText()).toBe("read");
  });

  it("アンマウントで全ての購読を解除する", () => {
    const { channels } = setup(async () => []);
    const { unmount } = render(<Probe entityType="note" id="n1" />);

    unmount();

    Object.values(channels).forEach((channel) =>
      expect(channel.unsubscribe).toHaveBeenCalledTimes(1),
    );
  });

  it("markAllViewed を呼ぶと印が消える", async () => {
    const entries: UnreadEntry[][] = [[{ entityType: "note", id: "n1" }], []];
    const { markAllViewed } = setup(async () => entries.shift() ?? []);
    render(<Probe entityType="note" id="n1" />);
    await waitFor(() => expect(stateText()).toBe("unread"));

    fireEvent.click(screen.getByRole("button", { name: "all" }));

    await waitFor(() => expect(stateText()).toBe("read"));
    expect(markAllViewed).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗しても落ちず、既読として扱う", async () => {
    const { listUnreadMock } = setup(async () => {
      throw new Error("boom");
    });
    render(<Probe entityType="note" id="n1" />);

    await waitFor(() => expect(listUnreadMock).toHaveBeenCalled());
    expect(stateText()).toBe("read");
  });
});

const MarkProbe = ({ id }: { id: string }): null => {
  useMarkViewed("task", id);
  return null;
};

describe("useMarkViewed", () => {
  it("マウント時と id が変わったときに既読にする", async () => {
    const markViewed = vi.fn(async () => {});
    stubHanamask({ markViewed });
    const { rerender } = render(<MarkProbe id="t1" />);
    rerender(<MarkProbe id="t1" />);
    rerender(<MarkProbe id="t2" />);

    await waitFor(() => expect(markViewed).toHaveBeenCalledTimes(2));
    expect(markViewed.mock.calls).toEqual([
      ["task", "t1"],
      ["task", "t2"],
    ]);
  });
});
