import type { CommentAnchor } from "../shared/preload-api";

export const DEFAULT_CONTEXT_LENGTH = 32;

export interface TextRange {
  start: number;
  end: number;
}

const LEADING_SPACE = /^\s*/;
const TRAILING_SPACE = /\s*$/;
// 空白の連なりは1つの単位、それ以外は1文字ずつ。描画した本文と元の本文で改行や空白の数が違っても一致させるため。
const NORMALIZE_TOKEN = /\s+|\S/g;
const SPACE_RUN = /^\s+$/;

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

const leadingSpaceLength = (value: string): number => LEADING_SPACE.exec(value)?.[0].length ?? 0;

const trailingSpaceLength = (value: string): number => TRAILING_SPACE.exec(value)?.[0].length ?? 0;

export const buildAnchor = (
  text: string,
  start: number,
  end: number,
  contextLength: number = DEFAULT_CONTEXT_LENGTH,
): CommentAnchor | null => {
  const from = clamp(Math.min(start, end), text.length);
  const to = clamp(Math.max(start, end), text.length);
  const selected = text.slice(from, to);
  const quoteStart = from + leadingSpaceLength(selected);
  const quoteEnd = Math.max(quoteStart, to - trailingSpaceLength(selected));
  if (quoteStart === quoteEnd) return null;
  return {
    quote: text.slice(quoteStart, quoteEnd),
    prefix: text.slice(Math.max(0, quoteStart - contextLength), quoteStart),
    suffix: text.slice(quoteEnd, quoteEnd + contextLength),
  };
};

interface NormalizedText {
  text: string;
  /** 正規化後の各文字が元の本文のどこから始まり、どこで終わるか。 */
  starts: number[];
  ends: number[];
}

const normalize = (text: string): NormalizedText => {
  const tokens = [...text.matchAll(NORMALIZE_TOKEN)];
  return {
    text: tokens.map((token) => (SPACE_RUN.test(token[0]) ? " " : token[0])).join(""),
    starts: tokens.map((token) => token.index),
    ends: tokens.map((token) => token.index + token[0].length),
  };
};

const normalizeString = (value: string): string => normalize(value).text;

const findAllIndexes = (haystack: string, needle: string): number[] => {
  const indexes: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    indexes.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return indexes;
};

const commonPrefixLength = (a: string, b: string): number => {
  const length = Math.min(a.length, b.length);
  const mismatch = Array.from({ length }).findIndex((_, i) => a[i] !== b[i]);
  return mismatch === -1 ? length : mismatch;
};

const reverse = (value: string): string => [...value].reverse().join("");

const commonSuffixLength = (a: string, b: string): number =>
  commonPrefixLength(reverse(a), reverse(b));

const contextScore = (
  body: string,
  index: number,
  quote: string,
  anchor: CommentAnchor,
): number => {
  const prefix = normalizeString(anchor.prefix);
  const suffix = normalizeString(anchor.suffix);
  const before = body.slice(Math.max(0, index - prefix.length), index);
  const after = body.slice(index + quote.length, index + quote.length + suffix.length);
  return commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
};

// 同点なら先に現れたほうを残す。
const bestIndex = (body: string, quote: string, anchor: CommentAnchor): number | null => {
  const candidates = findAllIndexes(body, quote).map((index) => ({
    index,
    score: contextScore(body, index, quote, anchor),
  }));
  const best = candidates.reduce<(typeof candidates)[number] | null>(
    (kept, candidate) => (kept === null || candidate.score > kept.score ? candidate : kept),
    null,
  );
  return best?.index ?? null;
};

export const locateAnchor = (text: string, anchor: CommentAnchor): TextRange | null => {
  const quote = normalizeString(anchor.quote.trim());
  if (quote === "") return null;
  const body = normalize(text);
  const index = bestIndex(body.text, quote, anchor);
  if (index === null) return null;
  const start = body.starts[index];
  const end = body.ends[index + quote.length - 1];
  return start === undefined || end === undefined ? null : { start, end };
};
