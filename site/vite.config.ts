import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// GitHub Pages のプロジェクトサイトは https://<owner>.github.io/hanamask/ 配下に置かれる
const GITHUB_PAGES_BASE_PATH = "/hanamask/";

export default defineConfig({
  root: "site",
  base: GITHUB_PAGES_BASE_PATH,
  plugins: [tailwindcss()],
  build: {
    outDir: "../dist-site",
    emptyOutDir: true,
  },
});
