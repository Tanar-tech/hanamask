import { useCallback, useEffect, useId, useState, type JSX } from "react";
import type { AppSettings } from "../../shared/preload-api";

const HEADING = "起動と常駐";
const OPEN_AT_LOGIN_LABEL = "パソコンの起動時に hanamask を開始する";
const OPEN_AT_LOGIN_DESCRIPTION =
  "ログインしたときに、ウィンドウを出さず通知領域だけに入った状態で立ち上がります。AIエージェントからはいつでも使えます。";
const QUIT_ON_CLOSE_LABEL = "ウィンドウを閉じたら終了する";
const QUIT_ON_CLOSE_DESCRIPTION =
  "オフのあいだは、ウィンドウを閉じても通知領域に残ります。終了するには通知領域のメニューから「終了」を選びます。";

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const CHECKBOX = `${FOCUS_RING} m-0 h-4 w-4 shrink-0 cursor-pointer accent-ink-aqua disabled:cursor-not-allowed`;

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

const SwitchRow = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}: SwitchRowProps): JSX.Element => {
  const fieldId = useId();
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <label htmlFor={fieldId} className="flex items-center gap-2 text-sm text-text">
        <input
          id={fieldId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          className={CHECKBOX}
        />
        {label}
      </label>
      <p className="m-0 text-xs text-text-faint">{description}</p>
    </div>
  );
};

export const StartupSettings = (): JSX.Element => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await window.hanamask.readAppSettings());
      setError(null);
    } catch (cause) {
      setError(`設定の読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // main側が受け付けた設定だけを画面に反映する（先に画面を動かすと、断られたときに実際とずれる）。
  const save = async (next: AppSettings): Promise<void> => {
    setSaving(true);
    try {
      setSettings(await window.hanamask.saveAppSettings(next));
      setError(null);
    } catch (cause) {
      setError(`設定の保存に失敗しました: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

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
              void save({ ...settings, openAtLogin });
            }}
          />
          <SwitchRow
            label={QUIT_ON_CLOSE_LABEL}
            description={QUIT_ON_CLOSE_DESCRIPTION}
            checked={!settings.closeToTray}
            disabled={saving}
            onChange={(quitOnClose) => {
              void save({ ...settings, closeToTray: !quitOnClose });
            }}
          />
        </>
      )}
    </section>
  );
};
