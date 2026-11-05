var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
var version = JSON.parse(readFileSync("./package.json", "utf-8")).version;
/**
 * Makes the dev server answer worker scripts with their body rather than a 304.
 *
 * Firefox hands the worker loader an empty source when a module worker's script comes back as a 304, and the only symptom is a simulation that sits at t=0 behind a bare `error` event.
 */
var workerFileNo304 = {
    name: "worker-file-no-304",
    apply: "serve",
    configureServer: function (server) {
        server.middlewares.use(function (req, _res, next) {
            var _a;
            if ((_a = req.url) === null || _a === void 0 ? void 0 : _a.includes("worker_file"))
                delete req.headers["if-none-match"];
            next();
        });
    },
};
/**
 * `npm run build:profile` (`vite build --mode profile`) ships the profiling build of React with function names kept, so the React DevTools profiler works on a production bundle and names what it measures.
 * Nothing else changes: the timings stay those of a production build.
 */
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return (__assign(__assign({}, (mode === "profile" && {
        resolve: { alias: [{ find: /^react-dom$/, replacement: "react-dom/profiling" }] },
        esbuild: { keepNames: true },
    })), { define: { __APP_VERSION__: JSON.stringify(version) }, plugins: [
            workerFileNo304,
            react(),
            VitePWA({
                // A new build takes control as soon as it is installed; src/utils/service-worker.ts decides when the page reloads to pick it up.
                registerType: "autoUpdate",
                // Icons and their <link> tags come from pwa-assets.config.ts.
                pwaAssets: { config: true },
                // Off in `vite dev`: the worker claims the page while its modules are still loading, and a fetch it takes over can come back empty — the simulation worker's script among them, which leaves the clock frozen at zero and says nothing.
                // Turn it on to exercise the offline behaviour, and restart the server.
                devOptions: { enabled: false },
                workbox: {
                    // Precaches the whole built app shell, local fonts and any wasm among them.
                    globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
                    // Offline navigation: serves index.html for any route it does not know.
                    navigateFallback: "index.html",
                    // The 3D prototype is a separate app the deploy copies into /3d/, after this build has listed what to precache.
                    navigateFallbackDenylist: [/^\/3d(\/|$)/],
                    cleanupOutdatedCaches: true,
                },
                manifest: {
                    name: "Slidep",
                    description: "Conception et simulation de mécanismes",
                    lang: "fr",
                    theme_color: "#d7530b",
                    background_color: "#fdecc9",
                    display: "standalone",
                    orientation: "any",
                    start_url: "/",
                    scope: "/",
                    // Bump `?v=` whenever the source logo changes: installed desktop PWAs only refresh their launcher icon when the manifest URLs differ, not the bytes.
                    icons: [
                        { src: "pwa-64x64.png?v=2", sizes: "64x64", type: "image/png" },
                        { src: "pwa-192x192.png?v=2", sizes: "192x192", type: "image/png" },
                        { src: "pwa-512x512.png?v=2", sizes: "512x512", type: "image/png" },
                        {
                            src: "maskable-icon-512x512.png?v=2",
                            sizes: "512x512",
                            type: "image/png",
                            purpose: "maskable",
                        },
                    ],
                },
            }),
        ], base: "/" }));
});
