import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../shared/preload-api";

interface AppSettingsHandle {
  settings: AppSettings | null;
  error: string | null;
  saving: boolean;
  save: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useAppSettings = (): AppSettingsHandle => {
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

  // 設定画面の欄ごとにこのフックを持つため、手元の写しに重ねると別の欄で変えた項目を巻き戻してしまう。
  // 保存の直前に読み直して、変えた項目だけを重ねる。画面にはmain側が受け付けた設定だけを反映する。
  const save = async (patch: Partial<AppSettings>): Promise<void> => {
    setSaving(true);
    try {
      const latest = await window.hanamask.readAppSettings();
      setSettings(await window.hanamask.saveAppSettings({ ...latest, ...patch }));
      setError(null);
    } catch (cause) {
      setError(`設定の保存に失敗しました: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return { settings, error, saving, save };
};
