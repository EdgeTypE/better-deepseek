# Better DeepSeek (Chrome Extension MVP)

Better DeepSeek improves the UX of https://chat.deepseek.com by injecting a hidden first-message system prompt, parsing special BDS tags, and rendering richer tools in the chat UI.

## Features

- Hidden system prompt injection on first message of each conversation.
- Hidden memory calls injection based on `always` or `called` rules.
- Skill loader from Markdown files with toggleable activation.
- Tool parsing and rendering:
  - `<BDS:HTML>...</BDS:HTML>` -> sandboxed HTML preview card
  - `<BDS:LATEX>...</BDS:LATEX>` -> automatic PDF download + `.tex` fallback
  - `<BDS:run_python_embed>...</BDS:run_python_embed>` -> in-browser Python runner (Pyodide)
- `<BDS:memory_write>key: value, importance: always|called</BDS:memory_write>` persistence.
- `<BDS:create_file fileName="path/to/file.ext">...</BDS:create_file>` file cards + direct download.
- `Bds create file>fileName="..." content="..."` fallback parser.
- Standalone `create_file` with folder paths (e.g. `deneme/test.py`) is auto-packaged into ZIP to preserve directory structure.
- LONG_WORK mode:
  - `<BDS:LONG_WORK>` starts hidden-work overlay
  - all output hidden until `</BDS:LONG_WORK>`
  - collected create_file outputs zipped and offered as a single download.
- Code block download button with language-based file extension (example: python -> `.py`).

## File Structure

- `manifest.json`: Extension config (MV3).
- `background.js`: Background worker for LaTeX PDF compile requests.
- `content.js`: UI, DOM observation, tool parsing, memory/skills management.
- `injected.js`: Page-context `fetch` + `XMLHttpRequest` hook for hidden prompt and memory injection.
- `zip.js`: Lightweight in-browser ZIP builder (store method, no compression).
- `styles.css`: Drawer/tool/overlay styling.

## Installation (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open https://chat.deepseek.com and refresh the page.

## How It Works

1. `content.js` injects `injected.js` into page context.
2. `injected.js` intercepts requests to `/api/v0/chat/completion` over both `fetch` and `XMLHttpRequest`.
3. On first user message per conversation, it prepends:
   - `<BetterDeepSeek>system prompt</BetterDeepSeek>`
4. On each message, it can prepend:
   - `<BDS:SKILLS>...</BDS:SKILLS>` for active skills
   - `<BDS:memory_calls>...</BDS:memory_calls>` for matched memories
5. `background.js` compiles LaTeX via remote endpoint and returns PDF bytes to `content.js`.
6. Incoming assistant text is scanned for BDS tags and rendered in extension cards.

## Notes

- This is an MVP and DeepSeek DOM/API can change.
- If DeepSeek changes request format, update `injected.js` payload mutation logic.
- If DeepSeek changes CSS classes, update selectors in `content.js` role detection.

## Next Iteration Ideas

- Add per-chat export/import of memory and skills.
- Add tool marketplace style plugin registration.
- Add richer stream parsing to avoid transient re-render quirks.
