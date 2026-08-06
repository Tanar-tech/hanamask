import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANGE_NOTIFICATION_WINDOW_MS,
  createChangeNotifier,
  type ChangeNotification,
} from "../../../src/main/notify/change-notifier";
import type { EntityChange } from "../../../src/main/mcp/change-emitter";

const noteChange = (overrides: Partial<EntityChange> = {}): EntityChange => ({
  entity: "note",
  action: "created",
  id: "note-1",
  title: "設計メモ",
  ...overrides,
});

const setup = (isFocused: boolean) => {
  const showNotification = vi.fn<(notification: ChangeNotification) => void>();
  const showWindow = vi.fn();
  const navigate = vi.fn();
  const focused = { value: isFocused };
  const notifier = createChangeNotifier({
    isWindowFocused: () => focused.value,
    showNotification,
    showWindow,
    navigate,
  });
  return { notifier, showNotification, showWindow, navigate, focused };
};

const lastNotification = (
  showNotification: ReturnType<typeof vi.fn>,
): ChangeNotification => {
  const call = showNotification.mock.calls.at(-1);
  if (call === undefined) throw new Error("通知が出ていない");
  return call[0] as ChangeNotification;
};

describe("change notifier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ウィンドウにフォーカスがある間の変更では通知しない", () => {
    const { notifier, showNotification } = setup(true);

    notifier.recordChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS * 2);

    expect(showNotification).not.toHaveBeenCalled();
  });

  it("フォーカスが無い間の変更では通知する", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(lastNotification(showNotification).title).toBe("ノートを作成しました");
    expect(lastNotification(showNotification).body).toBe("設計メモ");
  });

  it("集約時間が経つまでは通知しない", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange(noteChange());
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS - 1);

    expect(showNotification).not.toHaveBeenCalled();
  });

  it("集約時間内の連続した変更は1通にまとめる", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange(noteChange({ id: "note-1", title: "1つ目" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS / 2);
    notifier.recordChange(noteChange({ id: "note-2", title: "2つ目" }));
    notifier.recordChange(noteChange({ id: "note-3", title: "3つ目" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(lastNotification(showNotification).title).toBe("3件の変更");
    expect(lastNotification(showNotification).body).toBe("1つ目、2つ目、3つ目");
  });

  it("連続した変更が多いときは本文に載せるタイトルを打ち切る", () => {
    const { notifier, showNotification } = setup(false);

    ["a", "b", "c", "d", "e"].forEach((title, index) => {
      notifier.recordChange(noteChange({ id: `note-${index}`, title }));
    });
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(lastNotification(showNotification).title).toBe("5件の変更");
    expect(lastNotification(showNotification).body).toBe("a、b、c ほか2件");
  });

  it("同じノートへの連続更新は1件として数える", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange(noteChange({ action: "created", title: "初版" }));
    notifier.recordChange(noteChange({ action: "updated", title: "改訂" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(lastNotification(showNotification).title).toBe("ノートを更新しました");
    expect(lastNotification(showNotification).body).toBe("改訂");
  });

  it("集約時間を跨いだ変更は別の通知になる", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange(noteChange({ id: "note-1", title: "1つ目" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);
    notifier.recordChange(noteChange({ id: "note-2", title: "2つ目" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(lastNotification(showNotification).body).toBe("2つ目");
  });

  it("集約中に利用者が画面へ戻ったら通知しない", () => {
    const { notifier, showNotification, focused } = setup(false);

    notifier.recordChange(noteChange());
    focused.value = true;
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(showNotification).not.toHaveBeenCalled();
  });

  it("タスクの変更もエンティティ名を出し分けて通知する", () => {
    const { notifier, showNotification } = setup(false);

    notifier.recordChange({
      entity: "task",
      action: "deleted",
      id: "task-1",
      title: "見積もり",
    });
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);

    expect(lastNotification(showNotification).title).toBe("タスクを削除しました");
  });

  it("1件の通知をクリックすると該当ノートを開く", () => {
    const { notifier, showNotification, navigate, showWindow } = setup(false);

    notifier.recordChange(noteChange({ action: "updated", id: "note-9" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);
    lastNotification(showNotification).onClick();

    expect(navigate).toHaveBeenCalledWith({ kind: "note", id: "note-9" });
    expect(showWindow).not.toHaveBeenCalled();
  });

  it("1件の通知をクリックすると該当タスクを開く", () => {
    const { notifier, showNotification, navigate } = setup(false);

    notifier.recordChange({
      entity: "task",
      action: "created",
      id: "task-9",
      title: "見積もり",
    });
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);
    lastNotification(showNotification).onClick();

    expect(navigate).toHaveBeenCalledWith({ kind: "task", id: "task-9" });
  });

  it("削除の通知をクリックしたときは開けないのでウィンドウを前面に出すだけにする", () => {
    const { notifier, showNotification, navigate, showWindow } = setup(false);

    notifier.recordChange(noteChange({ action: "deleted" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);
    lastNotification(showNotification).onClick();

    expect(navigate).not.toHaveBeenCalled();
    expect(showWindow).toHaveBeenCalledTimes(1);
  });

  it("集約された通知をクリックしたときはウィンドウを前面に出すだけにする", () => {
    const { notifier, showNotification, navigate, showWindow } = setup(false);

    notifier.recordChange(noteChange({ id: "note-1" }));
    notifier.recordChange(noteChange({ id: "note-2" }));
    vi.advanceTimersByTime(CHANGE_NOTIFICATION_WINDOW_MS);
    lastNotification(showNotification).onClick();

    expect(navigate).not.toHaveBeenCalled();
    expect(showWindow).toHaveBeenCalledTimes(1);
  });
});
