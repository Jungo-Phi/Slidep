import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  root,
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["scratch/**/*.test.ts"],
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    pool: "forks",
  },
});
