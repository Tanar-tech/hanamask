import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { ChatEvent, ChatMessage } from "../../shared/preload-api";

const HEADING = "AIチャット";
const SEND_LABEL = "送信";
const ABORT_LABEL = "中止する";
const INPUT_LABEL = "メッセージ";
const EMPTY_MESSAGE = "ノートやタスクの操作を頼めます。";
const BILLING_NOTICE = "Anthropic APIの利用料はご自身のアカウントに課金されます";
// 中止できるのはターンの区切りだけ。取り消せると誤解されると危険なので明示する。
const ABORT_NOTICE = "応答の途中でも止められます。すでに実行されたツールは取り消されません";
const ABORTED_MESSAGE = "中止しました";
const OPEN_SETTINGS_LABEL = "設定を開く";
const API_KEY_HINT = "APIキーが未設定です。";

/* preflight を入れていないため、ブラウザ既定のマージン・フォーム外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON_BASE = `${FOCUS_RING} m-0 cursor-pointer appearance-none rounded-md border border-solid bg-transparent px-3 py-1 font-body text-xs transition-colors duration-[var(--duration-fast)] ease-standard`;
const BUTTON_PRIMARY = `${BUTTON_BASE} border-ink-aqua text-ink-aqua-text hover:bg-ink-aqua/10 disabled:cursor-not-allowed disabled:border-line disabled:text-text-faint`;
const BUTTON_CRIT = `${BUTTON_BASE} border-crit text-crit hover:bg-crit/10`;

interface ChatPanelProps {
  onOpenSettings: () => void;
}

// 表示用の1行。利用者の発言・エージェントの発言・ツールの実行を同じ列に並べる。
interface Entry {
  id: number;
  who: "user" | "agent";
  kind: "text" | "tool" | "error";
  text: string;
  running?: boolean;
}

const toolLabel = (event: ChatEvent): string => {
  const name = event.toolName ?? "";
  if (event.kind === "tool-started") return `${name} を実行しています`;
  if (event.kind === "tool-failed") return `${name} が失敗しました`;
  return `${name} を実行しました`;
};

export const ChatPanel = ({ onOpenSettings }: ChatPanelProps): JSX.Element => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const historyRef = useRef<ChatMessage[]>([]);
  const nextId = useRef(0);

  const append = useCallback((entry: Omit<Entry, "id">): void => {
    nextId.current += 1;
    setEntries((current) => [...current, { ...entry, id: nextId.current }]);
  }, []);

  useEffect(
    () =>
      window.hanamask.onChatEvent((event) => {
        if (event.kind === "assistant-text") {
          append({ who: "agent", kind: "text", text: event.text ?? "" });
          return;
        }
        if (event.kind === "aborted") {
          append({ who: "agent", kind: "error", text: ABORTED_MESSAGE });
          return;
        }
        if (event.kind === "tool-started") {
          append({ who: "agent", kind: "tool", text: toolLabel(event), running: true });
          return;
        }
        // 実行中として出した行を、結果で置き換える。行が増え続けないようにするため。
        setEntries((current) => {
          const index = current.findLastIndex((entry) => entry.running === true);
          if (index === -1) return current;
          const replaced = [...current];
          replaced[index] = {
            ...current[index],
            kind: event.kind === "tool-failed" ? "error" : "tool",
            text: toolLabel(event),
            running: false,
          } as Entry;
          return replaced;
        });
      }),
    [append],
  );

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (text === "" || sending) return;
    append({ who: "user", kind: "text", text });
    setDraft("");
    setSending(true);
    setNeedsApiKey(false);
    try {
      historyRef.current = await window.hanamask.sendChatMessage(historyRef.current, text);
    } catch (cause) {
      const message = String(cause);
      // APIキー未設定は「直せば解決する」ので、エラーではなく設定への導線として見せる。
      if (message.includes("APIキーが未設定")) setNeedsApiKey(true);
      else append({ who: "agent", kind: "error", text: message });
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-label={HEADING}
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-0 border-l border-solid border-line bg-paper-raised font-body text-text"
    >
      <h2 className="m-0 border-0 border-b border-solid border-line px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-text-faint uppercase">
        {HEADING}
      </h2>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {entries.length === 0 && <p className="m-0 text-xs text-text-faint">{EMPTY_MESSAGE}</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-1">
            <span
              className={`font-mono text-[0.5625rem] tracking-[0.1em] uppercase ${
                entry.who === "user" ? "text-ink-aqua-text" : "text-ink-pink"
              }`}
            >
              {entry.who === "user" ? "あなた" : "エージェント"}
            </span>
            <p
              className={`m-0 rounded-md border border-solid px-2 py-1 text-xs leading-relaxed ${
                entry.kind === "error"
                  ? "border-crit bg-paper text-crit"
                  : entry.kind === "tool"
                    ? "border-dashed border-ink-pink/60 bg-ink-pink/5 text-text-soft"
                    : entry.who === "user"
                      ? "border-ink-aqua/50 bg-paper"
                      : "border-ink-pink/40 bg-paper"
              }`}
            >
              {entry.text}
            </p>
          </div>
        ))}
      </div>

      {needsApiKey && (
        <div className="m-3 flex flex-col gap-2 rounded-md border border-solid border-warn bg-paper px-3 py-2">
          <span className="text-xs text-warn">{API_KEY_HINT}</span>
          <button type="button" onClick={onOpenSettings} className={`${BUTTON_PRIMARY} self-start`}>
            {OPEN_SETTINGS_LABEL}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-0 border-t border-solid border-line p-3">
        <label htmlFor="chat-draft" className="sr-only text-xs text-text-soft">
          {INPUT_LABEL}
        </label>
        <textarea
          id="chat-draft"
          aria-label={INPUT_LABEL}
          value={draft}
          rows={3}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          className={`${FOCUS_RING} m-0 w-full resize-none rounded-md border border-solid border-line bg-paper px-2 py-1 font-body text-xs text-text`}
        />
        <div className="flex items-center gap-2">
          {sending ? (
            <button
              type="button"
              onClick={() => {
                void window.hanamask.abortChat();
              }}
              className={BUTTON_CRIT}
            >
              {ABORT_LABEL}
            </button>
          ) : (
            <button
              type="button"
              disabled={draft.trim() === ""}
              onClick={() => {
                void send();
              }}
              className={BUTTON_PRIMARY}
            >
              {SEND_LABEL}
            </button>
          )}
          <p className="m-0 text-[0.625rem] leading-tight text-text-faint">
            {sending ? ABORT_NOTICE : BILLING_NOTICE}
          </p>
        </div>
      </div>
    </section>
  );
};
