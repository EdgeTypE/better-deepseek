/**
 * Get or create a host container next to a message node.
 */
export function getOrCreateHost(node, hostClass) {
  let wrapper = node.nextElementSibling;
  if (
    !wrapper ||
    !wrapper.classList ||
    !wrapper.classList.contains("bds-host-wrapper")
  ) {
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
