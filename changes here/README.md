# better-deepnote (0.1.29)

Enhanced UX layer for DeepSeek chat (hidden prompts, tools, memory, document generation, chat-history docking, and long-work packaging).

## UI Preview

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 520" font-family="Segoe UI, Arial, sans-serif">
  <rect x="0" y="0" width="820" height="520" fill="#f5f6f8"/>
  <rect x="0" y="0" width="820" height="44" fill="#1f2430"/>
  <circle cx="22" cy="22" r="8" fill="#4f46e5"/>
  <text x="40" y="27" fill="#ffffff" font-size="14">DeepSeek</text>
  <rect x="16" y="62" width="540" height="432" rx="10" fill="#ffffff" stroke="#e3e3e8" stroke-width="1"/>
  <rect x="36" y="94" width="220" height="46" rx="10" fill="#eef0f4"/>
  <text x="52" y="122" fill="#555555" font-size="13">User prompt…</text>
  <rect x="300" y="168" width="240" height="120" rx="10" fill="#eef2ff"/>
  <text x="316" y="198" fill="#333333" font-size="12">Assistant reply…</text>
  <text x="316" y="220" fill="#333333" font-size="12">with BDS enhancements…</text>
  <rect x="36" y="322" width="300" height="40" rx="20" fill="#ffffff" stroke="#d0d0d8" stroke-width="1"/>
  <text x="56" y="347" fill="#999999" font-size="12">Type a message…</text>
  <rect x="576" y="0" width="244" height="520" fill="#232838"/>
  <rect x="576" y="0" width="4" height="520" fill="#4f46e5"/>
  <text x="596" y="30" fill="#ffffff" font-size="14" font-weight="bold">Better DeepSeek</text>
  <text x="792" y="30" fill="#9aa0ad" font-size="16" text-anchor="end">✕</text>
  <line x1="596" y1="44" x2="800" y2="44" stroke="#3a4060" stroke-width="1"/>
  <g fill="#c9cedb" font-size="12">
    <text x="596" y="72">⚙  Settings</text>
    <text x="596" y="96">✦  Skills</text>
    <text x="596" y="120">☻  Characters</text>
    <text x="596" y="144">✿  Memory</text>
    <text x="596" y="168">▣  Projects</text>
    <text x="596" y="192">▢  Saved Items</text>
  </g>
  <line x1="596" y1="208" x2="800" y2="208" stroke="#3a4060" stroke-width="1"/>
  <text x="596" y="232" fill="#ffffff" font-size="13" font-weight="bold">Chat History</text>
  <rect x="596" y="244" width="200" height="34" rx="6" fill="#2c3346"/>
  <text x="606" y="265" fill="#dfe3ee" font-size="11">"Explain quantum… "</text>
  <rect x="596" y="284" width="200" height="34" rx="6" fill="#2c3346"/>
  <text x="606" y="305" fill="#dfe3ee" font-size="11">"Write a haiku… "</text>
  <text x="800" y="332" fill="#4f46e5" font-size="11" text-anchor="end">Clear</text>
  <line x1="596" y1="356" x2="800" y2="356" stroke="#3a4060" stroke-width="1"/>
  <text x="596" y="380" fill="#c9cedb" font-size="12">⚡  Commands</text>
  <text x="596" y="504" fill="#8b91a3" font-size="10">github.com/EdgeTypE/better-deepseek</text>
</svg>

<img width="1493" height="862" alt="Screenshot 2026-08-22 031402" src="https://github.com/user-attachments/assets/5d4f2408-9737-4d11-9423-d57df33ae913" />


<img width="625" height="878" alt="Screenshot 2026-08-22 031323" src="https://github.com/user-attachments/assets/c0dfc47d-30f2-4ca6-b2f4-42a1d34da89c" />



## Build

1. `npm install`
2. `npm run build:firefox`
   - Output goes to `dist-firefox/`

## Load as temporary add-on (for testing)

1. Open Firefox and go to `about:debugging`.
2. Click **This Firefox** (left sidebar).
3. Click **Load Temporary Add-on**.
4. Select `dist-firefox/manifest.json`.
5. The extension is active until you restart Firefox.

## Sign a permanent .xpi (Route A, unlisted)

1. Create a Mozilla account at https://addons.mozilla.org.
2. Go to https://addons.mozilla.org/developers/ -> **Tools** -> **Manage API Keys** -> **Generate New Key**.
3. Copy the **API Key** and **API Secret** (shown only once).
4. In a terminal at the project root, run:
   ```
   npx web-ext sign --source-dir dist-firefox --channel=unlisted --api-key=user:YOUR_API_KEY --api-secret=YOUR_API_SECRET
   ```
5. The signed `.xpi` appears in `web-ext-artifacts/`.

## Install the signed .xpi

1. Open the `.xpi` from `web-ext-artifacts/` and drag it into a Firefox window.
2. Click **Add**. It survives Firefox restarts.

## Share

Send the `.xpi` file to anyone; they drag it into Firefox and click **Add**.

## How to Use

| Step | Action |
|------|--------|
| 1 | Click **"Open File"** and select a folder containing `.md` or `.txt` files |
| 2 | Click any file in the list to select it |
| 3 | Click **"View"** to open the file in the editor |
| 4 | The file content is displayed and editable |
| 5 | The AI **constantly reads** the content for context |

---

## Editing and Saving

| Action | Result |
|--------|--------|
| Edit the text in the editor | Changes are saved in the extension's local storage |
| Close the sidebar | Changes are retained in the extension |
| Click the **"Download"** button | Saves the edited file to your computer |
| Overwrite the original file | Replace the existing file on your computer |
