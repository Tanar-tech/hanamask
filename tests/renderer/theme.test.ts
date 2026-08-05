import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync(
  fileURLToPath(new URL("../../src/renderer/styles/theme.css", import.meta.url)),
  "utf-8",
);

const lightTokens: Record<string, string> = {
  "--color-ink-pink": "#ff3d8b",
  "--color-ink-aqua": "#00b3c8",
  "--color-ink-yellow": "#ffc93c",
  "--color-paper": "#eceff3",
  "--color-paper-raised": "#f7f9fb",
  "--color-line": "#cdd5de",
  "--color-text": "#10131c",
  "--color-text-soft": "#5a6675",
  "--color-text-faint": "#8896a5",
  "--color-ok": "#17915c",
  "--color-warn": "#b8730a",
  "--color-crit": "#cc2f3e",
};

const darkTokens: Record<string, string> = {
  "--color-ink-pink": "#ff5c9e",
  "--color-ink-aqua": "#2ad0e4",
  "--color-ink-yellow": "#ffd45c",
  "--color-paper": "#0d1017",
  "--color-paper-raised": "#161b25",
  "--color-line": "#2a3240",
  "--color-text": "#e6ebf1",
  "--color-text-soft": "#a3b0bf",
  "--color-text-faint": "#6f7d8c",
  "--color-ok": "#3ad18b",
  "--color-warn": "#e0a13a",
  "--color-crit": "#ff6b78",
};

const themeBlock = (): string => {
  const start = themeCss.indexOf("@theme");
  expect(start).toBeGreaterThanOrEqual(0);
  return themeCss.slice(start, themeCss.indexOf("@media", start));
};

const darkBlock = (): string => {
  const start = themeCss.indexOf("prefers-color-scheme: dark");
  expect(start).toBeGreaterThanOrEqual(0);
  return themeCss.slice(start);
};

describe("theme.css", () => {
  it("ライトテーマのトークンを定義している", () => {
    const block = themeBlock();
    Object.entries(lightTokens).forEach(([name, value]) => {
      expect(block).toContain(`${name}: ${value};`);
    });
  });

  it("prefers-color-scheme: dark でダークテーマのトークンを上書きする", () => {
    const block = darkBlock();
    Object.entries(darkTokens).forEach(([name, value]) => {
      expect(block).toContain(`${name}: ${value};`);
    });
  });

  it("OS標準のフォントスタックをトークンとして定義している", () => {
    const block = themeBlock();
    expect(block).toContain("--font-display:");
    expect(block).toContain("--font-body:");
    expect(block).toContain("--font-mono:");
  });

  it("Webフォント・外部CSSを読み込まない", () => {
    expect(themeCss).not.toContain("@font-face");
    expect(themeCss).not.toMatch(/https?:\/\//);
  });

  it("既存の見た目を変えないよう preflight を読み込まない", () => {
    expect(themeCss).not.toContain('@import "tailwindcss"');
    expect(themeCss).not.toContain('@import "tailwindcss/preflight');
  });
});
