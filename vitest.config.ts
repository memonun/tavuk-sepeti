import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The real `server-only` package throws on any import to enforce that
      // the file isn't bundled into a Client Component. Vitest doesn't have
      // a Server Component context, so we replace it with a no-op for tests.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    include: [
      "tests/**/*.test.ts",
      "features/**/*.test.ts",
      "shared/**/*.test.ts",
      "components/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["features/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.schema.ts"],
    },
  },
});
