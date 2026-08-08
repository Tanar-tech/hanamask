import type { JSX } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

interface MarkdownBodyProps {
  content: string;
}

// 本文はAIエージェントが書くため、生HTMLを通す以上サニタイズは必須。既定のスキーマは
// script/iframe/on*/javascript: を許可しないので、そこへ管理者が許可した style だけを足す。
// CSP（script-src 'self'）に頼らずここでも落とすのが要件（docs/TASKS.md T34）。
export const SANITIZE_SCHEMA: typeof defaultSchema = {
  ...defaultSchema,
  // <style> を許さないと中のCSSがテキストとして本文に出てしまう（未許可要素の子は持ち上げられる）。
  tagNames: [...(defaultSchema.tagNames ?? []), "style"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "style"],
  },
};

// 本文の要素はMarkdownからも埋め込みHTMLからも生えるため、要素ごとのコンポーネントではなく
// 親からの子孫セレクタで揃える。preflight を入れていないので既定のマージン・リストマーカーも
// ここで打ち消す。
const BODY = [
  "flex flex-col gap-3 font-body text-base leading-relaxed break-words text-text",
  "[&_:is(h1,h2,h3,h4,h5,h6)]:m-0 [&_:is(h1,h2,h3,h4,h5,h6)]:font-display",
  "[&_:is(h1,h2,h3,h4,h5,h6)]:font-bold [&_:is(h1,h2,h3,h4,h5,h6)]:break-words",
  "[&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_:is(h4,h5,h6)]:text-base",
  "[&_p]:m-0 [&_strong]:font-semibold [&_em]:italic",
  "[&_:is(ul,ol)]:my-0 [&_:is(ul,ol)]:ml-5 [&_:is(ul,ol)]:pl-0 [&_li]:m-0",
  "[&_ul]:list-disc [&_ol]:list-decimal",
  "[&_a]:text-ink-aqua-text [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded-sm [&_code]:bg-paper-raised [&_code]:px-1 [&_code]:py-0.5",
  "[&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-line",
  "[&_pre]:bg-paper-raised [&_pre]:p-3",
  // コードブロックでは地色と余白が二重になるため、中の code の見た目を打ち消す。
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm",
  "[&_blockquote]:m-0 [&_blockquote]:border-0 [&_blockquote]:border-l-2",
  "[&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-text-soft",
  "[&_hr]:m-0 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-line",
  "[&_table]:border-collapse [&_table]:border [&_table]:border-line [&_table]:text-sm",
  "[&_:is(th,td)]:border [&_:is(th,td)]:border-line [&_:is(th,td)]:px-2 [&_:is(th,td)]:py-1",
  "[&_:is(th,td)]:text-left [&_:is(th,td)]:align-top",
  "[&_th]:font-display [&_th]:font-semibold [&_th]:text-text-soft",
  "[&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
].join(" ");

// 本文中のリンクは外部サイトを指す。同じウィンドウで開くとアプリ自体が置き換わるため、
// 新しいウィンドウに逃がす（外部ブラウザで開く挙動はmainプロセス側の未決事項）。
const COMPONENTS: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

export const MarkdownBody = ({ content }: MarkdownBodyProps): JSX.Element => (
  <div className={BODY}>
    <Markdown rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]]} components={COMPONENTS}>
      {content}
    </Markdown>
  </div>
);
