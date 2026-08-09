import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const RUN_FUZZ =
  Boolean(process.env.FUZZ) || process.env.npm_lifecycle_event === "test:fuzz";
const RUN_BENCH =
  Boolean(process.env.BENCH) ||
  process.env.npm_lifecycle_event === "test:bench";

// `*.bench.test.ts` are measurement harnesses, not tests: they print tables and assert
// almost nothing, and they dominate the runtime. Opt in with `npm run test:bench`.
const optional = [
  ...(RUN_FUZZ ? [] : ["src/**/*.fuzz.test.ts"]),
  ...(RUN_BENCH ? [] : ["src/**/*.bench.test.ts"]),
];

export default defineConfig({
  plugins: [react()],
  test: {
    // Building a jsdom costs seconds per file and almost nothing here needs one. Tests that touch the DOM opt in with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    // Fuzzing is slow and non-deterministic, so it stays out of the default run. Opt in with `npm run test:fuzz`, or set FUZZ=1 when calling vitest directly.
    exclude: ["**/node_modules/**", ...optional],
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    pool: "forks",
  },
});
