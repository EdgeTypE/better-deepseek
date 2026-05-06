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
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { zipSync, strToU8 } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));

const targetArg = process.argv.find(arg => arg.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'chrome';
console.log(`\n🎯 Target: ${target.toUpperCase()}`);

const distFolderName = `dist-${target}`;
const isAndroid = target === "android";

// Vite alias for the platform globals entry imported by src/content/index.js.
// Android swaps in the chrome.* polyfill that routes through the native bridge.
const platformGlobalsFile = isAndroid
  ? "src/platform/globals-android.js"
  : "src/platform/globals-chrome.js";

const sharedResolve = {
  alias: {
    "bds-platform-globals": resolve(__dirname, platformGlobalsFile),
  },
};

const sharedDefine = {
  "process.env.NODE_ENV": '"production"',
  "process.env.BDS_TARGET": JSON.stringify(target),
};

/** @type {Array<import('vite').InlineConfig>} */
const builds = [
  // ── Content Script ──
  {
    plugins: [svelte()],
    resolve: sharedResolve,
    esbuild: {
      charset: 'ascii'
    },
    build: {
      emptyOutDir: true,
      outDir: resolve(__dirname, distFolderName),
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
    define: sharedDefine,
  },

  // ── Background Service Worker (chrome/firefox only) ──
  ...(isAndroid ? [] : [{
    plugins: [],
    resolve: sharedResolve,
    esbuild: {
      charset: 'ascii'
    },
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, distFolderName),
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
    define: sharedDefine,
  }]),

  // ── Injected Script (MAIN world) ──
  {
    plugins: [],
    resolve: sharedResolve,
    esbuild: {
      charset: 'ascii'
    },
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, distFolderName),
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
    define: sharedDefine,
  },

  // ── Sandbox Script (Safe Eval World) ──
  {
    plugins: [],
    resolve: sharedResolve,
    esbuild: {
      charset: 'ascii'
    },
    build: {
      emptyOutDir: false,
      outDir: resolve(__dirname, distFolderName),
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
    define: sharedDefine,
  },
];

async function run() {
  for (const config of builds) {
    await build({ ...config, configFile: false });
  }

  // Copy static folder to dist
  console.log(`📂 Copying static assets to ${distFolderName}...`);
  const distDir = resolve(__dirname, distFolderName);
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

  // Handle manifest based on target. Android has no extension manifest.
  if (!isAndroid) {
  const manifestPath = resolve(__dirname, "static/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (target === "firefox") {
    // Firefox MV3 specific settings
    manifest.browser_specific_settings = {
      gecko: {
        id: "betterdeepseek@goygoyengine.com",
        strict_min_version: "109.0",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    };
    
    // In Firefox MV3, we use 'scripts' because service workers were late to the party.
    // Since our build format is IIFE, we DON'T set type: "module".
    if (manifest.background && manifest.background.service_worker) {
      manifest.background = {
        scripts: [manifest.background.service_worker]
      };
    }

    // Firefox MV3 does not support the 'sandbox' property inside 'content_security_policy'
    if (manifest.content_security_policy) {
      delete manifest.content_security_policy.sandbox;
    }
  }
  
  writeFileSync(
    resolve(distDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  } // end !isAndroid manifest block

  // Copy sandbox.html to root dist (used by all targets — Android iframes still load it)
  copyFileSync(
    resolve(__dirname, "static/sandbox.html"),
    resolve(distDir, "sandbox.html")
  );
  
  console.log("\n🧹 Cleaning non-ASCII characters from bundle...");
  try {
    execSync(`node scripts/sanitize-dist.js --target=${target}`, { stdio: "inherit" });
  } catch (e) {
    console.error("Sanitization failed:", e.message);
  }

  console.log(`\n✅ All builds complete. Output ready in ${distFolderName}/`);

  if (isAndroid) {
    console.log(`\nℹ️  Run scripts/copy-to-android-assets.js to stage the bundle for Gradle.`);
    return;
  }

  // ── Create ZIP Archive ──
  console.log(`\n📦 Creating ZIP archive: better-deepseek-${target}.zip...`);
  try {
    const zipData = {};
    
    function addDirToZipSync(currentPath, zipRoot = "") {
      const items = readdirSync(currentPath);
      for (const item of items) {
        const fullPath = resolve(currentPath, item);
        const zipPath = zipRoot ? `${zipRoot}/${item}` : item;
        
        if (statSync(fullPath).isDirectory()) {
          addDirToZipSync(fullPath, zipPath);
        } else {
          zipData[zipPath] = new Uint8Array(readFileSync(fullPath));
        }
      }
    }

    addDirToZipSync(distDir);
    const zipped = zipSync(zipData);
    writeFileSync(resolve(__dirname, `better-deepseek-${target}.zip`), zipped);
    console.log(`✅ ZIP created successfully: better-deepseek-${target}.zip\n`);
  } catch (e) {
    console.error("❌ ZIP creation failed:", e.message);
  }
}

/**
 * Creates a source code ZIP for Mozilla submission.
 */
async function generateSourceZip() {
  console.log("\n📦 Creating SOURCE CODE archive for Mozilla submission...");
  try {
    const zipData = {};
    const rootFiles = ["build.js", "package.json", "package-lock.json", "README.md", "LICENSE"];
    const rootDirs = ["src", "static", "scripts", "styles"];

    for (const file of rootFiles) {
      const fullPath = resolve(__dirname, file);
      if (existsSync(fullPath)) {
        zipData[file] = new Uint8Array(readFileSync(fullPath));
      }
    }

    function addDirToZipSync(currentPath, zipRoot) {
      const items = readdirSync(currentPath);
      for (const item of items) {
        const fullPath = resolve(currentPath, item);
        const zipPath = `${zipRoot}/${item}`;
        
        if (statSync(fullPath).isDirectory()) {
          addDirToZipSync(fullPath, zipPath);
        } else {
          zipData[zipPath] = new Uint8Array(readFileSync(fullPath));
        }
      }
    }

    for (const dir of rootDirs) {
      const fullPath = resolve(__dirname, dir);
      if (existsSync(fullPath)) {
        addDirToZipSync(fullPath, dir);
      }
    }

    const zipped = zipSync(zipData);
    writeFileSync(resolve(__dirname, "better-deepseek-source.zip"), zipped);
    console.log("✅ Source code ZIP created successfully: better-deepseek-source.zip\n");
    console.log("Submit this file to Mozilla as requested in the 'Source Code' section.");
  } catch (e) {
    console.error("❌ Source ZIP creation failed:", e.message);
  }
}

async function start() {
  const isSource = process.argv.includes("--source");
  if (isSource) {
    await generateSourceZip();
    return;
  }
  await run();
}

start().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
