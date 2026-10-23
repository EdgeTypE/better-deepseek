# Better DeepSeek Android

This directory contains the native Android host app for Better DeepSeek. The app loads `chat.deepseek.com` in a WebView and injects the same Better DeepSeek bundle used by the browser extension.

The canonical Android build and release notes live in the root [README.md](../README.md), under `Development -> Building for Android`.

## Quick start

1. Build and stage the Android-targeted web assets from the repo root:

```bash
npm run build:android
```

2. Build the debug APK from this directory:

```bash
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Notes

- `app/src/main/assets/bds/` is populated by `npm run build:android`.
- `MainActivity.kt` owns the WebView shell and injection lifecycle.
- `WebViewBridge.kt` exposes the native bridge consumed by `src/platform/android-bridge-shim.js`.