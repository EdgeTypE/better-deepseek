/**
 * Standalone file emission — individual file downloads outside LONG_WORK.
 */

import state from "../state.js";
import { simpleHash } from "../../lib/utils/hash.js";
import {
  normalizeFilePath,
  buildCreateFilePackageName,
  guessMimeType,
} from "../../lib/utils/file-path.js";
import { triggerBlobDownload } from "../../lib/utils/download.js";
import { buildZip } from "../../lib/zip.js";
import { getOrCreateHost } from "../dom/host.js";
import { mount } from "svelte";
import DownloadCard from "../ui/DownloadCard.svelte";

/**
 * Emit standalone file download cards for create_file entries.
 */
export function emitStandaloneFiles(node, createFiles) {
  const host = getOrCreateHost(node, "bds-file-host");

  for (const item of createFiles) {
    const normalizedPath = normalizeFilePath(item.fileName);
    if (!normalizedPath) {
      continue;
    }

    const content = String(item.content || "");
    const signature = `${normalizedPath}:${simpleHash(content)}`;
    if (state.processedStandaloneFiles.has(signature)) {
      continue;
    }

    state.processedStandaloneFiles.add(signature);

    const shouldPackagePath = normalizedPath.includes("/");

    let blob;
    let cardTitle;
    let downloadName;
    let description = normalizedPath;

    if (shouldPackagePath) {
      blob = buildZip([{ path: normalizedPath, content }]);
      cardTitle = "Generated file package";
      downloadName = buildCreateFilePackageName(normalizedPath);
      description = `${normalizedPath} (folder path preserved)`;
    } else {
      blob = new Blob([content], { type: guessMimeType(normalizedPath) });
      cardTitle = "Generated file";
      downloadName = normalizedPath;
    }

    mount(DownloadCard, {
      target: host,
      props: {
        title: cardTitle,
        description,
        fileName: downloadName,
        blob,
      }
    });

    if (state.settings.autoDownloadFiles) {
      triggerBlobDownload(blob, downloadName);
    }
  }
}
