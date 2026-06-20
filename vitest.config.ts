import { defineConfig } from "vitest/config";

// Standalone Vitest config so the app's custom Lovable vite.config.ts is not
// loaded for tests. The pure modules under test (simulation, standings) need
// no DOM or plugins.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
