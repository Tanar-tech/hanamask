import type { JSX } from "react";
import type { UpdateState } from "../../shared/preload-api";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { SwitchRow } from "./SettingSwitchRow";

const HEADING = "更新";
const CURRENT_VERSION_LABEL = "現在のバージョン";
const AUTO_UPDATE_LABEL = "更新を自動で確認する";
const AUTO_UPDATE_DESCRIPTION =
  "起動したときと6時間ごとに新しい版を確かめ、あれば裏でダウンロードします。外すと「今すぐ確認」を押したときだけ確かめます。";
const CHECK_NOW_LABEL = "今すぐ確認";
export const INSTALL_LABEL = "再起動して更新";
const UNSUPPORTED_MESSAGE = "開発版のため自動更新は動きません";
const NEVER_CHECKED_MESSAGE = "まだ確認していません";
const DATE_LOCALE = "ja-JP";

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint`;
export const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10`;

const formatLastChecked = (lastCheckedAt: string | null): string =>
  lastCheckedAt === null
    ? NEVER_CHECKED_MESSAGE
    : `最新です（最終確認: ${new Date(lastCheckedAt).toLocaleString(DATE_LOCALE)}）`;

const describeState = (state: UpdateState): string => {
  switch (state.kind) {
    case "unsupported":
      return UNSUPPORTED_MESSAGE;
    case "idle":
      return formatLastChecked(state.lastCheckedAt);
    case "checking":
      return "確認中…";
    case "downloading":
      return `v${state.version} をダウンロード中 ${String(Math.round(state.percent))}%`;
    case "downloaded":
      return `v${state.version} の準備ができました`;
    case "error":
      return state.message;
  }
};

const StatusLine = ({ state }: { state: UpdateState }): JSX.Element => (
  <div className="flex max-w-xl flex-wrap items-center gap-3">
    <p
      role="status"
      className={`m-0 text-sm ${state.kind === "error" ? "text-crit" : "text-text-soft"}`}
    >
      {describeState(state)}
    </p>
    {state.kind === "downloaded" && (
      <button
        type="button"
        onClick={() => {
          void window.hanamask.installUpdate();
        }}
        className={BUTTON_PRIMARY}
      >
        {INSTALL_LABEL}
      </button>
    )}
  </div>
);

export const UpdateSettings = (): JSX.Element => {
  const { settings, error, saving, save } = useAppSettings();
  const [status, setStatus] = useUpdateStatus();
  const unsupported = status?.state.kind === "unsupported";

  const checkNow = async (): Promise<void> => {
    try {
      setStatus(await window.hanamask.checkForUpdates());
    } catch {
      // 確認の失敗は main 側が error 状態として通知してくるので、ここでは何もしない。
    }
  };

  return (
    <section className="flex flex-col gap-5 p-6 font-body text-text">
      <h2 className="m-0 font-display text-xl leading-tight font-bold tracking-tight">
        {HEADING}
      </h2>

      {error !== null && (
        <p
          role="alert"
          className="m-0 max-w-xl rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}

      {status !== null && (
        <p className="m-0 text-sm text-text">
          {CURRENT_VERSION_LABEL}: v{status.currentVersion}
        </p>
      )}

      {settings !== null && (
        <SwitchRow
          label={AUTO_UPDATE_LABEL}
          description={AUTO_UPDATE_DESCRIPTION}
          checked={settings.autoUpdate}
          disabled={saving || unsupported}
          onChange={(autoUpdate) => {
            void save({ autoUpdate });
          }}
        />
      )}

      <div>
        <button
          type="button"
          disabled={status === null || unsupported}
          onClick={() => {
            void checkNow();
          }}
          className={BUTTON_PRIMARY}
        >
          {CHECK_NOW_LABEL}
        </button>
      </div>

      {status !== null && <StatusLine state={status.state} />}
    </section>
  );
};
