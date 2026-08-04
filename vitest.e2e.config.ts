import { defineConfig } from "vitest/config";

const E2E_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.spec.ts"],
    testTimeout: E2E_TEST_TIMEOUT_MS,
    hookTimeout: E2E_TEST_TIMEOUT_MS,
    fileParallelism: false,
    passWithNoTests: true,
  },
});
