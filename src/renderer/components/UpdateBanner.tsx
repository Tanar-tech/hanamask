import { useState, type JSX } from "react";
import { useUpdateStatus } from "../hooks/useUpdateStatus";
import { BUTTON_PRIMARY, INSTALL_LABEL } from "./UpdateSettings";

const BANNER_NAME = "更新の準備";
const LATER_LABEL = "あとで";
const APPLY_ON_QUIT_NOTE =
  "「あとで」を選んでも、次に hanamask を終了したときに入れ替わります。";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_QUIET = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid border-line bg-transparent px-3 py-1.5 font-body text-sm text-text-soft transition-colors duration-[var(--duration-fast)] ease-standard hover:border-ink-aqua hover:text-ink-aqua-text`;

export const UpdateBanner = (): JSX.Element | null => {
  const [status] = useUpdateStatus();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || status?.state.kind !== "downloaded") return null;

  return (
    <div
      role="status"
      aria-label={BANNER_NAME}
      className="flex flex-wrap items-center gap-3 border-0 border-b border-solid border-ink-aqua bg-paper-raised px-6 py-3 font-body text-sm text-text"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 font-semibold">
          新しい版 v{status.state.version} の準備ができました。
        </p>
        <p className="m-0 text-xs text-text-faint">{APPLY_ON_QUIT_NOTE}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void window.hanamask.installUpdate();
        }}
        className={BUTTON_PRIMARY}
      >
        {INSTALL_LABEL}
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
        }}
        className={BUTTON_QUIET}
      >
        {LATER_LABEL}
      </button>
    </div>
  );
};
