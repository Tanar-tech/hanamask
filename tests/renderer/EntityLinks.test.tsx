/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EntityLinks } from "../../src/renderer/components/EntityLinks";
import type { EntityType, Link } from "../../src/shared/preload-api";

const makeLink = (overrides: Partial<Link> = {}): Link => ({
  id: "link-1",
  fromType: "note",
  fromId: "note-1",
  toType: "task",
  toId: "task-9",
  ...overrides,
});

interface LinkApiOverrides {
  listLinks?: (entityType: EntityType, entityId: string) => Promise<Link[]>;
  createLink?: (input: {
    fromType: EntityType;
    fromId: string;
    toType: EntityType;
    toId: string;
  }) => Promise<Link>;
  deleteLink?: (id: string) => Promise<boolean>;
}

const mockHanamask = (overrides: LinkApiOverrides = {}) => {
  const listLinks = vi.fn(overrides.listLinks ?? (async () => []));
  const createLink = vi.fn(overrides.createLink ?? (async () => makeLink()));
  const deleteLink = vi.fn(overrides.deleteLink ?? (async () => true));
  const unsubscribeLinksChanged = vi.fn();
  const linksChangedListeners: Array<() => void> = [];
  const onLinksChanged = vi.fn((callback: () => void) => {
    linksChangedListeners.push(callback);
    return unsubscribeLinksChanged;
  });
  const emitLinksChanged = async (): Promise<void> => {
    await act(async () => {
      linksChangedListeners.forEach((listener) => {
        listener();
      });
    });
  };
  window.hanamask = {
    listDeletedNotes: vi.fn(async () => []),
    restoreNote: vi.fn(async () => null),
    listNotes: vi.fn(async () => []),
    searchNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    updateNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    onNavigate: vi.fn(() => () => {}),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    updateTaskStatus: vi.fn(async () => {}),
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(),
    listImages: vi.fn(async () => []),
    listLinks,
    createLink,
    deleteLink,
    onLinksChanged,
  };
  return {
    listLinks,
    createLink,
    deleteLink,
    onLinksChanged,
    unsubscribeLinksChanged,
    emitLinksChanged,
  };
};

const stubConfirm = (result: boolean): ReturnType<typeof vi.fn> => {
  const confirmMock = vi.fn(() => result);
  vi.stubGlobal("confirm", confirmMock);
  return confirmMock;
};

const clickUnlink = async (index = 0): Promise<void> => {
  const buttons = screen.getAllByRole("button", { name: "解除" });
  const button = buttons[index];
  if (button === undefined) throw new Error(`no unlink button at index ${index}`);
  await act(async () => {
    button.click();
  });
};

