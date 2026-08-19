/*
 * 型ガードの前段でよく要る「オブジェクトなら添字アクセスできる形にする」だけの変換。
 * スプレッドでコピーするのは、プロトタイプ由来のプロパティを覗かせないため。
 */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value !== "object" || value === null ? null : { ...value };
