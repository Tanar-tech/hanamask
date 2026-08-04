/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TaskDetail } from "../../src/renderer/components/TaskDetail";
import type { Image, Task } from "../../src/shared/preload-api";

const stubImage: Image = {
  id: "image-1",
  noteId: "note-1",
  filePath: "/data/images/a.png",
  mimeType: "image/png",
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "MCPサーバーを実装する",
  status: "todo",
  dueDate: "2026-08-10",
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  ...overrides,
});

const mockHanamask = (getTask: (id: string) => Promise<Task | null>) => {
  const getTaskMock = vi.fn(getTask);
  const updateTaskStatus = vi.fn(async () => {});
  window.hanamask = {
    listNotes: vi.fn(async () => []),
    getNote: vi.fn(async () => null),
    deleteNote: vi.fn(async () => {}),
    onNotesChanged: vi.fn(() => () => {}),
    listTasks: vi.fn(async () => []),
    getTask: getTaskMock,
    updateTaskStatus,
    onTasksChanged: vi.fn(() => () => {}),
    attachImage: vi.fn(async () => stubImage),
    listImages: vi.fn(async () => []),
  };
  return { getTask: getTaskMock, updateTaskStatus };
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