const fillAndSubmitForm = async (targetType: EntityType, targetId: string): Promise<void> => {
  const typeSelect = screen.getByRole("combobox", { name: "リンク先の種別" });
  const idInput = screen.getByRole("textbox", { name: "リンク先のID" });
  await act(async () => {
    fireEvent.change(typeSelect, { target: { value: targetType } });
    fireEvent.change(idInput, { target: { value: targetId } });
  });
  await act(async () => {
    screen.getByRole("button", { name: "リンクする" }).click();
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("EntityLinks", () => {
  it("マウント時にリンク一覧を取得する", async () => {
    const { listLinks } = mockHanamask({ listLinks: async () => [] });

    render(<EntityLinks entityType="note" entityId="note-1" />);

    await waitFor(() => {
      expect(listLinks).toHaveBeenCalledWith("note", "note-1");
    });
  });

  it("自分がfrom側のリンクでは相手側(to)の種別とIDを表示する", async () => {
    mockHanamask({
      listLinks: async () => [makeLink({ toType: "task", toId: "task-9" })],
    });

    render(<EntityLinks entityType="note" entityId="note-1" />);

    expect(await screen.findByText("タスク: task-9")).toBeTruthy();
    expect(screen.queryByText(/note-1/)).toBeNull();
  });

  it("自分がto側のリンクでは相手側(from)の種別とIDを表示する", async () => {
    mockHanamask({
      listLinks: async () => [
        makeLink({
          id: "link-2",
          fromType: "note",
          fromId: "note-7",
          toType: "task",
          toId: "task-1",
        }),
      ],
    });

    render(<EntityLinks entityType="task" entityId="task-1" />);

    expect(await screen.findByText("ノート: note-7")).toBeTruthy();
    expect(screen.queryByText(/task-1/)).toBeNull();
  });

  it("一覧に何の一覧かが分かるラベルを付ける", async () => {
    mockHanamask({ listLinks: async () => [makeLink()] });

    render(<EntityLinks entityType="note" entityId="note-1" />);

    expect(await screen.findByRole("list", { name: "リンク一覧" })).toBeTruthy();
  });

  it("リンクが0件のときは空状態メッセージを表示する", async () => {
    mockHanamask({ listLinks: async () => [] });

    render(<EntityLinks entityType="note" entityId="note-1" />);

    expect(await screen.findByText("リンクはありません")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "解除" })).toHaveLength(0);
  });

  it("リンクの取得に失敗したらエラーメッセージを表示する", async () => {
    mockHanamask({
      listLinks: async () => {
        throw new Error("list boom");
      },
    });

    render(<EntityLinks entityType="note" entityId="note-1" />);

    expect((await screen.findByRole("alert")).textContent).toContain("list boom");
  });

  it("フォームから自分を起点にしたリンクを作成する", async () => {
    const { createLink } = mockHanamask({ listLinks: async () => [] });

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("リンクはありません");
    await fillAndSubmitForm("task", "task-9");

    expect(createLink).toHaveBeenCalledWith({
      fromType: "note",
      fromId: "note-1",
      toType: "task",
      toId: "task-9",
    });
  });

  it("タスク詳細からのリンク作成も自分を起点にする", async () => {
    const { createLink } = mockHanamask({ listLinks: async () => [] });

    render(<EntityLinks entityType="task" entityId="task-1" />);
    await screen.findByText("リンクはありません");
    await fillAndSubmitForm("note", "note-5");

    expect(createLink).toHaveBeenCalledWith({
      fromType: "task",
      fromId: "task-1",
      toType: "note",
      toId: "note-5",
    });
  });

  it("リンク作成に成功したら一覧を取得し直す", async () => {
    let links: Link[] = [];
    const { listLinks } = mockHanamask({
      listLinks: async () => links,
      createLink: async () => {
        const created = makeLink({ id: "link-3", toId: "task-9" });
        links = [created];
        return created;
      },
    });

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("リンクはありません");
    await fillAndSubmitForm("task", "task-9");

    expect(await screen.findByText("タスク: task-9")).toBeTruthy();
    await waitFor(() => {
      expect(listLinks).toHaveBeenCalledTimes(2);
    });
  });

  it("リンク先IDが空のときは作成しない", async () => {
    const { createLink } = mockHanamask({ listLinks: async () => [] });

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("リンクはありません");
    await fillAndSubmitForm("task", "   ");

    expect(createLink).not.toHaveBeenCalled();
  });

  it("リンク作成に失敗したらエラーメッセージを表示する", async () => {
    mockHanamask({
      listLinks: async () => [],
      createLink: async () => {
        throw new Error("create boom");
      },
    });

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("リンクはありません");
    await fillAndSubmitForm("task", "task-9");

    expect((await screen.findByRole("alert")).textContent).toContain("create boom");
  });

  it("解除ボタンで確認しOKならdeleteLinkを呼び一覧を取得し直す", async () => {
    let links: Link[] = [makeLink()];
    const { deleteLink, listLinks } = mockHanamask({
      listLinks: async () => links,
      deleteLink: async () => {
        links = [];
        return true;
      },
    });
    const confirmMock = stubConfirm(true);

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("タスク: task-9");
    await clickUnlink();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(deleteLink).toHaveBeenCalledWith("link-1");
    expect(await screen.findByText("リンクはありません")).toBeTruthy();
    await waitFor(() => {
      expect(listLinks).toHaveBeenCalledTimes(2);
    });
  });

  it("確認をキャンセルしたら解除しない", async () => {
    const { deleteLink } = mockHanamask({ listLinks: async () => [makeLink()] });
    stubConfirm(false);

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("タスク: task-9");
    await clickUnlink();

    expect(deleteLink).not.toHaveBeenCalled();
  });

  it("リンク解除に失敗したらエラーメッセージを表示する", async () => {
    mockHanamask({
      listLinks: async () => [makeLink()],
      deleteLink: async () => {
        throw new Error("delete boom");
      },
    });
    stubConfirm(true);

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("タスク: task-9");
    await clickUnlink();

    expect((await screen.findByRole("alert")).textContent).toContain("delete boom");
  });

  it("対象のリンクが既に無い場合はエラーメッセージを表示する", async () => {
    mockHanamask({
      listLinks: async () => [makeLink()],
      deleteLink: async () => false,
    });
    stubConfirm(true);

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("タスク: task-9");
    await clickUnlink();

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("entityIdが変わったらリンクを取得し直す", async () => {
    const { listLinks } = mockHanamask({
      listLinks: async (_entityType: EntityType, entityId: string) => [
        makeLink({ fromId: entityId, toId: entityId === "note-2" ? "task-22" : "task-9" }),
      ],
    });

    const { rerender } = render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("タスク: task-9");

    rerender(<EntityLinks entityType="note" entityId="note-2" />);

    expect(await screen.findByText("タスク: task-22")).toBeTruthy();
    expect(listLinks).toHaveBeenLastCalledWith("note", "note-2");
  });

  it("entityId切替時に古い取得結果が後から表示を上書きしない", async () => {
    let resolveSlow: ((links: Link[]) => void) | undefined;
    const { listLinks } = mockHanamask({
      listLinks: async (_entityType: EntityType, entityId: string) => {
        if (entityId === "note-1") {
          return new Promise<Link[]>((resolve) => {
            resolveSlow = resolve;
          });
        }
        return [makeLink({ id: "link-2", fromId: entityId, toId: "task-22" })];
      },
    });

    const { rerender } = render(<EntityLinks entityType="note" entityId="note-1" />);
    rerender(<EntityLinks entityType="note" entityId="note-2" />);
    await screen.findByText("タスク: task-22");

    await act(async () => {
      resolveSlow?.([makeLink({ toId: "task-9" })]);
    });

    expect(screen.queryByText("タスク: task-9")).toBeNull();
    expect(screen.getByText("タスク: task-22")).toBeTruthy();
    expect(listLinks).toHaveBeenCalledTimes(2);
  });

  it("リンクの変更通知を受け取ると一覧を取り直す", async () => {
    let currentLinks: Link[] = [];
    const { listLinks, emitLinksChanged } = mockHanamask({
      listLinks: async () => currentLinks,
    });

    render(<EntityLinks entityType="note" entityId="note-1" />);
    await screen.findByText("リンクはありません");

    currentLinks = [makeLink({ toId: "task-9" })];
    await emitLinksChanged();

    expect(await screen.findByText("タスク: task-9")).toBeTruthy();
    expect(listLinks).toHaveBeenCalledTimes(2);
  });

  it("アンマウント時にリンクの変更通知の購読を解除する", async () => {
    const { onLinksChanged, unsubscribeLinksChanged } = mockHanamask({ listLinks: async () => [] });

    const { unmount } = render(<EntityLinks entityType="note" entityId="note-1" />);
    await waitFor(() => {
      expect(onLinksChanged).toHaveBeenCalled();
    });

    unmount();

    expect(unsubscribeLinksChanged).toHaveBeenCalledTimes(1);
  });
});
