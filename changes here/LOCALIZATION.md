# Localization Guide

Better DeepSeek supports multiple languages through a lightweight built-in i18n system. All user-facing strings live in JSON files under `src/locales/`. Components import a `t()` function and call it with a key path like `t('settings.save')`. If a key is missing in the active language it falls back to English; if it's missing everywhere the key itself is shown.

## Adding a New Language

Start by cloning the repository and installing dependencies:

```bash
git clone https://github.com/EdgeTypE/better-deepseek.git
cd better-deepseek
npm install
```

### 1. Create a locale file

Copy `src/locales/en.json` to `src/locales/{code}.json` where `{code}` is your language's ISO 639-1 code (e.g., `de`, `fr`, `ja`, `zh`).

### 2. Translate every string

Open your new file and replace the English values with translations. The `updatedAt` field at the top should reflect today's date in ISO 8601 format (`YYYY-MM-DDT00:00:00Z`). The structure inside `messages` must remain identical, keys are never translated, only their values.

Example:
```json
{
  "updatedAt": "2026-05-20T00:00:00Z",
  "messages": {
    "common": {
      "save": "Speichern",
      "cancel": "Abbrechen"
    },
    "settings": {
      "generalSettings": "Allgemeine Einstellungen"
    }
  }
}
```

### 3. Add the language name to the locale files

Add an entry under `messages.language` so it appears in the Settings language picker:

In `en.json`:
```json
"language": {
  "en": "English",
  "tr": "Türkçe",
  "de": "Deutsch"
}
```

In your new `de.json`:
```json
"language": {
  "en": "Englisch",
  "tr": "Türkisch",
  "de": "Deutsch"
}
```

### 4. Build and test

Rebuild the extension:

```bash
npm run build
```

Load the unpacked extension from `dist-chrome`, open the settings drawer, and switch to your language. Every UI string that uses `t()` should now show your translations.

### 5. Check for missing or extra keys

Before submitting, you should run the built-in locale verification script to ensure your translation is fully up-to-date and matches the structure of `en.json`:

```bash
npm run check-locales
```

This utility recursively checks all translation files against `en.json` and outputs a colorized report listing any:
- **Missing Keys**: Keys defined in `en.json` but absent in your file (needs translation).
- **Extra Keys**: Outdated keys still in your file but already removed from `en.json` (can be safely cleaned up).

### Submitting your translation

Open a pull request with your new locale file and the updated `src/locales/en.json`. If you're not comfortable with Git or pull requests, that's fine, just attach your translated JSON file to a [new issue](https://github.com/EdgeTypE/better-deepseek/issues/new) and mention which language it's for. I'll take care of the rest.

## How Language Selection Works

Better DeepSeek has two language selection modes controlled by the **Sync extension language with browser** toggle (`settings.syncLocale`) in the Settings drawer.

- **Auto-sync (default)**: When enabled, the extension ignores any manually saved locale and auto-detects the language on every page load:
  1. DeepSeek's `NEXT_LOCALE` cookie (reflects the language selected on the DeepSeek web UI)
  2. The browser's `navigator.language`
  3. Falls back to the first available locale (English)

- **Manual**: When disabled, the user picks a language from the dropdown. That choice is persisted to `chrome.storage.local` and reused on every page load.

The auto-detection logic runs in `i18n.init()` (`src/lib/i18n.svelte.js`) and is triggered both on extension start and whenever the settings change in another tab. You don't need to do anything special for this feature — once your `.json` file exists in `src/locales/`, it becomes eligible for both auto-detection and the manual picker.

## Remote Language Updates

Better DeepSeek can fetch the latest translations directly from the GitHub repository without requiring an extension update. This ensures users always have access to up-to-date translations even between releases.

**How it works:**

1. On every startup, and when the user clicks **Check for Language Updates** in Settings, the extension fetches the latest locale files from `https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales/`.
2. Each fetched file is compared to the bundled version using its `updatedAt` timestamp. If the remote version is newer, it replaces the bundled one in memory.
3. Updated locale data is persisted in `chrome.storage.local` so it survives browser restarts.
4. The **Reset to Factory Languages** button restores the original bundled translations.

This means a translator can submit a PR, have it merged to `main`, and users can pull the update immediately — no need to wait for a new extension release.

The `updatedAt` field at the top of each locale file is critical for this system. Always set it to the current date when you make changes:

```json
{
  "updatedAt": "2026-05-22T00:00:00Z",
  "messages": { ... }
}
```

## Things to Keep in Mind

- **Do not change the JSON keys** - only the values. The keys are dotted-path identifiers that the code uses to look up translations.
- **Template variables** like `{{version}}`, `{{name}}`, or `{{count}}` must stay exactly as they are, including braces. They are replaced at runtime with dynamic values. Move them around as needed for natural grammar in your language.
- **HTML in values** - some values contain `<strong>` tags or other inline HTML. These are rendered with `{@html ...}` and must be preserved for security and formatting.
- **Plurals** are handled through separate keys, not through complex plural rules. For example, `filesUploaded` and `filesUploadedShort` are distinct keys rather than a single key with plural logic.
- **Not everything needs translation** - strings sent to the AI model (like auto.js messages) are intentionally kept in English.
