import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

// Two build targets, one codebase:
//   default mode  → pure web app (also the future PWA)
//   --mode desktop → same renderer + Electron main/preload → dist-electron/
export default defineConfig(({ mode }) => ({
  base: "./", // relative asset paths — required for Electron's file:// loading
  build: { target: "es2022" },
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
      : [],
}));
