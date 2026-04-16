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
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {Array<import('vite').InlineConfig>} */
const builds = [
  // ── Content Script ──
  {
    plugins: [svelte()],
    esbuild: {
      charset: 'ascii'
    },
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
      minify: true,
      sourcemap: false,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  },

  // ── Background Service Worker ──
  {
    plugins: [],
    esbuild: {
      charset: 'ascii'
    },
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
      minify: true,
      sourcemap: false,
    },
  },

  // ── Injected Script (MAIN world) ──
  {
    plugins: [],
    esbuild: {
      charset: 'ascii'
    },
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
      minify: true,
      sourcemap: false,
    },
  },

  // ── Sandbox Script (Safe Eval World) ──
  {
    plugins: [],
    esbuild: {
      charset: 'ascii'
    },
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, "dist"),
      rollupOptions: {
        input: resolve(__dirname, "src/sandbox/index.js"),
        output: {
          format: "iife",
          entryFileNames: "sandbox.js",
          inlineDynamicImports: true,
        },
        treeshake: false,
      },
      minify: true,
      sourcemap: false,
    },
  },
];

async function run() {
  for (const config of builds) {
    await build({ ...config, configFile: false });
  }

  // Copy static folder to dist
  console.log("📂 Copying static assets...");
  const distDir = resolve(__dirname, "dist");
  const staticSrc = resolve(__dirname, "static");
  const staticDest = resolve(distDir, "static");
  
  function copyRecursiveSync(src, dest) {
    if (statSync(src).isDirectory()) {
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      readdirSync(src).forEach(childItem => {
        copyRecursiveSync(resolve(src, childItem), resolve(dest, childItem));
      });
    } else {
      copyFileSync(src, dest);
    }
  }

  if (existsSync(staticSrc)) {
    try {
      if (!existsSync(staticDest)) mkdirSync(staticDest, { recursive: true });
      readdirSync(staticSrc).forEach(item => {
        if (item === 'manifest.json' || item === 'sandbox.html') return;
        copyRecursiveSync(resolve(staticSrc, item), resolve(staticDest, item));
      });
    } catch (e) {
      console.warn("Static copy warning:", e.message);
    }
  }

  // Copy manifest to root dist
  copyFileSync(
    resolve(__dirname, "static/manifest.json"),
    resolve(distDir, "manifest.json")
  );

  // Copy sandbox.html to root dist
  copyFileSync(
    resolve(__dirname, "static/sandbox.html"),
    resolve(distDir, "sandbox.html")
  );
  
  console.log("\n🧹 Cleaning non-ASCII characters from bundle...");
  try {
    execSync("node scripts/sanitize-dist.js", { stdio: "inherit" });
  } catch (e) {
    console.error("Sanitization failed:", e.message);
  }

  console.log("\n✅ All builds complete. Extension ready in dist/\n");
}

run().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
