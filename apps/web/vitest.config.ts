import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Transform JSX/TSX via esbuild's automatic runtime (no @vitejs/plugin-react
  // needed for Testing Library, and it sidesteps vite/plugin version clashes).
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      // Mirror the tsconfig path aliases so component imports resolve in tests.
      '@snomed/types': path.resolve(dir, '../../packages/types/src/index.ts'),
      '@': path.resolve(dir, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Component/unit tests only — E2E lives under /e2e and runs via Playwright.
    include: ['components/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
});
