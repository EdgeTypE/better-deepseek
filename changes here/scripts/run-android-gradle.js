import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidDir = resolve(__dirname, "..", "android");
const tasks = process.argv.slice(2);

if (!tasks.length) {
  console.error("Usage: node scripts/run-android-gradle.js <gradle-task> [more-tasks]");
  process.exit(1);
}

const command = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(command, ["--no-daemon", ...tasks], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
