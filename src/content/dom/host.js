/**
 * Get or create a host container next to a message node.
 */
export function getOrCreateHost(node, hostClass) {
  let wrapper = null;
  let sibling = node.nextElementSibling;
  
  // DeepSeek might insert elements, search siblings up to next ds-message
  // or limit searching to 5 siblings just to be safe.
  let attempts = 0;
  while (sibling && attempts < 10) {
    if (sibling.classList && sibling.classList.contains("ds-message")) break;
    if (sibling.classList && sibling.classList.contains("bds-host-wrapper")) {
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
  }

  let host = wrapper.querySelector(`.${hostClass}`);
  if (!host) {
    host = document.createElement("div");
    host.className = hostClass;
    wrapper.appendChild(host);
  }

  return host;
}
