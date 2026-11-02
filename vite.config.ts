import { defineConfig } from "vite";

// `vite build` makes the drop-in browser script for script tags and CDNs.
// `vite build --mode lib` makes the ES module for bundlers, leaving dependencies to the bundler.
// `vite build --mode site` builds index.html separately from the published package.
export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "YVP_"],
  server: { host: true, allowedHosts: true },
  build:
    mode === "site"
      ? { outDir: "dist-site" }
      : mode === "lib"
        ? {
            emptyOutDir: false,
            lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "index.js" },
            rolldownOptions: { external: [/^@youversion\//, "grab-bcv"] },
          }
        : {
            lib: { entry: "src/embed.ts", name: "ScriptureInline", formats: ["iife"], fileName: () => "scripture-inline.js" },
          },
}));
