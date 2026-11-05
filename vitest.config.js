var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
var RUN_FUZZ = Boolean(process.env.FUZZ) || process.env.npm_lifecycle_event === "test:fuzz";
var RUN_BENCH = Boolean(process.env.BENCH) ||
    process.env.npm_lifecycle_event === "test:bench";
// `*.bench.test.ts` are measurement harnesses, not tests: they print tables and assert almost nothing, and they dominate the runtime.
// Opt in with `npm run test:bench`.
var optional = __spreadArray(__spreadArray([], (RUN_FUZZ ? [] : ["src/**/*.fuzz.test.ts"]), true), (RUN_BENCH ? [] : ["src/**/*.bench.test.ts"]), true);
export default defineConfig({
    plugins: [react()],
    test: {
        // Building a jsdom costs seconds per file and almost nothing here needs one.
        // Tests that touch the DOM opt in with a `// @vitest-environment jsdom` docblock.
        environment: "node",
        include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
        // Fuzzing is slow and non-deterministic, so it stays out of the default run.
        // Opt in with `npm run test:fuzz`, or set FUZZ=1 when calling vitest directly.
        exclude: __spreadArray(["**/node_modules/**"], optional, true),
        globals: false,
        setupFiles: ["src/test/setup.ts"],
        pool: "forks",
    },
});
