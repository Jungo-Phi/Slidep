import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

// Génère les icônes PWA (192/512, maskable, apple-touch, favicon)
// à partir du logo source. Régénérées au build via le plugin.
export default defineConfig({
  preset: minimal2023Preset,
  images: ["public/slidep-logo.png"],
});
