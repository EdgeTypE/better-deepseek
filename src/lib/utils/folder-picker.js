/**
 * Folder Picker
 * Handles browser-specific folder selection and returns a normalized file list.
 */

export async function pickFolderSelection() {
  if (supportsDirectoryPicker()) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      await readDirectoryHandle(dirHandle, dirHandle.name, files);
      return {
        rootName: dirHandle.name || "folder",
        files,
      };
    } catch (err) {
      if (isAbortError(err)) {
        return null;
      }
      throw err;
    }
  }

  return await pickFolderSelectionWithInput();
}

async function pickFolderSelectionWithInput() {
  if (!supportsDirectoryInput()) {
    throw new Error("Folder uploads are not supported in this browser.");
  }

  // Make hidden input field and trigger click to open folder picker dialog
  return await new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.setAttribute("mozdirectory", "");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";

    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    const finish = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const handleChange = async () => {
      try {
        const files = await collectFilesFromInput(input);
        const selectedFiles = files.filter((file) => shouldKeepPath(file.path));

        if (!selectedFiles.length) {
          finish(null);
          return;
        }

        finish({
          rootName: inferRootName(selectedFiles),
          files: selectedFiles,
        });
      } catch (err) {
        console.warn("[FolderPicker] Could not read folder selection:", err);
        finish(null);
      }
    };

    const handleCancel = () => {
      finish(null);
    };

    input.addEventListener("change", handleChange, { once: true });
    input.addEventListener("cancel", handleCancel, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function collectFilesFromInput(input) {
  const entries = Array.from(input.webkitEntries || []);
  if (entries.length) {
    const files = [];
    for (const entry of entries) {
      await readEntryRecursively(entry, "", files);
    }
    return files;
  }

  return Array.from(input.files || []).map((file) => {
    file.path = file.webkitRelativePath || file.name;
    return file;
  });
}

async function readEntryRecursively(entry, parentPath, outFiles) {
  const entryPath = joinPath(parentPath, entry.name);
  if (!shouldKeepPath(entryPath)) {
    return;
  }

  if (entry.isFile) {
    try {
      const file = await entryToFile(entry);
      file.path = normalizePath(entry.fullPath || entryPath);
      outFiles.push(file);
    } catch (err) {
      console.warn(`Skipping file ${entryPath} due to error:`, err);
    }
    return;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    while (true) {
      const batch = await readEntries(reader);
      if (!batch.length) {
        break;
      }

      for (const child of batch) {
        await readEntryRecursively(child, entryPath, outFiles);
      }
    }
  }
}

function readDirectoryHandle(dirHandle, path, allFiles) {
  return (async () => {
    for await (const entry of dirHandle.values()) {
      const entryPath = `${path}/${entry.name}`;
      if (!shouldKeepPath(entryPath)) {
        continue;
      }

      if (entry.kind === "file") {
        try {
          const file = await entry.getFile();
          file.path = entryPath;
          allFiles.push(file);
        } catch (fileErr) {
          console.warn(`Skipping file ${entryPath} due to error:`, fileErr);
        }
      } else if (entry.kind === "directory") {
        await readDirectoryHandle(entry, entryPath, allFiles);
      }
    }
  })().catch((dirErr) => {
    console.warn(`Could not read directory ${path}:`, dirErr);
  });
}

function entryToFile(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

function joinPath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name;
}

function normalizePath(path) {
  return String(path || "").replace(/^\/+/, "");
}

function supportsDirectoryPicker() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function supportsDirectoryInput() {
  if (typeof document === "undefined") {
    return false;
  }

  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

function inferRootName(files) {
  if (!files.length) {
    return "folder";
  }

  const firstPath = files[0].path || files[0].webkitRelativePath || files[0].name || "";
  const rootName = firstPath.split("/")[0];
  return rootName || "folder";
}

function shouldKeepPath(path) {
  const segments = String(path || "").split("/");
  for (const segment of segments) {
    if (
      segment === "node_modules" ||
      segment === ".git" ||
      segment === ".github" ||
      segment === "dist" ||
      segment === "build" ||
      segment === ".idea" ||
      segment === ".vscode" ||
      segment === ".vs" ||
      segment === "bin" ||
      segment === "obj" ||
      segment === "out" ||
      segment === "target" ||
      segment === "dist-chrome" ||
      segment === "dist-firefox"
    ) {
      return false;
    }
  }

  return true;
}

function isAbortError(err) {
  return err && (err.name === "AbortError" || err.code === 20);
}
