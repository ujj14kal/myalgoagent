import { defineConfig } from "vitest/config";
import path from "path";

// Pure-function unit/regression tests for src/lib/* (indicators, patterns,
// signal evaluation, trading engine) — no React/DOM environment needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
