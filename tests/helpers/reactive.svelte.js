/**
 * Reactive props for a mounted component.
 *
 * `mount(Component, { props })` keeps the object it is given, so passing a
 * plain object means later mutations never reach the component. Passing a
 * `$state` proxy instead mirrors how message-processor drives MessageOverlay,
 * and lets a test exercise the update path. Lives in a `.svelte.js` module
 * because runes are only available there.
 */
export function reactiveProps(initial) {
  const props = $state(initial);
  return props;
}
