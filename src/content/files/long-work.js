/**
 * LONG_WORK file collection and finalization.
 */

import state from "../state.js";
import { normalizeFilePath } from "../../lib/utils/file-path.js";
import { buildTimestamp } from "../../lib/utils/helpers.js";
import { triggerBlobDownload } from "../../lib/utils/download.js";
import { buildZip } from "../../lib/zip.js";
import { getOrCreateHost } from "../dom/host.js";
import { buildDownloadCard } from "../tools/common.js";
import { emitStandaloneFiles } from "./standalone.js";

/**
 * Collect files into the LONG_WORK buffer.
 */
export function collectLongWorkFiles(createFiles) {
  for (const item of createFiles) {
    const normalizedPath = normalizeFilePath(item.fileName);
    if (!normalizedPath) {
      continue;
    }
    state.longWork.files.set(normalizedPath, String(item.content || ""));
  }
}

/**
 * Finalize LONG_WORK — zip all collected files and present download.
 */
export function finalizeLongWork(node) {
  state.longWork.active = false;
  state.longWork.lastActivityAt = 0;

  const entries = Array.from(state.longWork.files.entries()).map(
    ([path, content]) => ({ path, content })
  );
  state.longWork.files.clear();

  if (!entries.length) {
    if (state.ui) {
      state.ui.showToast("LONG_WORK finished. No files were produced.");
    }
    return;
  }

  const success = emitZipForFiles(node, entries);
  if (success) {
    if (state.settings.autoDownloadLongWorkZip) {
      // Find the blob we just created? Actually, we'll need to handle it better.
      // For now, let's just use the toast.
    }

    if (state.ui) {
      state.ui.showToast(
        `LONG_WORK complete: ${entries.length} files zipped.`
      );
    }
  }
}

/**
 * Emit a ZIP download card for a specific set of files.
 * Useful for historical messages where we don't use the global state buffer.
 */
export function emitZipForFiles(node, entries) {
  if (!entries || !entries.length) return false;

  try {
    const host = getOrCreateHost(node, "bds-file-host");
    
    // Clear any previously emitted ZIP cards for this node to make this idempotent
    host.innerHTML = '';
    
    const zipBlob = buildZip(entries);
    const zipName = `better-deepseek-${buildTimestamp()}.zip`;

    host.appendChild(
      buildDownloadCard({
        title: "LONG_WORK project",
        description: `${entries.length} files packaged`,
        fileName: zipName,
        blob: zipBlob,
      })
    );
    return true;
  } catch (error) {
    console.error("ZIP emit error:", error);
    emitStandaloneFiles(
      node,
      entries.map((entry) => ({
        fileName: entry.path,
        content: entry.content,
      }))
    );
    return false;
  }
}
