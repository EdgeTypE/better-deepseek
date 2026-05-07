# Better DeepSeek

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/aabiopennjmopfippagcalmkdjlepdhh?style=for-the-badge&color=blue&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/better-deepseek/aabiopennjmopfippagcalmkdjlepdhh)
[![Firefox Add-ons](https://img.shields.io/amo/v/better-deepseek?style=for-the-badge&color=orange&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en/firefox/addon/better-deepseek/)
[![Latest Build](https://img.shields.io/github/package-json/v/EdgeTypE/better-deepseek?label=Latest%20Build&style=for-the-badge&color=orange)](https://github.com/EdgeTypE/better-deepseek/releases/tag/latest)
[![License](https://img.shields.io/github/license/EdgeTypE/better-deepseek?style=for-the-badge&color=green)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/EdgeTypE/better-deepseek?style=for-the-badge&color=gold)](https://github.com/EdgeTypE/better-deepseek/stargazers)

Better DeepSeek is a browser extension that enhances the DeepSeek chat interface with a powerful set of tools, persistent memory, and a customizable system prompt. It enables DeepSeek to generate files, run code, create presentations, and manage complex projects directly within the conversation, all while keeping your data local and private.

> "Better DeepSeek" is an unofficial, independent, and community-driven open-source extension. It is NOT affiliated with, endorsed by, sponsored by, or officially connected to DeepSeek or DeepSeek AI in any way. All product names, logos, and brands are property of their respective owners.



## Showcase

<p align="center">
  <table align="center">
    <tr>
    <td align="center"><b>Memory Management</b><br><img src="extension/memory.jpg" width="350"></td>
            <td align="center"><b>Webpage Skills</b><br><img src="extension/webpage%20skill.png" width="350"></td>
      <td align="center"><b>Long Work</b><br><img src="extension/longwork.jpg" width="350"></td>
    </tr>
    <tr>
      <td align="center"><b>Persona Creation</b><br><img src="extension/persona.png" width="350"></td>
            <td align="center"><b>Presentations</b><br><img src="extension/presentation.png" width="350"></td>
            <td align="center"><b>Attach Menu</b><br><img src="extension/attachMenu.jpg" width="350"></td>


  
  </table>
</p>

## Features

### Hidden System Prompt
Inject a custom system prompt that guides DeepSeek's behavior without cluttering the chat. The prompt is automatically injected into every conversation and can be edited from the extension's settings panel.

### Tool Tags for Enhanced Output
Better DeepSeek introduces a set of special tags that DeepSeek can use to produce rich, interactive content:

- `<BDS:HTML>...</BDS:HTML>` – Render a full HTML document in a preview card.
- `<BDS:VISUALIZER>...</BDS:VISUALIZER>` – Create high-contrast, monochrome simulations and interactive diagrams using a built-in UI kit.
- `<BDS:create_file fileName="path/to/file.ext">...</BDS:create_file>` – Generate a downloadable file with the specified name and content.
- `<BDS:pptx>...</BDS:pptx>` – Generate a PowerPoint presentation using the PptxGenJS library.
- `<BDS:excel>...</BDS:excel>` – Generate an Excel spreadsheet using SheetJS.
- `<BDS:docx>...</BDS:docx>` – Generate a Word document using the docx library.
- `<BDS:AUTO:REQUEST_WEB_FETCH>url</BDS:AUTO:REQUEST_WEB_FETCH>` – Automatically fetch and convert a web page to markdown, then inject it into the chat context.
- `<BDS:AUTO:REQUEST_GITHUB_FETCH>url</BDS:AUTO:REQUEST_GITHUB_FETCH>` – Automatically fetch a GitHub repository and inject its codebase into the chat context.
- `<BDS:memory_write>key: value, importance: always|called</BDS:memory_write>` – Store persistent facts about the user that are injected into future prompts.
- `<BDS:character_create name="..." usage="...">...</BDS:character_create>` – Define a roleplay persona that DeepSeek can adopt.

### LONG_WORK Project Mode
When building multi-file projects, DeepSeek can use the `<BDS:LONG_WORK>` tag. All files created inside this block are collected, zipped, and presented as a single download after the block closes. During generation, the user sees only a "Working..." indicator, keeping the chat clean.

![long work image](extension/1.png)

### Persistent Memory and Skills
- **Memory**: Store key-value facts about the user. "Always" memories are included in every request; "called" memories appear only when their key is mentioned.
- **Skills**: Upload markdown files that define custom instructions or behaviors. Skills can be toggled on and off from the drawer.
- **Characters**: Create and manage roleplay personas. Only one character can be active at a time.

### Voice Support (STT & TTS)
Better DeepSeek now supports full voice interaction:
- **Voice-to-Text**: Dictate your prompts using the microphone button next to the chat input. Supports optional auto-submission for a hands-free experience.
- **Text-to-Speech**: Assistant responses can be automatically read aloud once generation is complete.
- **Language Selection**: Configure your preferred voice and recognition language directly from the extension settings.

### Native Navigation
The DeepSeek logo and "New Chat" button have been transformed into native links, allowing for standard browser interactions such as "Open in New Tab" via right-click or Ctrl/Cmd+Click.

### User Interface
A sleek drawer slides out from a floating button on the DeepSeek page. Inside you can:
- Edit the system prompt.
- Toggle auto-download behavior for files and LONG_WORK zips.
- Import, export, and manage skills.
- Import, export, and manage memory entries.
- Create, edit, and activate characters.
- Define Claude-style Projects, define project-level instructions, and upload project files and attach them to chats.

![long work image](extension/4.png)



### Code Block Download Buttons
Every code block in DeepSeek responses gains a "Download" button, making it easy to save snippets with the correct file extension.

### Advanced File Upload
The extension adds a "+" button next to the chat input, offering:
- Upload a folder (concatenates all text files into a single workspace file).
- Import a GitHub repository (fetches and packages the repo as a text file, with optional GitHub token support for private repositories).
- Fetch a web page (converts the main content to markdown).

## Installation

### Recommended: Browser Stores
The easiest way to install Better DeepSeek is through the official stores:
- **[Chrome Web Store](https://chromewebstore.google.com/detail/better-deepseek/aabiopennjmopfippagcalmkdjlepdhh)**
- **[Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/better-deepseek/goboedojlaeplneahnmnobmendoeblld)**
- **[Firefox Add-ons](https://addons.mozilla.org/en/firefox/addon/better-deepseek/)**

### Latest Development Build
If you want to try the very latest features before they reach the store, you can download the **[Latest Automated Build](https://github.com/EdgeTypE/better-deepseek/releases/tag/latest)**. Download the ZIP, unzip it, and load it via "Load unpacked" in Chrome.

### Manual Installation (Developer Mode)
If you prefer to build from source or contribute to development:

#### Prerequisites
- Node.js (version 18 or later)
- npm

#### Build from Source
1. Clone the repository:
   ```bash
   git clone https://github.com/EdgeTypE/better-deepseek.git
   cd better-deepseek
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
   This will create a `dist-chrome` and `dist-firefox` folder with the unpacked extension.

4. Load the extension in your browser:

   1. **Chrome**:
      1. Open Chrome and go to `chrome://extensions`.
      2. Enable "Developer mode" (top-right toggle).
      3. Click "Load unpacked" and select the `dist-chrome` folder.

   2. **Firefox**:
      1. Open Firefox and go to `about:debugging`.
      2. Click "This Firefox".
      3. Click "Load Temporary Add-on".
      4. Select the `better-deepseek-firefox.zip` file.

      *Note: Firefox build is experimental.*

The extension should now appear in your extensions list and be active on `chat.deepseek.com`.

## Usage

Once installed, visit [chat.deepseek.com](https://chat.deepseek.com). You will see a "BDS" button in the top-right corner. Click it to open the settings drawer.

### Using Tool Tags
Simply ask DeepSeek to perform a task that would benefit from one of the tools. For example:
- "Create a Python script that calculates the Fibonacci sequence and run it."
- "Make an interactive pendulum simulation."
- "Generate a PowerPoint presentation about climate change."
- "Build a complete React to-do app as a downloadable project."

DeepSeek will use the appropriate tags automatically (guided by the injected system prompt).

### Managing Memory
When DeepSeek writes to memory using `<BDS:memory_write>`, the entries appear in the "Stored Memory" section of the drawer. You can also manually import/export memory as JSON.

### Uploading Folders and GitHub Repos
Click the "+" button next to the chat input to reveal the advanced upload menu. Choose "Upload Folder" to select a local directory; the extension will concatenate all text files into a single upload. On browsers without the File System Access API (Firefox), the folder picker falls back to the browser's native directory input so the flow still works. "GitHub Repo" fetches the repository as a ZIP and converts it to a gitingest-style text file for context.

For private repositories, add a classic GitHub personal access token with `repo` scope in Advanced Settings. The token is stored locally in the extension and is only sent to GitHub when you explicitly fetch a repository.

## Development

### Project Structure
```
better-deepseek/
├── src/
│ ├── background/                      # Service worker for cross-origin requests
│ ├── content/                         # Content script (runs on DeepSeek page)
│ │ ├── dom/                           # DOM manipulation utilities
│ │ ├── files/                         # File/folder/GitHub readers and code block downloads
│ │ ├── parser/                        # BDS tag parsing and sanitization
│ │ ├── tools/                         # Tool card renderers (HTML, Python, PPTX, etc.)
│ │ ├── ui/                            # Svelte components for the drawer and overlays
│ │ └── index.js                       # Content script entry point
│ ├── injected/                        # Script injected into the page's MAIN world
│ ├── lib/                             # Shared utilities (ZIP, download, hashing, etc.)
│ ├── platform/                        # Platform-specific globals and polyfills
│ │ ├── android-bridge-shim.js         # Android native bridge wrappers
│ │ ├── android-chrome-polyfill.js     # chrome.* API polyfill for Android
│ │ ├── globals-android.js             # Android platform globals entry
│ │ └── globals-chrome.js              # Chrome platform globals entry
│ ├── sandbox/                         # Sandboxed iframe for PPTX/Excel/DOCX generation
│ └── styles/                          # CSS files
├── android/                           # Android WebView app
│ ├── app/
│ │ ├── src/main/
│ │ │ ├── java/com/betterdeepseek/app/
│ │ │ │ ├── MainActivity.kt            # Full-screen WebView Activity
│ │ │ │ └── WebViewBridge.kt           # @JavascriptInterface bridge
│ │ │ ├── assets/bds/                  # Auto-populated by build:android
│ │ │ └── res/ # Android resources
│ │ └── build.gradle.kts
│ ├── build.gradle.kts
│ ├── settings.gradle.kts
│ └── gradle/
├── static/
│ ├── manifest.json                    # Extension manifest
│ └── sandbox.html                     # Sandbox page
├── scripts/                           # Build helper scripts
├── tests/                             # Test suites (unit, integration, E2E)
├── build.js                           # Vite multi-target build configuration
└── package.json
```

### Building and Watching
- `npm run build` – Production build.
- `npm run dev` – Development build with watch mode.

After making changes, rebuild the extension and reload it from `chrome://extensions` (click the refresh icon on the extension card).

### Building for Android

Better DeepSeek can run as a standalone Android app. It wraps
`chat.deepseek.com` in a WebView and injects the BDS enhancement layer.

#### Prerequisites

| Tool | Version | How to install |
|------|---------|----------------|
| Node.js | ≥18 | `winget install OpenJS.NodeJS.LTS` |
| Java JDK | 17 | `winget install EclipseAdoptium.Temurin.17.JDK` |
| Android SDK | API 34 | Install Android Studio, then SDK Manager → Android 14.0 (API 34), Build-Tools 34.0.0, Command-line Tools |
| Gradle | 8.7 (one-time) | Download the binary-only ZIP from https://gradle.org/releases, extract, and add `bin/` to your PATH |

#### Environment Variables

Set these in your system or user environment variables (Windows — use `setx` in
Command Prompt, not PowerShell):

```
JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
```

Also add `%ANDROID_HOME%\platform-tools` to your `Path`.

> **PowerShell pitfall:** In PowerShell, use `$env:JAVA_HOME` and `&` to call
> executables. In Command Prompt, use `%JAVA_HOME%` and double‑quote paths with
> spaces: `"%JAVA_HOME%\bin\java" -version`.

#### Verify the toolchain

Open a **Command Prompt** (cmd.exe) and run:

```cmd
echo %JAVA_HOME%
"%JAVA_HOME%\bin\java" -version
echo %ANDROID_HOME%
dir %ANDROID_HOME%\platforms
dir %ANDROID_HOME%\build-tools
dir %ANDROID_HOME%\cmdline-tools
gradle --version
```

You should see OpenJDK 17, `android-34`, `34.0.0` in build‑tools, `latest` in
cmdline‑tools, and Gradle 8.7.

#### Create local.properties

In the `android/` directory, create a file named `local.properties`:

```
sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk
```

Use **double backslashes** — this is a Java properties file. This file is
gitignored and must never be committed.

#### Bootstrap the Gradle wrapper (one-time)

```cmd
cd android
gradle wrapper --gradle-version 8.7 --distribution-type bin
```

This creates `gradlew.bat` and the `gradle/wrapper/` folder. After this you can
build with `gradlew` — the system Gradle is no longer needed.

#### Build the JavaScript bundles

```cmd
npm run build:android
```

This runs Vite with `--target=android` and copies the output (content.js,
injected.js, sandbox.js, sandbox.html, content.css) into
`android/app/src/main/assets/bds/`.

#### Build the APK

```cmd
cd android
gradlew assembleDebug
```

The first build downloads Gradle and Android dependencies — expect a few minutes.
Subsequent builds are fast. The debug APK lands at:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

#### Install and run

```cmd
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

Requires a physical device with USB debugging enabled, or an Android emulator
(create one via Android Studio's Device Manager — API 34, x86_64, Google Play
system image recommended).

#### Common pitfalls

| Problem | Fix |
|---------|-----|
| `%JAVA_HOME%` prints literally in PowerShell | Use `$env:JAVA_HOME` in PowerShell, or switch to cmd.exe |
| `'C:\Program' is not recognized` | Wrap the path in double quotes: `"%JAVA_HOME%\bin\java"` |
| Winget Temurin install fails with exit code 1602 | Run the downloaded MSI directly from `%TEMP%\WinGet\...` |
| `sdkmanager` doesn't show license prompt | Run it again; the prompt sometimes scrolls past. Type `y` and Enter |
| `Unresolved reference: BuildConfig` | Add `buildFeatures { buildConfig = true }` to `android { }` in `app/build.gradle.kts` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Uninstall the existing app first: `adb uninstall com.betterdeepseek.app` |
| Play Protect blocks installation | Tap "Install anyway" — debug APKs are unsigned |
| BDS toggle doesn't appear after login | Wait a few seconds; injection happens after the page fully loads |

### Design Principles
- The content script uses Svelte 5 for reactive UI components.
- The injected script patches `window.fetch` and `XMLHttpRequest` to modify outgoing chat completion requests.
- All data (settings, skills, memories, characters) is stored locally using `chrome.storage.local`.
- The extension is designed to be non-intrusive: it only modifies the DOM by adding host containers next to messages and hiding original markdown when tool tags are present.

## Privacy

Better DeepSeek does not collect, transmit, or sell any personal data. All settings, memories, skills, and characters are stored locally on your device. If you configure a GitHub personal access token for private repository support, it is stored locally and only sent to GitHub when you explicitly fetch a repository. See the full [Privacy Policy](extension/PRIVACY.md) for details.

## Changelog

### v0.1.5 (2026-05-06)
- **New Feature**: Advanced system prompt injection control. Choose between "Always", "First Message", or "Every X" messages with customizable intervals.
- **New Feature**: Private repository import support via GitHub Personal Access Tokens. (Thanks to [@WhiteLicorice](https://github.com/WhiteLicorice)).
- **New Feature**: Token price estimation and context window display for API-equivalent usage.
- **New Feature**: What's New popup in the extension.
- **New Option**: "Disable Memory" toggle in Settings.
- **Bug Fixes and UX Improvements**: Resolved critical issues with message handling and UI state. General UI polishing and various bug fixes. (Thanks to [@WhiteLicorice](https://github.com/WhiteLicorice) and [@ferxal](https://github.com/ferxal))

### v0.1.4 (2026-04-30)
- **New Feature**: Projects menu for better organizational control (Thanks to [@WhiteLicorice](https://github.com/WhiteLicorice)).
- **New Feature**: Search functionality added to the session history sidebar.
- **UX Improvement**: Settings menu rework with an "Advanced Settings" accordion to save drawer space.
- **New Option**: Ability to disable the Hidden System Prompt entirely.
- **New Option**: "Force Language" setting to ensure DeepSeek responds in your preferred language.

### v0.1.3 (2026-04-28)
- **New Feature**: Added "Ask Questions" tool. DeepSeek can now ask for clarification when unsure about context or instructions.
- **New Feature**: Export full sessions to Markdown and PDF.
- **UX Improvement**: Added a button to reset the system prompt to default.
- **Bug Fix**: Resolved full page reloading issues when clicking the DeepSeek logo or the "New Chat" button.

### v0.1.2 (2026-04-23)
- **Cross-Browser Support**: Added experimental support for Firefox.
- **Enhanced Code Runners**: Updated Python runner and added new JavaScript and TypeScript execution environments.
- **GitHub Integration**: Added support for fetching and injecting GitHub repositories directly into the chat via `BDS:AUTO`.

### v0.1.1 (2026-04-18)
- **New Feature**: Added full Voice Support (Speech-to-Text and Text-to-Speech).
- **New Feature**: Configurable voice and recognition languages in Settings.
- **UX Improvement**: Logo and "New Chat" button are now real `<a>` tags, supporting "Open in new tab".
- **Improved Reliability**: Better handling of stalled streams and automatic closing of tags.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub. Before submitting a PR, ensure that your code builds without errors and follows the existing style.

## Testing

Run the main test commands before opening a PR:

- `npm run test:unit` - runs the Vitest unit and integration suite with coverage.
- `npm run test:e2e` - runs the Playwright browser-extension end-to-end suite.
- `npm run test` - runs the default browser-focused local test stack.
- `npm run test:e2e:android` - runs the Android WebView simulator Playwright suite against `dist-android/`.
- `npm run test:android` - builds the Android web bundle and runs the Android simulator suite.
- `npm run android:test` - runs the Kotlin unit tests in `android/`.
- `npm run android:assemble:debug` - builds the debug APK through the Gradle wrapper.
- `npm run test:ci:web` - runs the web CI-equivalent flow: Chrome build, Vitest, then Playwright.
- `npm run test:ci:android` - runs the Android CI-equivalent flow: Android bundle build, APK assembly, Android Playwright, then Kotlin unit tests.
- `npm run test:ci` - runs both CI-equivalent jobs locally.

For fuller testing notes, suite layout, and conventions, see [TESTING.md](TESTING.md).

## Acknowledgements and Disclaimer

Use it at your own risk. Better DeepSeek is an independent project and is not affiliated with DeepSeek. It uses several open-source libraries, including:
- [Svelte](https://svelte.dev/)
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS)
- [SheetJS](https://sheetjs.com/)
- [docx](https://docx.js.org/)
- [fflate](https://github.com/101arrowz/fflate)
- [Readability](https://github.com/mozilla/readability)
- [Turndown](https://github.com/mixmark-io/turndown)

> "Better DeepSeek" is an unofficial, independent, and community-driven open-source extension. It is NOT affiliated with, endorsed by, sponsored by, or officially connected to DeepSeek or DeepSeek AI in any way. All product names, logos, and brands are property of their respective owners.

