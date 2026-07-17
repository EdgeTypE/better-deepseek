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
const wrapperOwner = new WeakMap();

function adoptWrapper(wrapper, node) {
  const previousOwner = wrapperOwner.get(wrapper);
  if (previousOwner && previousOwner !== node) {
    hostWrappers.delete(previousOwner);
  }
  wrapperOwner.set(wrapper, node);
  hostWrappers.set(node, wrapper);
}

/**
 * Get or create the bds-host-wrapper for a message node.
 * A cached wrapper that is still in the document and adjacent to the message
 * is reused as-is. If the message has moved, the wrapper is reinserted
 * immediately after the message in its new parent.
 */
export function getOrCreateWrapper(node) {
  let wrapper = hostWrappers.get(node);

  // Validate: wrapper must still be in the document, and its owner must
  // still point to this message (prevents adoption by a different message).
  if (wrapper && document.contains(wrapper) && wrapperOwner.get(wrapper) === node) {
    // Ensure adjacency — if reparented, move wrapper with the message
    if (wrapper.previousElementSibling !== node) {
      node.insertAdjacentElement("afterend", wrapper);
    }
    return wrapper;
  }

  // Search existing siblings for a pre-existing but unowned wrapper
  let sibling = node.nextElementSibling;
  let attempts = 0;
  while (sibling && attempts < 10) {
    if (sibling.classList?.contains("ds-message")) break;
    if (sibling.classList?.contains("bds-host-wrapper") && !wrapperOwner.has(sibling)) {
      wrapper = sibling;
      break;
    }
    sibling = sibling.nextElementSibling;
    attempts++;
  }

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "bds-host-wrapper";
    node.insertAdjacentElement("afterend", wrapper);
  } else {
    // Reinsert adjacency if needed
    if (wrapper.previousElementSibling !== node) {
      node.insertAdjacentElement("afterend", wrapper);
    }
  }

  adoptWrapper(wrapper, node);
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
 * Deletes the wrapper only when childElementCount reaches zero.
 * Unknown/sibling hosts (tool hosts, etc.) are preserved.
 */
export function removeMessageHost(node, hostClass) {
  const wrapper = hostWrappers.get(node);
  if (!wrapper || !document.contains(wrapper)) return;
  const host = wrapper.querySelector(`.${hostClass}`);
  if (host) host.remove();
  if (wrapper.childElementCount === 0) {
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
