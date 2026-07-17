/**
 * Centralized message host ownership.
 *
 * Every message node gets at most one bds-host-wrapper element (tracked via
 * WeakMap). Feature hosts (.bds-overlay-host, .bds-file-host, etc.) live
 * inside the wrapper. This module is the single source of truth for host
 * lifecycle — other modules call these helpers rather than creating their
 * own wrapper/container elements.
 */

const hostWrappers = new WeakMap();

/**
 * Get or create the bds-host-wrapper for a message node.
 */
export function getOrCreateWrapper(node) {
  let wrapper = hostWrappers.get(node);
  if (!wrapper || !document.contains(wrapper)) {
    // Search existing siblings for an existing wrapper
    let sibling = node.nextElementSibling;
    let attempts = 0;
    while (sibling && attempts < 10) {
      if (sibling.classList?.contains("ds-message")) break;
      if (sibling.classList?.contains("bds-host-wrapper")) {
        wrapper = sibling;
        break;
      }
      sibling = sibling.nextElementSibling;
      attempts++;
    }

    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "bds-host-wrapper";
      wrapper.style.display = "contents";
      node.insertAdjacentElement("afterend", wrapper);
    }
    hostWrappers.set(node, wrapper);
  }
  return wrapper;
}

/**
 * Get or create a specific feature host inside the message wrapper.
 */
export function getOrCreateHost(node, hostClass) {
  const wrapper = getOrCreateWrapper(node);

  let host = wrapper.querySelector(`.${hostClass}`);
  if (!host) {
    host = document.createElement("div");
    host.className = hostClass;
    wrapper.appendChild(host);
  }

  return host;
}

/**
 * Remove a specific feature host from a message wrapper.
 * Deletes the wrapper if it becomes empty.
 */
export function removeMessageHost(node, hostClass) {
  const wrapper = hostWrappers.get(node);
  if (!wrapper || !document.contains(wrapper)) return;
  const host = wrapper.querySelector?.(`.${hostClass}`);
  if (host) host.remove();
  if (!wrapper.querySelector(".bds-overlay-host, .bds-file-host, .bds-download-card")) {
    wrapper.remove();
    hostWrappers.delete(node);
  }
}

/**
 * Remove the wrapper and all its hosts for a message node.
 * Used during detached-message disposal.
 */
export function removeAllMessageHosts(node) {
  const wrapper = hostWrappers.get(node);
  if (wrapper) {
    wrapper.remove();
    hostWrappers.delete(node);
  }
}
