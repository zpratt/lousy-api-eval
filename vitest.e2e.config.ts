import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    globalSetup: ["./tests/e2e/global-setup.ts"],
  },
});
