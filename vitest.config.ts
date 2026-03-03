import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    fileParallelism: false,
    pool: "forks",
    testTimeout: 15_000,
    hookTimeout: 30_000,
    globalSetup: "./src/test/global-setup.ts",
    setupFiles: ["./src/test/setup.ts"],
  },
});
