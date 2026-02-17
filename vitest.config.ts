import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    pool: "forks",
  },
});
