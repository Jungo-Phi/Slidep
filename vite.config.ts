import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
        short_name: "Slidep",
        description:
          "Application de conception et simulation de mécanismes mécaniques 2D",
        lang: "fr",
        theme_color: "#DB5000",
        background_color: "#FFFFFF",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
      },
    }),
  ],
  base: "/",
});
