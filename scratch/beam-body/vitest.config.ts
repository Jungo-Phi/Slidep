import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scratch/beam-body/**/*.test.ts"],
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    pool: "forks",
  },
});
