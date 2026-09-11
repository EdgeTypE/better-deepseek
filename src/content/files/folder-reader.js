/**
 * Folder Reader
 * Prompts user for a directory, recursively reads all readable code/text files,
 * and concatenates them into a single File object.
 */

import { pickFolderSelection } from "../../lib/utils/folder-picker.js";
import appState from "../state.js";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_FOLDER_IMAGES = 10;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

export async function pickFolderAndConcatenate(options = {}) {
  const selection = await pickFolderSelection({
    processGitignore: Boolean(appState.settings.processGitignoreOnUpload),
  });
  if (!selection) {
    return null;
  }

  const allFiles = selection.files.slice();
  allFiles.sort((a, b) => a.path.localeCompare(b.path));

  const imageFiles = [];
  let skippedImages = 0;
  if (options.includeImages) {
    for (const file of allFiles) {
      if (!isImageFile(file.name)) continue;
      if (file.size > MAX_IMAGE_SIZE) {
        skippedImages += 1;
        continue;
      }
      if (imageFiles.length >= MAX_FOLDER_IMAGES) {
        skippedImages += 1;
        continue;
      }
      imageFiles.push(file);
    }
  }

  // Add file tree at the top
  let concatText = generateTree(allFiles);
  concatText += "\n\n========================================\n\n";
  let textFileCount = 0;

  for (const file of allFiles) {
    if (!isTextFile(file.name)) {
      continue;
    }

    if (file.size > 2 * 1024 * 1024) {
      continue;  // skip files > 2MB to avoid freezing
    }

    try {
      const text = await file.text();

      if (text.indexOf("\0") !== -1) {
        continue;
      }

      concatText += `\n\n--- [FILE: ${file.path}] ---\n\n`;
      concatText += text;
      textFileCount += 1;
    } catch (e) {
      console.warn(`Could not read ${file.path}`, e);
    }
  }

  const workspaceFile = textFileCount
    ? new File(
        [new Blob([concatText], { type: "text/plain" })],
        `${selection.rootName || "folder"}_workspace.txt`,
        { type: "text/plain" },
      )
    : null;
  return { workspaceFile, imageFiles, skippedImages };
}

function generateTree(allFiles) {
  const tree = {};
  for (const file of allFiles) {
    if (!isTextFile(file.name)) continue;
    const parts = file.path.split("/");
    let current = tree;
    for (const part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }

  let output = "Directory Tree:\n";
  
  function printTree(node, prefix = "") {
    const keys = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.localeCompare(b);
    });

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      const marker = isLast ? "└── " : "├── ";
      output += prefix + marker + key + "\n";
      
      const children = node[key];
      if (Object.keys(children).length > 0) {
        printTree(children, prefix + (isLast ? "    " : "│   "));
      }
    }
  }

  printTree(tree);
  return output;
}

function isTextFile(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const textExts = [
    "js", "ts", "jsx", "tsx", "svelte", "vue", "html", "css", "scss", "json",
    "md", "txt", "py", "c", "cpp", "h", "hpp", "java", "go", "rs", "rb", "php",
    "sh", "yml", "yaml", "toml", "ini", "csv", "sql", "xml", "env",
    "cs", "csproj", "sln", "fs", "fsproj", "razor", "swift", "kt", "dart",
    "nix"
  ];
  return textExts.includes(ext);
}

function isImageFile(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
