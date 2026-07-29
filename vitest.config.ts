import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    pool: "threads",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "**/__mocks__/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "**/release/**",
        "**/docs/**",
        "**/*.config.*",
        "**/test/**",
      ],
    },
    include: ["src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/release/**",
      "**/docs/**",
      "**/__mocks__/**",
      "**/test/**",
    ],
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/test-utils/vscode.mock.ts"),
    },
  },
});
