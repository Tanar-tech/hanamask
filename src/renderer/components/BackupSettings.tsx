import { useState, type JSX } from "react";
import type { BackupCounts } from "../../shared/preload-api";

const HEADING = "データの書き出しと取り込み";
const EXPORT_LABEL = "書き出す";
const IMPORT_LABEL = "取り込む";
const EXPORT_DESCRIPTION =
  "ノート・タスク・リンク・編集履歴・画像を1つのzipにまとめます。AIチャットのAPIキーは含めません。";
const IMPORT_DESCRIPTION =
  "書庫の内容でこのPCのデータを置き換えます。置き換える前の状態は自動で退避するので、間違えても戻せます。";
const IMPORT_CONFIRM_MESSAGE =
  "取り込むと、今あるノート・タスク・画像は書庫の内容に置き換わります。直前の状態は自動で退避します。続けますか?";

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1.5 font-body text-sm transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10`;
// 取り込みは既存データを置き換える。他のボタンと同じ見た目にしない。
const BUTTON_CRIT = `${BUTTON_BASE} border-crit text-crit hover:bg-crit/10`;

const describeCounts = ({ notes, tasks, images }: BackupCounts): string =>
  `ノート${String(notes)}件・タスク${String(tasks)}件・画像${String(images)}件`;

export const BackupSettings = (): JSX.Element => {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<string | null>): Promise<void> => {
    setBusy(true);
    try {
      setMessage(await work());
      setError(null);
    } catch (cause) {
      setMessage(null);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = (): Promise<void> =>
    run(async () => {
      const result = await window.hanamask.exportBackup();
      if (result.status === "cancelled") return null;
      return `${result.filePath} に書き出しました（${describeCounts(result.counts)}）。`;
    });

  const importBackup = (): Promise<void> =>
    run(async () => {
      if (!window.confirm(IMPORT_CONFIRM_MESSAGE)) return null;
      const result = await window.hanamask.importBackup();
      if (result.status === "cancelled") return null;
      return `取り込みました（${describeCounts(result.counts)}）。取り込む前の状態は ${result.safetyCopyPath} に退避しています。`;
    });

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

      {message !== null && (
        <p
          role="status"
          className="m-0 max-w-xl rounded-md border border-solid border-line bg-paper-raised px-4 py-3 text-sm break-all text-text-soft"
        >
          {message}
        </p>
      )}

      <div className="flex max-w-xl flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void exportBackup();
          }}
          className={`${BUTTON_PRIMARY} self-start`}
        >
          {EXPORT_LABEL}
        </button>
        <p className="m-0 text-xs text-text-faint">{EXPORT_DESCRIPTION}</p>
      </div>

      <div className="flex max-w-xl flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void importBackup();
          }}
          className={`${BUTTON_CRIT} self-start`}
        >
          {IMPORT_LABEL}
        </button>
        <p className="m-0 text-xs text-text-faint">{IMPORT_DESCRIPTION}</p>
      </div>
    </section>
  );
};
