import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      // Met à jour le service worker automatiquement quand une nouvelle
      // version est déployée (pas de prompt à l'utilisateur).
      registerType: "autoUpdate",
      // Génère icônes + balises <link> à partir de pwa-assets.config.ts.
      pwaAssets: { config: true },
      // SW actif aussi en `vite dev` pour pouvoir tester le hors-ligne.
      devOptions: { enabled: true },
      workbox: {
        // Pré-cache tous les assets buildés (app shell), y compris le wasm
        // éventuel et les polices locales. Les gros fichiers passent en cache.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // Navigation hors-ligne : sert index.html pour toute route inconnue.
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
      },
    }),
  ],
  base: "/",
});
