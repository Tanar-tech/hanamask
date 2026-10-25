const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

interface GuardedWebContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  on(
    event: "will-navigate",
    listener: (event: { url: string; preventDefault(): void }) => void,
  ): unknown;
}

type OpenExternal = (url: string) => Promise<void>;

export const isWebUrl = (url: string): boolean => {
  try {
    return WEB_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
};

const openInSystemBrowser = (url: string, openExternal: OpenExternal): void => {
  if (!isWebUrl(url)) return;
  openExternal(url).catch((error: unknown) => {
    console.error(`Failed to open ${url} in the system browser: ${String(error)}`);
  });
};

// 新しいウィンドウは親のpreloadを引き継ぐため、外部ページをアプリ内で開くとそのページに
// IPCブリッジを渡してしまう。また外部サーバーの応答をアプリ同梱のChromiumで展開させない
// （Brotliデコーダーの欠陥 CVE-2026-111497 など、同梱ランタイムの更新を待たずに塞ぐ）。
export const keepRemoteContentOutOfApp = (
  contents: GuardedWebContents,
  openExternal: OpenExternal,
): void => {
  contents.setWindowOpenHandler(({ url }) => {
    openInSystemBrowser(url, openExternal);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event) => {
    event.preventDefault();
    openInSystemBrowser(event.url, openExternal);
  });
};
