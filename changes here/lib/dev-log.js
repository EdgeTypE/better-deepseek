let enabled = false

/**
 * Enable dev logging from the browser console:
 *   localStorage.setItem("bds:devlog", "true")   → enable
 *   localStorage.removeItem("bds:devlog")         → disable (after refresh)
 *
 * Refresh the page after changing the value.
 */
export function setDevLogging(on) {
  enabled = on
}

export function devLog(tag, ...args) {
  if (!enabled) return
  console.log(`[BDS:${tag}]`, ...args)
}
