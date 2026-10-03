# Remote Config Debug System

## Console API (`__BDS_CONFIG__`)

Isolated-world debug bridge exposed via `window.__BDS_CONFIG__` in MAIN world (DevTools console). All methods return `Promise<T>` — event-based request/response over `bds:debug-api-request` / `bds:debug-api-response` CustomEvents.

| Method | Signature | Returns |
|--------|-----------|---------|
| `raw` | `()` | Merged config object (builtin + remote + overrides) |
| `getFlag` | `(path: string)` → `boolean` | Boolean-coerced value at dot-path (`!!value`) |
| `getConfig` | `(path: string)` → `any` | Raw value at dot-path (unlike `getFlag`, returns the actual value, not coerced to boolean) |
| `applyRemote` | `(patch: object)` → `object` | Deep-merges `patch` into remote overrides, returns new `raw` |
| `replaceRemote` | `(config: object)` → `object` | Replaces all remote overrides, returns new `raw` |
| `resetToBuiltin` | `()` → `object` | Clears remote + overrides, returns builtin defaults |
| `detectModel` | `()` → `"instant" \| "expert" \| "deepthink"` | DOM-based model detection |
| `toggleDebugPanel` | `()` → `true` | Toggles the floating debug UI panel |

### Usage

Open the DevTools console (`F12`) in the MAIN world context and type:

```js
// Open/close the floating debug panel
await __BDS_CONFIG__.toggleDebugPanel();

// Inspect the full merged config
await __BDS_CONFIG__.raw();

// Read a specific flag
await __BDS_CONFIG__.getFlag("features.attachMenu.enabled");

// Override a feature flag at runtime
await __BDS_CONFIG__.applyRemote({ features: { attachMenu: { enabled: false } } });
```


### Bridge Architecture

```
DevTools console          injected.js (MAIN)              content/index.js (ISOLATED)
  │                            │                                   │
  │ __BDS_CONFIG__.getFlag()   │                                   │
  │ ─────────────────────────► │                                   │
  │                            │ dispatch CustomEvent              │
  │                            │ bds:debug-api-request ──────────► │
  │                            │                                   │ remoteConfig.getFlag()
  │                            │                                   │ dispatch response
  │                            │ ◄──────── bds:debug-api-response  │
  │ ◄───────────────────────── │                                   │
```

Functions cannot cross isolated-world boundary (structured clone strips them). Each bridge call:
1. Generates a unique `id`
2. Stores `resolve` in `pending` Map
3. Dispatches `bds:debug-api-request` with `{ id, method, args }`
4. Content script switch-case executes the method
5. Dispatches `bds:debug-api-response` with `{ id, result }`
6. Injected script matches `id`, calls `resolve(result)`

### Handler Registration (`src/content/index.js:70`)

```js
window.addEventListener("bds:debug-api-request", (e) => {
  // detail may be stringified when crossing isolated-world boundary (Firefox Xray)
  let detail = e.detail;
  if (typeof detail === "string") { try { detail = JSON.parse(detail); } catch { return; } }
  const { id, method, args } = detail || {};
  let result;
  try {
    switch (method) {
      case "getRaw":          result = remoteConfig.raw; break;
      case "getFlag":         result = remoteConfig.getFlag(args?.[0]); break;
      case "getConfig":       result = remoteConfig.getConfig(args?.[0]); break;
      case "applyRemote":     remoteConfig.applyRemote(args?.[0]); result = remoteConfig.raw; break;
      case "replaceRemote":   remoteConfig.replaceRemote(args?.[0]); result = remoteConfig.raw; break;
      case "resetToBuiltin":  remoteConfig.resetToBuiltin(); result = remoteConfig.raw; break;
      case "detectModel":     result = detectModelType(); break;
      case "toggleDebugPanel":
        window.dispatchEvent(new CustomEvent("bds:toggle-debug-panel"));
        result = true;
        break;
    }
  } catch (err) { result = { __error: err.message }; }
  window.dispatchEvent(new CustomEvent("bds:debug-api-response", {
    detail: JSON.stringify({ id, result }),
  }));
});
```

## Debug UI Panel

Floating Svelte 5 panel (`src/content/ui/ConfigDebugPanel.svelte`) mounted alongside the main UI in `mountUi()`.

### Mounting (`src/content/ui/mount.js:33`)

```js
const debugRoot = document.createElement("div");
debugRoot.id = "bds-config-debug";
document.body.appendChild(debugRoot);
mount(ConfigDebugPanel, { target: debugRoot });
```

Always mounted on init; hidden by default (`visible = false`). Toggle via `bds:toggle-debug-panel` CustomEvent or console command.

### Panel Tabs

| Tab | Content |
|-----|---------|
| **Features** | All feature flags from `configSnapshot.features` with toggle switches. Nested objects render as indented sub-rows. Non-boolean values display as read-only text. |
| **AttachMenu** | Current-model-aware attachMenu flags (derived from `detectModelType()`). Separate independent override section for Expert Mode. |
| **Raw JSON** | Pending overrides (left pane) + merged config snapshot (right pane). |

### State Machine

```
visible=false ──► bds:toggle-debug-panel ──► visible=true
                    Apply Overrides ──► remoteConfig.applyRemote(pendingOverrides)
                    Reset to Defaults ──► remoteConfig.resetToBuiltin()
                    Refresh ──► configSnapshot = remoteConfig.raw
```

`pendingOverrides` is local state — not applied until "Apply Overrides" is clicked. This allows batch toggling.

### Styling

Uses `--bds-*` CSS custom properties defined in `src/styles/content.css`:

- `--bds-bg-panel` / `--bds-bg-elevated`: panel backgrounds
- `--bds-border`: borders and separators
- `--bds-accent`: active tab underline, toggle switch checked state, apply button
- `--bds-danger`: reset button
- `--bds-text-primary` / `--bds-text-secondary` / `--bds-text-tertiary`: text hierarchy
- `--bds-shadow`: panel shadow
- `--bds-radius`: border radius
- `--bds-transition`: hover/active transitions

Automatically adapts to dark/light theme via the global `data-theme` attribute handled by `theme.js`.

## File Reference

| File | Role |
|------|------|
| `src/content/ui/ConfigDebugPanel.svelte` | Floating debug panel component |
| `src/content/ui/mount.js` | Mounts panel alongside main UI |
| `src/content/index.js` | Event bridge handler for `toggleDebugPanel` |
| `src/injected/index.js` | `__BDS_CONFIG__.toggleDebugPanel` registration |
| `src/lib/remote-config.svelte.js` | `RemoteConfigManager`, `detectModelType()` |
| `src/lib/constants.js` | `DEFAULT_REMOTE_CONFIG` |
| `src/styles/content.css` | `--bds-*` CSS custom properties |
