import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone Vitest config so the app's custom Lovable vite.config.ts is not
// loaded for tests. Most modules under test (simulation, standings) are pure
// and need no DOM; component tests (*.test.tsx) opt into jsdom individually
// via a `@vitest-environment jsdom` docblock instead of flipping this default.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
