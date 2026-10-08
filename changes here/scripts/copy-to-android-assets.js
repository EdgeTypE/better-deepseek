/**
 * Stage the dist-android/ bundle into the Gradle assets folder so the
 * Android app can load content.js / injected.js / sandbox.html via
 * WebViewAssetLoader at runtime.
 */
import { resolve, dirname, relative, join } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const srcDir = resolve(repoRoot, "dist-android");
const destDir = resolve(repoRoot, "android/app/src/main/assets/bds");

if (!existsSync(srcDir)) {
  console.error(`[copy-to-android-assets] ${srcDir} does not exist. Run "npm run build:android" first.`);
  process.exit(1);
}

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true, force: true });
}
mkdirSync(destDir, { recursive: true });

let copied = 0;

function copyTree(src, dest) {
  const stats = statSync(src);
  if (stats.isDirectory()) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyTree(join(src, entry), join(dest, entry));
    }
  } else {
    copyFileSync(src, dest);
    copied += 1;
  }
}

copyTree(srcDir, destDir);

console.log(`[copy-to-android-assets] Copied ${copied} files -> ${relative(repoRoot, destDir)}`);
