/**
 * Native Android file/folder picker bridge.
 *
 * Wraps AndroidBridge.pickFiles in a Promise API. The native side opens an
 * unrestricted Android document picker and returns text-file contents to JS,
 * which avoids WebView accept/MIME filtering problems for extensions such as
 * .md on Android builds that do not know text/markdown.
 */

export function isNativeFilePickerAvailable() {
  return (
    typeof window !== "undefined" &&
    window.AndroidBridge != null &&
    typeof window.AndroidBridge.pickFiles === "function"
  );
}

const PICK_LAUNCH_TIMEOUT_MS = 10000;
const PICK_RETURN_GRACE_MS = 30000;
const PICK_READ_STALL_MS = 120000;
const PICK_ABSOLUTE_CAP_MS = 600000;

export const PICK_ERRORS = {
  TIMEOUT: "picker-timeout",
  STALLED: "read-stalled",
  MALFORMED: "malformed-payload",
};

export function nativePickFiles(mode = "files") {
  return new Promise((resolve, reject) => {
    if (!isNativeFilePickerAvailable()) {
      reject(new Error("[BDS] AndroidBridge.pickFiles not available"));
      return;
    }

    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const eventName = "__bds_native_files_picked_" + requestId;

    const chunks = [];
    let receivedChunks = 0;
    let expectedTotal = null;
    let settled = false;
    let sawProtocolEvent = false;
    let hiddenSinceLastVisible = false;
    let launchTimer = null;
    let returnGraceTimer = null;
    let readStallTimer = null;
    let absoluteTimer = null;

    const clearTimer = (timer) => {
      if (timer) clearTimeout(timer);
    };

    const clearLaunchTimer = () => {
      clearTimer(launchTimer);
      launchTimer = null;
    };

    const clearReturnGraceTimer = () => {
      clearTimer(returnGraceTimer);
      returnGraceTimer = null;
    };

    const clearReadStallTimer = () => {
      clearTimer(readStallTimer);
      readStallTimer = null;
    };

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearLaunchTimer();
      clearReturnGraceTimer();
      clearReadStallTimer();
      clearTimer(absoluteTimer);
      absoluteTimer = null;
      window.removeEventListener(eventName, handler);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      callback();
    };

    const rejectWithCode = (code) => {
      settle(() => reject(new Error(code)));
    };

    const armLaunchTimer = () => {
      if (sawProtocolEvent) return;
      clearLaunchTimer();
      launchTimer = setTimeout(() => rejectWithCode(PICK_ERRORS.TIMEOUT), PICK_LAUNCH_TIMEOUT_MS);
    };

    const armReturnGraceTimer = () => {
      clearReturnGraceTimer();
      returnGraceTimer = setTimeout(() => rejectWithCode(PICK_ERRORS.TIMEOUT), PICK_RETURN_GRACE_MS);
    };

    const armReadStallTimer = () => {
      clearReadStallTimer();
      readStallTimer = setTimeout(() => rejectWithCode(PICK_ERRORS.STALLED), PICK_READ_STALL_MS);
    };

    const parseCompletePayload = () => {
      let payload;
      try {
        payload = JSON.parse(chunks.join(""));
      } catch {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }
      if (payload.error === "cancelled") {
        settle(() => resolve({ files: [], cancelled: true }));
        return;
      }
      if (payload.error) {
        settle(() => reject(new Error(String(payload.error))));
        return;
      }

      settle(() =>
        resolve({
          ...payload,
          files: Array.isArray(payload.files) ? payload.files : [],
          skipped: Array.isArray(payload.skipped) ? payload.skipped : [],
        }),
      );
    };

    const handler = (event) => {
      if (settled) return;
      const detail = event.detail;
      sawProtocolEvent = true;
      clearLaunchTimer();
      clearReturnGraceTimer();

      if (!detail || detail.v !== 2 || typeof detail.kind !== "string") {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }

      if (detail.kind === "status") {
        if (detail.phase !== "opened" && detail.phase !== "reading") {
          rejectWithCode(PICK_ERRORS.MALFORMED);
          return;
        }
        if (detail.phase === "reading") {
          armReadStallTimer();
        }
        return;
      }

      if (detail.kind !== "chunk") {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }

      if (
        !Number.isInteger(detail.seq) ||
        !Number.isInteger(detail.total) ||
        detail.total <= 0 ||
        detail.seq < 0 ||
        detail.seq >= detail.total ||
        typeof detail.data !== "string"
      ) {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }

      if (expectedTotal === null) {
        expectedTotal = detail.total;
      } else if (expectedTotal !== detail.total) {
        rejectWithCode(PICK_ERRORS.MALFORMED);
        return;
      }

      armReadStallTimer();

      if (chunks[detail.seq] === undefined) {
        chunks[detail.seq] = detail.data;
        receivedChunks += 1;
      }

      if (receivedChunks === expectedTotal) {
        parseCompletePayload();
      }
    };

    const visibilityHandler = () => {
      if (settled || typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        hiddenSinceLastVisible = true;
        clearReturnGraceTimer();
        return;
      }
      if (document.visibilityState === "visible" && hiddenSinceLastVisible) {
        hiddenSinceLastVisible = false;
        armReturnGraceTimer();
      }
    };

    window.addEventListener(eventName, handler);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityHandler);
    }

    try {
      window.AndroidBridge.pickFiles(String(mode || "files"), requestId);
      armLaunchTimer();
      absoluteTimer = setTimeout(() => rejectWithCode(PICK_ERRORS.TIMEOUT), PICK_ABSOLUTE_CAP_MS);
    } catch (err) {
      settle(() => reject(err));
    }
  });
}

export function buildFolderFileFromNative(files, folderName) {
  if (!files || files.length === 0) return null;

  const tree = buildPathTree(files.map((file) => file.name));
  let content =
    "Directory Tree:\n" +
    renderPathTree(tree) +
    "\n\n========================================\n\n";

  for (const file of files) {
    content += "\n\n--- [FILE: " + file.name + "] ---\n\n";
    content += file.content;
  }

  const name = (folderName || "folder") + "_workspace.txt";
  const blob = new Blob([content], { type: "text/plain" });
  return new File([blob], name, { type: "text/plain" });
}

function buildPathTree(paths) {
  const tree = {};
  for (const path of paths) {
    const parts = path.split("/");
    let current = tree;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }
  return tree;
}

function renderPathTree(tree, prefix = "") {
  const keys = Object.keys(tree).sort((a, b) => {
    const aIsDir = Object.keys(tree[a]).length > 0;
    const bIsDir = Object.keys(tree[b]).length > 0;
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
    return a.localeCompare(b);
  });

  let output = "";
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const isLast = index === keys.length - 1;
    output += prefix + (isLast ? "`-- " : "|-- ") + key + "\n";
    if (Object.keys(tree[key]).length > 0) {
      output += renderPathTree(tree[key], prefix + (isLast ? "    " : "|   "));
    }
  }
  return output;
}
