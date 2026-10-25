import type { JSX } from "react";
import { useAppSettings } from "../hooks/useAppSettings";
import { SwitchRow } from "./SettingSwitchRow";

const HEADING = "起動と常駐";
const OPEN_AT_LOGIN_LABEL = "パソコンの起動時に hanamask を開始する";
const OPEN_AT_LOGIN_DESCRIPTION =
  "ログインしたときに、ウィンドウを出さず通知領域だけに入った状態で立ち上がります。AIエージェントからはいつでも使えます。";
const QUIT_ON_CLOSE_LABEL = "ウィンドウを閉じたら終了する";
const QUIT_ON_CLOSE_DESCRIPTION =
  "オフのあいだは、ウィンドウを閉じても通知領域に残ります。終了するには通知領域のメニューから「終了」を選びます。";

export const StartupSettings = (): JSX.Element => {
  const { settings, error, saving, save } = useAppSettings();

  return (
    <section className="flex flex-col gap-5 p-6 font-body text-text">
      <h2 className="m-0 font-display text-xl leading-tight font-bold tracking-tight">{HEADING}</h2>

      {error !== null && (
        <p
          role="alert"
          className="m-0 max-w-xl rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}

      {settings !== null && (
        <>
          <SwitchRow
            label={OPEN_AT_LOGIN_LABEL}
            description={OPEN_AT_LOGIN_DESCRIPTION}
            checked={settings.openAtLogin}
            disabled={saving}
            onChange={(openAtLogin) => {
              void save({ openAtLogin });
            }}
          />
          <SwitchRow
            label={QUIT_ON_CLOSE_LABEL}
            description={QUIT_ON_CLOSE_DESCRIPTION}
            checked={!settings.closeToTray}
            disabled={saving}
            onChange={(quitOnClose) => {
              void save({ closeToTray: !quitOnClose });
            }}
          />
        </>
      )}
    </section>
  );
};
