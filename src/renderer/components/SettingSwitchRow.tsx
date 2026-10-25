import { useId, type JSX } from "react";

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

export const SwitchRow = ({
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
