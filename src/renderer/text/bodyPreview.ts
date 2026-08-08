export const BODY_PREVIEW_LENGTH = 120;

const MERMAID_LANGUAGE = "mermaid";
const FENCE_MARKER = /^\s*```(\S*)/;
const ELLIPSIS = "…";

interface FenceScan {
  readonly lines: string[];
  readonly fenceLanguage: string | null;
}

// 図はプレビューでは読めないため、Mermaidだけは中身ごと落とす。
// 他の言語のコードは短い抜粋でも手掛かりになるので中身は残す。
const scanLine = (scan: FenceScan, line: string): FenceScan => {
  const language = FENCE_MARKER.exec(line)?.[1];
  if (scan.fenceLanguage !== null) {
    if (language !== undefined) return { lines: scan.lines, fenceLanguage: null };
    if (scan.fenceLanguage !== MERMAID_LANGUAGE) scan.lines.push(line);
    return scan;
  }
  if (language !== undefined) return { lines: scan.lines, fenceLanguage: language };
  scan.lines.push(line);
  return scan;
};

const stripCodeFences = (body: string): string =>
  body.split("\n").reduce<FenceScan>(scanLine, { lines: [], fenceLanguage: null }).lines.join("\n");

const MARKDOWN_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/!\[[^\]]*\]\([^)]*\)/g, ""],
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, ""],
  [/^\s{0,3}#{1,6}\s+/gm, ""],
  [/^\s*>\s?/gm, ""],
  [/^\s*([-*+]|\d+\.)\s+/gm, ""],
  [/(\*\*|__)([\s\S]*?)\1/g, "$2"],
  [/~~([\s\S]*?)~~/g, "$1"],
  [/(?<![\w*_])([*_])(?!\s)([\s\S]*?)(?<!\s)\1(?![\w*_])/g, "$2"],
  [/`([^`]*)`/g, "$1"],
];

const stripMarkdownSyntax = (body: string): string =>
  MARKDOWN_RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), body);

const truncate = (text: string): string =>
  text.length > BODY_PREVIEW_LENGTH ? `${text.slice(0, BODY_PREVIEW_LENGTH)}${ELLIPSIS}` : text;

/** 一覧カードに出す1行の抜粋。Markdownの記号を落とし、素のテキストだけを返す。 */
export const toBodyPreview = (body: string): string =>
  truncate(stripMarkdownSyntax(stripCodeFences(body)).replace(/\s+/g, " ").trim());
