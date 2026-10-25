import { fromMarkdown } from "mdast-util-from-markdown";

export type SectionEditResult =
  | { ok: true; markdown: string }
  | { ok: false; reason: "not_found" | "ambiguous"; candidates: string[] };

export interface HeadingInfo {
  depth: number;
  text: string;
}

interface Section extends HeadingInfo {
  // 見出し行の直後（行末の改行の手前）。節の中身はここから end まで。
  contentStart: number;
  end: number;
}

interface HeadingSelector {
  text: string;
  depth?: number;
}

type MdNode = ReturnType<typeof fromMarkdown>["children"][number];

const CRLF = "\r\n";
const LF = "\n";
const HASH_FORM_PATTERN = /^(#{1,6})\s+(.*)$/;

const plainTextOf = (node: unknown): string => {
  if (typeof node !== "object" || node === null) return "";
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(plainTextOf).join("");
  }
  return "";
};

const lineStartOf = (markdown: string, offset: number): number =>
  markdown.lastIndexOf(LF, offset - 1) + 1;

interface RawHeading extends HeadingInfo {
  start: number;
  contentStart: number;
}

// 引用やリストの中の見出しは節の区切りとして扱わない（ページの構造を表すのは最上位の見出しだけ）。
const collectRawHeadings = (markdown: string): RawHeading[] =>
  fromMarkdown(markdown).children.flatMap((node: MdNode) => {
    const { position } = node;
    if (node.type !== "heading" || position?.start.offset === undefined) return [];
    if (position.end.offset === undefined) return [];
    return [
      {
        depth: node.depth,
        text: plainTextOf(node).trim(),
        start: lineStartOf(markdown, position.start.offset),
        contentStart: position.end.offset,
      },
    ];
  });

const findSections = (markdown: string): Section[] => {
  const headings = collectRawHeadings(markdown);
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((later) => later.depth <= heading.depth);
    return {
      depth: heading.depth,
      text: heading.text,
      contentStart: heading.contentStart,
      end: next?.start ?? markdown.length,
    };
  });
};

export const listHeadings = (markdown: string): HeadingInfo[] =>
  collectRawHeadings(markdown).map(({ depth, text }) => ({ depth, text }));

const labelOf = (heading: HeadingInfo): string => `${"#".repeat(heading.depth)} ${heading.text}`;

const parseSelector = (heading: string): HeadingSelector => {
  const trimmed = heading.trim();
  const match = HASH_FORM_PATTERN.exec(trimmed);
  if (match === null) return { text: trimmed };
  return { text: (match[2] ?? "").trim(), depth: (match[1] ?? "").length };
};

const matchesSelector = (section: Section, selector: HeadingSelector): boolean =>
  section.text === selector.text &&
  (selector.depth === undefined || section.depth === selector.depth);

type SectionLookup = { ok: true; section: Section } | Extract<SectionEditResult, { ok: false }>;

const lookupSection = (markdown: string, heading: string): SectionLookup => {
  const sections = findSections(markdown);
  const selector = parseSelector(heading);
  const matches = sections.filter((section) => matchesSelector(section, selector));
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return { ok: true, section: only };
  if (matches.length === 0) {
    return { ok: false, reason: "not_found", candidates: sections.map(labelOf) };
  }
  return { ok: false, reason: "ambiguous", candidates: matches.map(labelOf) };
};

// 本文の改行コードに合わせる。混在させると Windows で書かれたページの差分が全行に出る。
const lineEndingOf = (markdown: string): string => (markdown.includes(CRLF) ? CRLF : LF);

const normalizeContent = (content: string, eol: string): string =>
  content
    .replace(/\r\n/g, LF)
    .replace(/^\n+/, "")
    .trimEnd()
    .split(LF)
    .join(eol);

const joinBlocks = (blocks: string[], eol: string): string => {
  const parts = blocks.map((block) => block.trimEnd()).filter((block) => block.trim() !== "");
  return parts.length === 0 ? "" : `${parts.join(eol + eol)}${eol}`;
};

// 見出し行の直後に空行を1つ置くため、見出しと中身は別のブロックとして連結する。
const spliceSection = (markdown: string, section: Section, body: string): string => {
  const eol = lineEndingOf(markdown);
  const headingPart = markdown.slice(0, section.contentStart);
  const rest = markdown.slice(section.end);
  return joinBlocks([headingPart, body, rest], eol);
};

const sectionBodyOf = (markdown: string, section: Section): string =>
  markdown.slice(section.contentStart, section.end).replace(/^(\r?\n)+/, "");

export const appendToMarkdown = (
  markdown: string,
  content: string,
  heading?: string,
): SectionEditResult => {
  const eol = lineEndingOf(markdown);
  const addition = normalizeContent(content, eol);
  if (heading === undefined) return { ok: true, markdown: joinBlocks([markdown, addition], eol) };
  const lookup = lookupSection(markdown, heading);
  if (!lookup.ok) return lookup;
  const body = joinBlocks([sectionBodyOf(markdown, lookup.section), addition], eol);
  return { ok: true, markdown: spliceSection(markdown, lookup.section, body) };
};

export const replaceMarkdownSection = (
  markdown: string,
  heading: string,
  content: string,
): SectionEditResult => {
  const lookup = lookupSection(markdown, heading);
  if (!lookup.ok) return lookup;
  const body = normalizeContent(content, lineEndingOf(markdown));
  return { ok: true, markdown: spliceSection(markdown, lookup.section, body) };
};
