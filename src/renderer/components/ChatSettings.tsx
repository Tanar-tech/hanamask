import { useCallback, useEffect, useId, useState, type JSX } from "react";
import { DEFAULT_CHAT_MODEL, type ChatSettings as Settings } from "../../shared/preload-api";

const HEADING = "AIチャットの設定";
const KEY_LABEL = "Anthropic APIキー";
const MODEL_LABEL = "モデル";
const SAVE_LABEL = "保存";
const CANCEL_LABEL = "キャンセル";
const REPLACE_LABEL = "入力し直す";
const CLEAR_LABEL = "削除";
const UNSET_MESSAGE = "APIキーが未設定です。チャットを使うには設定してください。";
const CLEAR_CONFIRM_MESSAGE = "保存済みのAPIキーを削除しますか?";

// 利用者が「どのキーを入れたか」を見分けられる最小限だけを見せる。全体は決して表示しない。
const MASK_PREFIX = "sk-ant-";
const MASK_DOTS = "·".repeat(24);

const MODEL_OPTIONS = ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"] as const;

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint`;
const BUTTON_QUIET = `${BUTTON_BASE} border-line text-text-soft hover:border-ink-aqua hover:text-ink-aqua-text`;
const BUTTON_CRIT = `${BUTTON_BASE} border-line text-text-faint hover:border-crit hover:text-crit`;
const FIELD = `${FOCUS_RING} m-0 w-full rounded-md border border-solid border-line bg-paper px-3 py-1.5 font-mono text-sm text-text`;

export const ChatSettings = (): JSX.Element => {
  const keyFieldId = useId();
  const modelFieldId = useId();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await window.hanamask.readChatSettings());
      setError(null);
    } catch (cause) {
      setError(`設定の読み込みに失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = async (): Promise<void> => {
    if (draftKey === null || draftKey.trim() === "") return;
    setSaving(true);
    try {
      setSettings(await window.hanamask.saveChatApiKey(draftKey));
      setDraftKey(null);
      setError(null);
    } catch (cause) {
      // safeStorageが使えない環境ではmain側が保存を断る。その理由をそのまま見せる。
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async (): Promise<void> => {
    if (!window.confirm(CLEAR_CONFIRM_MESSAGE)) return;
    try {
      setSettings(await window.hanamask.clearChatApiKey());
      setError(null);
    } catch (cause) {
      setError(`APIキーの削除に失敗しました: ${String(cause)}`);
    }
  };

  const changeModel = async (model: string): Promise<void> => {
    try {
      setSettings(await window.hanamask.saveChatModel(model));
      setError(null);
    } catch (cause) {
      setError(`モデルの変更に失敗しました: ${String(cause)}`);
    }
  };

  const editing = draftKey !== null;
  const storedMask = settings?.apiKeyMask ?? null;

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

      {settings !== null && storedMask === null && !editing && (
        <p className="m-0 max-w-xl rounded-md border border-solid border-warn bg-paper-raised px-4 py-3 text-sm text-warn">
          {UNSET_MESSAGE}
        </p>
      )}

      <div className="flex max-w-xl flex-col gap-2">
        <label htmlFor={keyFieldId} className="font-body text-sm text-text-soft">
          {KEY_LABEL}
        </label>
        {editing ? (
          <>
            <input
              id={keyFieldId}
              type="password"
              value={draftKey}
              onChange={(event) => {
                setDraftKey(event.target.value);
              }}
              className={FIELD}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || draftKey.trim() === ""}
                onClick={() => {
                  void saveKey();
                }}
                className={BUTTON_PRIMARY}
              >
                {SAVE_LABEL}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftKey(null);
                }}
                className={BUTTON_QUIET}
              >
                {CANCEL_LABEL}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-solid border-line bg-paper px-3 py-2">
            <span className="font-mono text-sm text-text-soft">
              {storedMask === null ? "未設定" : `${MASK_PREFIX}${MASK_DOTS}${storedMask}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraftKey("");
              }}
              className={`${BUTTON_QUIET} ml-auto`}
            >
              {storedMask === null ? "入力する" : REPLACE_LABEL}
            </button>
            {storedMask !== null && (
              <button
                type="button"
                onClick={() => {
                  void clearKey();
                }}
                className={BUTTON_CRIT}
              >
                {CLEAR_LABEL}
              </button>
            )}
          </div>
        )}
        <p className="m-0 text-xs text-text-faint">
          キーはOSのセキュアストレージで暗号化して保存します。保存後は末尾4文字だけを表示し、全体を画面に出すことはありません。
        </p>
      </div>

      <div className="flex max-w-xl flex-col gap-2">
        <label htmlFor={modelFieldId} className="font-body text-sm text-text-soft">
          {MODEL_LABEL}
        </label>
        <select
          id={modelFieldId}
          value={settings?.model ?? DEFAULT_CHAT_MODEL}
          onChange={(event) => {
            void changeModel(event.target.value);
          }}
          className={FIELD}
        >
          {MODEL_OPTIONS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <p className="m-0 text-xs text-text-faint">
          利用料はご自身のAnthropic
          APIアカウントに直接課金されます。hanamaskは使用量の集計や上限設定を行いません。
        </p>
      </div>
    </section>
  );
};
