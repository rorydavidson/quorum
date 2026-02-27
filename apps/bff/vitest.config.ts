import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only discover tests in src/, never the compiled dist/ output.
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // Run before any test file is loaded — sets env vars so module-level
    // initialisations (Knex, etc.) pick up the test configuration.
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/test-setup.ts",
        "src/index.ts", // entry point — not unit-testable without full integration
      ],
    },
  },
});
