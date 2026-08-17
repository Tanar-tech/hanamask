import { useCallback, useEffect, useState, type JSX } from "react";

const HEADING = "AIエージェントから使う";
const INTRO =
  "エージェントの設定に一度だけ登録すると、以後はどのフォルダで作業していても hanamask のツールを使えます。";
const ENDPOINT_LABEL = "現在の接続先";
const COMMAND_LABEL = "Claude Code に登録する";
const COMMAND_DESCRIPTION =
  "ターミナルで実行します。--scope user を付けているので、プロジェクトごとの登録は要りません。";
const JSON_LABEL = "その他のエージェントに登録する";
const JSON_DESCRIPTION = "お使いのMCPクライアントの設定ファイルに貼り付けます。";
const RESTART_NOTICE =
  "登録したあとは、エージェントを立ち上げ直してください。エージェントは起動時に接続先を読むため、そのままでは反映されません。";
const COMMAND_COPY_LABEL = "登録コマンドをコピー";
const JSON_COPY_LABEL = "JSONをコピー";
const COPY_DONE_LABEL = "コピーしました";

/* preflight を入れていないため、ブラウザ既定のマージン・ボタン外観を各所で打ち消している */
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-yellow";
const BUTTON = `${FOCUS_RING} m-0 w-fit cursor-pointer appearance-none rounded-md border border-solid border-ink-aqua bg-transparent px-3 py-1.5 font-body text-sm text-ink-aqua-text transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-ink-aqua/10`;
const SNIPPET =
  "m-0 max-w-xl overflow-x-auto rounded-md border border-solid border-line bg-paper-raised px-3 py-2 font-mono text-xs whitespace-pre text-text-soft";

export const buildClaudeCodeCommand = (url: string): string =>
  `claude mcp add --scope user --transport http hanamask ${url}`;

export const buildMcpConfigJson = (url: string): string =>
  JSON.stringify({ mcpServers: { hanamask: { type: "http", url } } }, null, 2);

interface SnippetProps {
  label: string;
  description: string;
  copyLabel: string;
  value: string;
  onCopy: (value: string) => Promise<boolean>;
}

const Snippet = ({ label, description, copyLabel, value, onCopy }: SnippetProps): JSX.Element => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <h3 className="m-0 font-display text-sm leading-tight font-bold">{label}</h3>
      <p className="m-0 text-xs text-text-faint">{description}</p>
      <pre className={SNIPPET}>{value}</pre>
      <button
        type="button"
        className={BUTTON}
        onClick={() => {
          void onCopy(value).then(setCopied);
        }}
      >
        {copied ? COPY_DONE_LABEL : copyLabel}
      </button>
    </div>
  );
};

export const AgentSetup = (): JSX.Element => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUrl((await window.hanamask.readMcpEndpoint()).url);
      setError(null);
    } catch (cause) {
      setError(`接続先の取得に失敗しました: ${String(cause)}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      return true;
    } catch (cause) {
      setError(`コピーに失敗しました: ${String(cause)}`);
      return false;
    }
  };

  return (
    <section className="flex flex-col gap-5 p-6 font-body text-text">
      <h2 className="m-0 font-display text-xl leading-tight font-bold tracking-tight">{HEADING}</h2>
      <p className="m-0 max-w-xl text-sm text-text-soft">{INTRO}</p>

      {error !== null && (
        <p
          role="alert"
          className="m-0 max-w-xl rounded-md border border-solid border-crit bg-paper-raised px-4 py-3 text-sm text-crit"
        >
          {error}
        </p>
      )}

      {url !== null && (
        <>
          <div className="flex max-w-xl flex-col gap-2">
            <h3 className="m-0 font-display text-sm leading-tight font-bold">{ENDPOINT_LABEL}</h3>
            <p className={SNIPPET}>{url}</p>
          </div>
          <Snippet
            label={COMMAND_LABEL}
            description={COMMAND_DESCRIPTION}
            copyLabel={COMMAND_COPY_LABEL}
            value={buildClaudeCodeCommand(url)}
            onCopy={copy}
          />
          <Snippet
            label={JSON_LABEL}
            description={JSON_DESCRIPTION}
            copyLabel={JSON_COPY_LABEL}
            value={buildMcpConfigJson(url)}
            onCopy={copy}
          />
          <p className="m-0 max-w-xl text-xs text-text-faint">{RESTART_NOTICE}</p>
        </>
      )}
    </section>
  );
};
