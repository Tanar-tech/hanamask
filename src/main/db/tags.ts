/*
 * タグはノートとタスクの両方が同じ形（JSONの文字列）で持つ。読み書きの仕方が
 * 分かれると、片方だけ壊れたときに気付けないので1か所に置く。
 */

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const parseTags = (rawTags: string): string[] => {
  const parsed: unknown = JSON.parse(rawTags);
  if (!isStringArray(parsed)) {
    throw new Error(`Stored tags are not a JSON array of strings: ${rawTags}`);
  }
  return parsed;
};

export const serializeTags = (tags: readonly string[]): string => JSON.stringify(tags);
