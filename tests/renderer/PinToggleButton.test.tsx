/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PinToggleButton, isPinned } from "../../src/renderer/components/PinToggleButton";

const CLASS_NAME = "test-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PinToggleButton", () => {
  it("未ピンなら「ピン留め」を出し、押すと通知する", () => {
    const onToggle = vi.fn();
    render(<PinToggleButton pinned={false} onToggle={onToggle} className={CLASS_NAME} />);

    fireEvent.click(screen.getByRole("button", { name: "ピン留め" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ピン中なら「ピン留め解除」を出す", () => {
    render(<PinToggleButton pinned onToggle={vi.fn()} className={CLASS_NAME} />);

    expect(screen.getByRole("button", { name: "ピン留め解除" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ピン留め" })).toBeNull();
  });

  it("disabled のときは押しても通知しない", () => {
    const onToggle = vi.fn();
    render(<PinToggleButton pinned={false} onToggle={onToggle} className={CLASS_NAME} disabled />);

    fireEvent.click(screen.getByRole("button", { name: "ピン留め" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("isPinned", () => {
  it("pinnedAt が日時なら真、null・未設定なら偽", () => {
    expect(isPinned({ pinnedAt: "2026-08-21T00:00:00.000Z" })).toBe(true);
    expect(isPinned({ pinnedAt: null })).toBe(false);
    expect(isPinned({})).toBe(false);
  });
});
