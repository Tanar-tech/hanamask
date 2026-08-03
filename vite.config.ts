import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Electronはfile://でレンダラーを読み込むため、絶対パス参照だとアセットを解決できない
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
