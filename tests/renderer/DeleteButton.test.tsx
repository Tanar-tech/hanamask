/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeleteButton } from "../../src/renderer/components/DeleteButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DeleteButton", () => {
  it("削除ボタンとして表示する", () => {
    render(<DeleteButton title="設計メモ" onConfirm={vi.fn()} />);

    expect(screen.getByRole("button", { name: "削除" })).toBeTruthy();
  });

  it("対象のタイトルを添えて確認する", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DeleteButton title="設計メモ" onConfirm={vi.fn()} />);

    screen.getByRole("button", { name: "削除" }).click();

    expect(confirmSpy).toHaveBeenCalledWith("「設計メモ」を削除しますか?");
  });

  it("確認でOKすると削除を実行する", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onConfirm = vi.fn();
    render(<DeleteButton title="設計メモ" onConfirm={onConfirm} />);

    screen.getByRole("button", { name: "削除" }).click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("確認をキャンセルすると削除を実行しない", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onConfirm = vi.fn();
    render(<DeleteButton title="設計メモ" onConfirm={onConfirm} />);

    screen.getByRole("button", { name: "削除" }).click();

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
