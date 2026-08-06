import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../..");
const distDir = join(repoRoot, "dist");

/*
 * electron-builder.yml が dist/** を丸ごと同梱するため、dist に中間生成物が混ざると
 * そのままインストーラーに入る。preload のコンパイル結果を dist へ吐くと共有ファイルを
 * CommonJS で上書きしてアプリの起動も壊れる（T29で実際に起きた）。両方をここで固定する。
 */
describe("packaging layout", () => {
  it("dist にはアプリの実行に必要なものだけを置く", () => {
    if (!existsSync(distDir)) return;

    expect(readdirSync(distDir).toSorted()).toEqual(["main", "preload", "renderer", "shared"]);
  });

  it("preload は Electron が読める .cjs として置く", () => {
    if (!existsSync(distDir)) return;

    expect(readdirSync(join(distDir, "preload"))).toEqual(["index.cjs"]);
  });

  it("共有ファイルは main と同じ ESM で出力する", () => {
    const sharedPath = join(distDir, "shared/preload-api.js");
    if (!existsSync(sharedPath)) return;

    const shared = readFileSync(sharedPath, "utf-8");
    expect(shared).not.toContain("exports.");
    expect(shared).toContain("export const NOTE_RETENTION_DAYS");
  });
});
