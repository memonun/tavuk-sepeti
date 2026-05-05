import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    include: ["tests/**/*.test.ts", "features/**/*.test.ts", "shared/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["features/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.schema.ts"],
    },
  },
});
