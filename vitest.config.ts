import { defineConfig } from "vitest/config";

/*
 * 既定の5秒だと、GitHubのWindowsランナーで単体テストが散発的に落ちる。
 * 落ちたのはいずれも「作成1回＋更新2回」程度の軽いテストで、6秒前後かかっていた。
 * 遅いのはコードではなくランナーのディスク（初回のSQLiteファイル生成）。
 *
 * 本当の停止は無限に待つので、余裕を持たせても検出力は落ちない。逆に、この値を
 * 超えるようになったら「遅くなった」ではなく「止まっている」と考えてよい。
 */
const TEST_TIMEOUT_MS = 20_000;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    passWithNoTests: true,
  },
});
