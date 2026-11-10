import { defineConfig } from "vite";

// `vite build` makes the drop-in browser script for script tags and CDNs.
// `vite build --mode lib` makes the ES module for bundlers, leaving dependencies to the bundler.
// `vite build --mode site` builds index.html separately from the published package.
export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "YVP_"],
  server: { host: true, allowedHosts: true },
  plugins: [{
    name: "legacy-embed-filename",
    generateBundle(_options, bundle) {
      const embed = bundle["bible-sdk.js"];
      if (embed?.type === "chunk") {
        this.emitFile({ type: "asset", fileName: "scripture-inline.js", source: embed.code });
      }
    },
  }],
  build:
    mode === "site"
      ? { outDir: "dist-site" }
      : mode === "lib"
        ? {
            emptyOutDir: false,
            lib: {
              entry: {
                index: "src/index.ts", data: "src/data.ts",
                "data/effect": "src/data-effect.ts",
                "providers/helloao": "src/providers/helloao.ts",
                "providers/youversion": "src/providers/youversion.ts",
                "providers/fetch-bible": "src/providers/fetch-bible.ts",
                "providers/api-bible": "src/providers/api-bible.ts",
              },
              formats: ["es"], fileName: (_format, name) => `${name}.js`,
            },
            rolldownOptions: { external: [/^@youversion\//, /^@gracious\.tech\//, /^effect(?:\/|$)/, "free-use-bible-api", "grab-bcv", "sanitize-html"] },
          }
        : {
            lib: { entry: "src/embed.ts", name: "BibleSDK", formats: ["iife"], fileName: () => "bible-sdk.js" },
          },
}));
