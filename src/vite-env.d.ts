/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** App version, injected at build time from package.json. */
declare const __APP_VERSION__: string;

declare module "*.svg" {
  const src: string;
  export default src;
}
