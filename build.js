/**
 * Multi-entry Vite build script for the Chrome extension.
 * Builds three bundles sequentially: content, background, injected.
 *
 * Uses rollupOptions.input (not lib mode) to avoid aggressive tree-shaking
 * that strips side-effect code like event listeners, DOM mutations,
 * and bridge communication.
 */
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, mkdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Array<import('vite').InlineConfig>} */
const builds = [
  // ── Content Script ──
  {
    plugins: [svelte()],
    build: {
      emptyOutDir: true,
      outDir: resolve(__dirname, "dist"),
      rollupOptions: {
        input: resolve(__dirname, "src/content/index.js"),
        output: {
          format: "iife",
          entryFileNames: "content.js",
          assetFileNames: "content.[ext]",
          inlineDynamicImports: true,
        },
        // Preserve all side-effect code (bridge events, DOM mutations, etc.)
        treeshake: false,
      },
      cssCodeSplit: false,
      minify: false,
      sourcemap: false,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  },

  // ── Background Service Worker ──
  {
    plugins: [],
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, "dist"),
      rollupOptions: {
        input: resolve(__dirname, "src/background/index.js"),
        output: {
          format: "iife",
          entryFileNames: "background.js",
          inlineDynamicImports: true,
        },
        treeshake: false,
      },
      minify: false,
      sourcemap: false,
    },
  },

  // ── Injected Script (MAIN world) ──
  {
    plugins: [],
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, "dist"),
      rollupOptions: {
        input: resolve(__dirname, "src/injected/index.js"),
        output: {
          format: "iife",
          entryFileNames: "injected.js",
          inlineDynamicImports: true,
        },
        treeshake: false,
      },
      minify: false,
      sourcemap: false,
    },
  },
];

async function run() {
  for (const config of builds) {
    await build({ ...config, configFile: false });
  }

  // Copy static manifest.json to dist
  const distDir = resolve(__dirname, "dist");
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  copyFileSync(
    resolve(__dirname, "static/manifest.json"),
    resolve(distDir, "manifest.json")
  );

  console.log("\n✅ All builds complete. Extension ready in dist/\n");
}

run().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
