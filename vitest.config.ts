import { defineConfig } from "vitest/config";

/*
 * 既定の5秒だと、GitHubのWindowsランナーで単体テストが散発的に落ちる。
 * 落ちたのはいずれも「作成1回＋更新2回」程度の軽いテストで、6秒前後かかっていた。
 * 遅いのはコードではなくランナーのディスク（初回のSQLiteファイル生成）。
 *
 * 本当の停止は無限に待つので、余裕を持たせても検出力は落ちない。逆に、この値を
 * 超えるようになったら「遅くなった」ではなく「止まっている」と考えてよい。
 *
 * 2026-08-18に20秒へ足りなくなった。import-backup の復元テストが単体で20秒を超えたが、
 * 同じ回のWindowsで**ファイル全体12件が17.3秒**で通っており、コードが遅くなったのではなく
 * ランナーのI/Oが一時的に停滞したもの。このテストはDB2つ・画像・zip書庫の作成に加えて
 * 取り込み前の退避zipまで作るため、単体テストの中で最も重く、停滞の影響を最初に受ける。
 */
const TEST_TIMEOUT_MS = 40_000;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: TEST_TIMEOUT_MS,
    passWithNoTests: true,
  },
});
