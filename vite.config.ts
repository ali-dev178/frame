import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import { VitePWA } from "vite-plugin-pwa";

// Two build targets, one codebase:
//   default mode  → pure web app, installable as a PWA (fully offline)
//   --mode desktop → same renderer + Electron main/preload → dist-electron/
//     (no service worker in Electron — assets are local files already)
export default defineConfig(({ mode }) => ({
  base: "./", // relative asset paths — required for Electron's file:// loading
  // separate outDirs so the Electron app can never accidentally ship the
  // PWA build (service worker registration fails on file://)
  build: { target: "es2022", outDir: mode === "desktop" ? "dist" : "dist-web" },
  plugins:
    mode === "desktop"
      ? [
          electron({
            main: {
              entry: "electron/main.ts",
              vite: {
                build: {
                  outDir: "dist-electron",
                  rollupOptions: { output: { format: "es" } },
                },
              },
            },
            preload: {
              // sandboxed preloads must be a single CJS file
              input: "electron/preload.ts",
              vite: {
                build: {
                  outDir: "dist-electron",
                  rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
                },
              },
            },
          }),
        ]
      : [
          VitePWA({
            registerType: "autoUpdate",
            manifest: {
              name: "Frame",
              short_name: "Frame",
              description: "Fit photos into any social format — losslessly — and turn them into videos with your music.",
              theme_color: "#15140f",
              background_color: "#15140f",
              display: "standalone",
              icons: [
                { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
              ],
            },
          }),
        ],
}));
