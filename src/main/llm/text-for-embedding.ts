/*
 * トークナイザを通さずに長さを抑えるための保守的な見積り。日本語1文字はおおむね
 * 1トークン以上になるため、この倍率で切っておけばコンテキスト超過になりにくい。
 */
const CHARS_PER_TOKEN = 1.5;

export const maxCharsForContext = (contextSize: number): number =>
  Math.floor(contextSize * CHARS_PER_TOKEN);

export const buildDocumentText = (title: string, body: string, maxChars: number): string => {
  if (maxChars <= 0) return "";
  const text = [title, body].filter((part) => part.length > 0).join("\n");
  return text.slice(0, maxChars);
};
