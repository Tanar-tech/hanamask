import { describe, expect, it, vi } from "vitest";
import { isWebUrl, keepRemoteContentOutOfApp } from "../../src/main/window-guard";

type WindowOpenHandler = (details: { url: string }) => { action: "deny" };
type NavigateListener = (event: { url: string; preventDefault(): void }) => void;

const setUpGuard = () => {
  const handlers: { open?: WindowOpenHandler; navigate?: NavigateListener } = {};
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
  keepRemoteContentOutOfApp(
    {
      setWindowOpenHandler: (handler) => {
        handlers.open = handler;
      },
      on: (_event, listener) => {
        handlers.navigate = listener;
      },
    },
    openExternal,
  );
  return { handlers, openExternal };
};

describe("isWebUrl", () => {
  it.each(["https://example.com/a", "http://localhost:3000"])("%s はWebのURL", (url) => {
    expect(isWebUrl(url)).toBe(true);
  });

  it.each(["file:///C:/Windows/system32/calc.exe", "javascript:alert(1)", "ms-msdt:/id", "", "not a url"])(
    "%s はWebのURLではない",
    (url) => {
      expect(isWebUrl(url)).toBe(false);
    },
  );
});

describe("keepRemoteContentOutOfApp", () => {
  it("リンクから開く新しいウィンドウは作らず、WebのURLはシステムのブラウザで開く", () => {
    const { handlers, openExternal } = setUpGuard();
    expect(handlers.open?.({ url: "https://example.com/" })).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");
  });

  it("Web以外のURLは新しいウィンドウも外部起動もしない", () => {
    const { handlers, openExternal } = setUpGuard();
    expect(handlers.open?.({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("メインウィンドウが外部ページへ遷移するのを止め、システムのブラウザで開く", () => {
    const { handlers, openExternal } = setUpGuard();
    const preventDefault = vi.fn();
    handlers.navigate?.({ url: "https://example.com/", preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");
  });

  it("外部起動に失敗してもアプリを落とさない", async () => {
    const { handlers, openExternal } = setUpGuard();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    openExternal.mockRejectedValueOnce(new Error("no browser"));
    handlers.open?.({ url: "https://example.com/" });
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    consoleError.mockRestore();
  });
});
