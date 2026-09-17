import { readFileSync } from "node:fs";
import { defineConfig, Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

/**
 * Makes the dev server answer worker scripts with their body rather than a 304.
 *
 * Firefox hands the worker loader an empty source when a module worker's script comes back as a 304, and the only symptom is a simulation that sits at t=0 behind a bare `error` event.
 */
const workerFileNo304 = {
  name: "worker-file-no-304",
  apply: "serve",
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.includes("worker_file")) delete req.headers["if-none-match"];
      next();
    });
  },
} as const satisfies Plugin;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
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
  ],
  base: "/",
});
