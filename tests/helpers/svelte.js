import { mount, unmount } from "svelte";

export function renderSvelte(Component, props = {}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const instance = mount(Component, { target, props });

  return {
    target,
    instance,
    cleanup() {
      unmount(instance);
      target.remove();
    },
  };
}

export async function flushUi() {
  await Promise.resolve();
  await Promise.resolve();
}
