var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
(function() {
  "use strict";
  var _a, _commit_callbacks, _discard_callbacks, _fork_commit_callbacks, _pending, _blocking_pending, _deferred, _roots, _new_effects, _dirty_effects, _maybe_dirty_effects, _skipped_branches, _unskipped_branches, _decrement_queued, _blockers, _Batch_instances, is_deferred_fn, is_blocked_fn, process_fn, traverse_fn, defer_effects_fn, commit_fn, _anchor, _hydrate_open, _props, _children, _effect, _main_effect, _pending_effect, _failed_effect, _offscreen_fragment, _local_pending_count, _pending_count, _pending_count_update_queued, _dirty_effects2, _maybe_dirty_effects2, _effect_pending, _effect_pending_subscriber, _Boundary_instances, hydrate_resolved_content_fn, hydrate_failed_content_fn, hydrate_pending_content_fn, render_fn, resolve_fn, run_fn, update_pending_count_fn, handle_error_fn, _b, _batches, _onscreen, _offscreen, _outroing, _transition, _commit, _discard, _listeners, _observer, _options, _ResizeObserverSingleton_instances, getObserver_fn, _events, _instance, _c;
  const STORAGE_KEYS = {
    settings: "bds_settings",
    skills: "bds_skills",
    memories: "bds_memories"
  };
  const BRIDGE_EVENTS = {
    configUpdate: "bds:config-update",
    requestConfig: "bds:request-config",
    networkState: "bds:network-state"
  };
  const SYSTEM_PROMPT_TEMPLATE_VERSION = 4;
  const DOWNLOAD_BEHAVIOR_VERSION = 2;
  const LONG_WORK_STALE_MS = 3e4;
  const DEFAULT_SYSTEM_PROMPT = [
    "You are Better DeepSeek. You have access to specialized tools.",
    "",
    "MANDATORY PROJECT DELIVERY PROTOCOL:",
    "- If the user asks for a project/app/template/scaffold/multiple files/zip/archive/downloadable package,",
    "you MUST use:",
    "<BDS:LONG_WORK>",
    '<BDS:create_file fileName="...">...</BDS:create_file>',
    "...",
    "</BDS:LONG_WORK>",
    "- Inside LONG_WORK, create all required files with BDS:create_file tags.",
    "- After closing LONG_WORK, you may add only one short plain sentence.",
    "- The extension automatically zips all BDS:create_file outputs created inside LONG_WORK",
    "and gives the ZIP to the user.",
    "",
    "STRICTLY FORBIDDEN:",
    "- Do NOT generate base64 zip blobs.",
    "- Do NOT generate data: URLs for file delivery.",
    "- Do NOT try to build zip files with python/js/html tools.",
    "- Do NOT ask the user to zip files manually for project requests.",
    "- Do NOT output <thinking> tags or internal planning text.",
    "",
    "Core tool tags:",
    "1. HTML Preview: <BDS:HTML>your html/css/js code</BDS:HTML>",
    "2. LaTeX to PDF: <BDS:LATEX>your latex code</BDS:LATEX>",
    "3. Python Runner: <BDS:run_python_embed>your python code</BDS:run_python_embed>",
    '4. File Creator: <BDS:create_file fileName="path/to/file.ext">content</BDS:create_file>',
    "",
    "If you're explaining a detailed workflow to a user, create a Mermaid diagram. You have a built-in Mermaid viewer.",
    "When using <BDS:HTML>...</BDS:HTML>:",
    "",
    "ALWAYS include a complete, self-contained HTML document inside the tag.",
    "This means: <!DOCTYPE html>, <html>, <head> with <meta charset>, <body>.",
    "External CDN libraries are allowed (Chart.js, Three.js, p5.js, D3, etc.)",
    'via <script src="https://cdn.jsdelivr.net/..."> in the <head>.',
    "",
    "DESIGN PRINCIPLES for BDS:HTML output:",
    "- Default canvas/viewport: 800×500px unless task demands otherwise",
    "- Use requestAnimationFrame for animations, not setInterval",
    "- Include intuitive controls (sliders, buttons) labeled in the user's language",
    "- Show a title/description inside the simulation itself",
    "- Handle errors gracefully — never show a blank canvas",
    "- For physics: use realistic but adjustable constants",
    "- For data viz: include axis labels, legends, tooltips",
    "- Develop unique, production-ready frontend interfaces characterized by superior design quality. Employ this expertise when users request the creation of web components, pages, artifacts, posters, or applications (such as websites, landing pages, dashboards, React components, HTML/CSS layouts, or when enhancing the visual appeal of any web UI). Produces innovative, refined code and UI design that steers clear of conventional AI aesthetics.",
    "",
    "WHEN TO USE:",
    "✓ Physics simulations (pendulum, orbit, fluid, waves)",
    "✓ Math visualizations (fractals, geometry, function plots)",
    "✓ Interactive diagrams (flowcharts users can manipulate)",
    "✓ Games or mini-apps (calculator, color picker, etc.)",
    "✓ Data charts with user-controllable parameters",
    "✓ UI/UX mockups or prototypes",
    "",
    "DO NOT USE for:",
    "✗ Static code snippets → use code blocks",
    "✗ Simple lists or tables → use markdown",
    "✗ Documents → use BDS:LATEX or BDS:create_file",
    "",
    "",
    "",
    "When using <BDS:LATEX>...</BDS:LATEX>:",
    "",
    "Always produce a COMPLETE, compilable LaTeX document.",
    "Start with \\documentclass, include all necessary \\usepackage{} directives.",
    "The extension compiles with pdflatex — use standard CTAN packages only.",
    "",
    "REQUIRED PACKAGES to always include if relevant:",
    "- \\usepackage{amsmath, amssymb, amsthm} for math",
    "- \\usepackage{geometry} for margins",
    "- \\usepackage{hyperref} for links",
    "- \\usepackage[utf8]{inputenc} always",
    "- \\usepackage{graphicx} if figures needed",
    "- \\usepackage{booktabs} for tables",
    "",
    "WHEN TO USE:",
    "✓ Mathematical proofs, derivations, equations",
    "✓ Academic papers or reports",
    "✓ CVs / résumés",
    "✓ Formal structured documents",
    "✓ Any document where typography and layout precision matters",
    "✓ When user explicitly asks for PDF output",
    "",
    "DO NOT include:",
    "✗ \\includeonly, \\input of external files (self-contained only)",
    "✗ Custom fonts requiring installation",
    "✗ \\bibliography with external .bib (embed refs inline or use thebibliography)",
    "",
    "After the tag, briefly describe what the document contains so the user",
    "knows what they're downloading before clicking.",
    "",
    "",
    "",
    "When using <BDS:run_python_embed>...</BDS:run_python_embed>:",
    "",
    "The code runs in the browser via PyScript (Pyodide). Rules:",
    "",
    "AVAILABLE:",
    "- Standard library (math, random, itertools, json, re, datetime, etc.)",
    "- numpy, pandas, matplotlib (via pyodide packages)",
    "- All pure-Python logic",
    "",
    "NOT AVAILABLE:",
    "- File system access (open(), os.path, etc.) — use io.StringIO instead",
    "- Network requests (requests, urllib) — browser sandbox blocks these",
    "- subprocess, multiprocessing, threading",
    "- C-extension packages not in Pyodide (e.g. scipy is limited)",
    "",
    "OUTPUT RULES:",
    "- Use print() for text output — it appears in the embedded console",
    "- For matplotlib plots: use plt.show() — it renders inline",
    "- For pandas DataFrames: print(df.to_string()) for full output",
    "- Always add error handling (try/except) for user-facing scripts",
    "- Include a brief comment header explaining what the script does",
    "",
    "WHEN TO USE:",
    "✓ Numerical calculations or simulations",
    "✓ Data processing and analysis",
    "✓ Algorithm demonstrations",
    "✓ Statistical computations",
    "✓ Plotting and graphing (matplotlib)",
    "✓ When user needs to SEE code run, not just read it",
    "",
    "PREFER over plain code blocks when:",
    "- The result depends on computation (not just reading the code)",
    '- User asked to "run", "calculate", "plot", "simulate"',
    "",
    "",
    "",
    "",
    "When using <BDS:memory_write>key: value, importance: always|called</BDS:memory_write>:",
    "",
    "PURPOSE: Persist facts about the user across sessions so you can give",
    "more personalized, context-aware answers without the user repeating themselves.",
    "",
    "IMPORTANCE LEVELS:",
    "- always: Critical, session-defining facts. Injected into EVERY prompt.",
    "Use for: name, language preference, profession, major ongoing project,",
    "accessibility needs, communication style preferences.",
    "- called: Contextual facts. Injected only when the key word appears in input.",
    "Use for: project names, people's names, technical stack details,",
    "domain-specific terminology, recurring topics.",
    "",
    "KEY NAMING RULES:",
    "- Keys must be lowercase, snake_case, single concept: user_name, preferred_language,",
    "current_project, coding_language, timezone, etc.",
    '- Keys must be reusable: prefer "current_project" over "the_thing_they_mentioned"',
    "- Value: concise, factual, max ~200 chars",
    "",
    "WRITE MEMORY WHEN:",
    `✓ User states their name ("I'm Alex" → key: user_name, value: Alex, importance: always)`,
    '✓ User mentions a recurring project ("working on MyApp" → importance: called)',
    '✓ User sets a preference ("always reply in English" → importance: always)',
    `✓ User shares professional context ("I'm a backend dev using Go" → importance: always)`,
    `✓ User defines a term ("by 'the script' I mean deploy.sh" → importance: called)`,
    "",
    "DO NOT WRITE MEMORY FOR:",
    "✗ One-off facts not worth persisting",
    "✗ Sensitive info (passwords, financial data)",
    "✗ Values that will change frequently",
    "✗ Information already in the current conversation context",
    "",
    "You can write multiple memory entries at once, one tag per entry.",
    "Do not notify the user when writing memory — it happens silently.",
    "",
    "",
    "",
    "",
    "",
    "",
    "When using <BDS:LONG_WORK>...</BDS:LONG_WORK>:",
    "",
    "This mode hides all intermediate output. The user sees only a",
    '"Working..." animation until the closing </BDS:LONG_WORK> tag.',
    "Final output (files, ZIPs) is delivered after the closing tag.",
    "",
    "ALWAYS USE LONG_WORK WHEN:",
    "✓ Building a complete application (web app, CLI tool, game, etc.)",
    "✓ Generating 3+ files that belong together",
    "✓ Doing complex multi-step planning before producing output",
    "✓ Any task where intermediate steps would confuse the user",
    '✓ User says: "build me a full ...", "create a project for ...", "make a complete ..."',
    "",
    "STRUCTURE INSIDE LONG_WORK:",
    "1. Start with your reasoning/planning (invisible to user)",
    "2. Use <BDS:create_file> for every file",
    "3. End with a brief summary line before </BDS:LONG_WORK>",
    "",
    "FILE ORGANIZATION:",
    "- Always use meaningful directory structure",
    "- Example: src/components/Button.tsx, src/utils/api.ts, public/index.html",
    "- Include README.md or setup instructions in every project",
    "- Include package.json / requirements.txt when applicable",
    "- Include .env.example for sensitive configs",
    "",
    "AFTER LONG_WORK CLOSES:",
    "- The extension zips all created files and offers download",
    "- Add a SHORT plain-text summary AFTER the closing tag:",
    '"I built X with features Y, Z. Click the ZIP to download."',
    "- Do NOT re-explain every file — the user will see the structure in the ZIP",
    "",
    "WHAT NOT TO DO INSIDE LONG_WORK:",
    "✗ Don't write conversational text meant to be read during generation",
    `✗ Don't use markdown headers like "Now I'll create..."`,
    "✗ Don't ask clarifying questions inside LONG_WORK",
    "(ask them BEFORE starting LONG_WORK if needed)",
    "",
    "",
    "",
    "",
    'When using <BDS:create_file fileName="path/to/file.ext">content</BDS:create_file>:',
    "",
    "Creates an individual file for download with proper extension and path.",
    "",
    "ALWAYS INFER THE CORRECT EXTENSION:",
    "- Python scripts → .py",
    "- JavaScript → .js or .ts",
    "- React components → .jsx or .tsx",
    "- HTML pages → .html",
    "- CSS → .css",
    "- Bash scripts → .sh",
    "- Config files → .json, .yaml, .toml, .env",
    "- Documentation → .md",
    "- Data → .csv, .json, .xml",
    "",
    "PATH RULES:",
    '- Flat files: fileName="script.py"',
    '- With folder: fileName="utils/helpers.py" (extension creates utils/ folder)',
    '- Deep nesting: fileName="src/components/ui/Button.tsx"',
    "- No leading slash, no drive letters",
    "",
    "STANDALONE USE (outside LONG_WORK):",
    "- Offer exactly one file per create_file tag",
    "- Can offer multiple sequential files for related but separate outputs",
    "- Each file gets its own download button in the UI",
    "",
    "INSIDE LONG_WORK:",
    "- All create_file outputs are collected and bundled as ZIP",
    "- File count is unlimited",
    "- Always include a project root README.md",
    "",
    "CONTENT QUALITY RULES:",
    "- Include proper shebang lines for scripts (#!/usr/bin/env python3)",
    "- Include file-level docstrings/comments describing purpose",
    "- Include license header if creating a full project",
    "- Never truncate file content — always write complete, runnable files",
    '- Never write placeholder comments like "// TODO: implement this"',
    "",
    "FILE CREATION STRATEGY:",
    'Short content (<100 lines): Create in one tool call, save directly to outputs. Use <BDS:create_file fileName="">...</BDS:create_file>',
    'Long content (>100 lines): Start <BDS:LONG_WORK> <BDS:create_file fileName="">...</BDS:create_file> ... </BDS:LONG_WORK>',
    "",
    "",
    "Do not create a file unless the user explicitly requests it. Ask the user for permission to create a file. ",
    "",
    "",
    "",
    "The system prompt has ended. User prompt:"
  ].join("\n");
  const DEFAULT_SETTINGS = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    systemPromptTemplateVersion: SYSTEM_PROMPT_TEMPLATE_VERSION,
    downloadBehaviorVersion: DOWNLOAD_BEHAVIOR_VERSION,
    autoDownloadFiles: false,
    autoDownloadLongWorkZip: false,
    autoDownloadLatexPdf: false
  };
  const CODE_EXTENSION_MAP = {
    python: "py",
    py: "py",
    javascript: "js",
    js: "js",
    typescript: "ts",
    ts: "ts",
    tsx: "tsx",
    jsx: "jsx",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yml",
    yml: "yml",
    markdown: "md",
    md: "md",
    bash: "sh",
    shell: "sh",
    sh: "sh",
    sql: "sql",
    c: "c",
    cpp: "cpp",
    csharp: "cs",
    go: "go",
    rust: "rs",
    ruby: "rb",
    php: "php",
    swift: "swift",
    kotlin: "kt",
    java: "java",
    xml: "xml"
  };
  const state$1 = {
    settings: { ...DEFAULT_SETTINGS },
    skills: [],
    memories: {},
    observer: null,
    scanTimer: 0,
    urlWatchTimer: 0,
    lastUrl: location.href,
    processedStandaloneFiles: /* @__PURE__ */ new Set(),
    processedLatexAutoDownloads: /* @__PURE__ */ new Set(),
    downloadCounter: 0,
    network: {
      activeCompletionRequests: 0,
      lastEventAt: 0
    },
    longWork: {
      active: false,
      files: /* @__PURE__ */ new Map(),
      lastActivityAt: 0
    },
    /** @type {import('./ui/mount.js').UiApi | null} */
    ui: null
  };
  function simpleHash(input) {
    const text2 = String(input || "");
    let hash2 = 2166136261;
    for (let index2 = 0; index2 < text2.length; index2 += 1) {
      hash2 ^= text2.charCodeAt(index2);
      hash2 += (hash2 << 1) + (hash2 << 4) + (hash2 << 7) + (hash2 << 8) + (hash2 << 24);
    }
    return (hash2 >>> 0).toString(16);
  }
  function parseTagAttributes(rawAttrs) {
    const attrs = {};
    const regex = /([A-Za-z0-9_:-]+)\s*=\s*"([\s\S]*?)"/g;
    let match;
    while ((match = regex.exec(rawAttrs)) !== null) {
      const key2 = String(match[1] || "").trim();
      if (!key2) {
        continue;
      }
      if (key2 === "fileName") {
        attrs.fileName = String(match[2] || "");
      } else {
        attrs[key2] = String(match[2] || "");
      }
    }
    return attrs;
  }
  function normalizeTaggedCodeContent(content, tagName) {
    const name = String(tagName || "").toLowerCase();
    let output = String(content || "");
    if (name === "create_file" || name === "run_python_embed" || name === "html" || name === "latex") {
      output = unwrapMarkdownCodeFence(output);
    }
    return stripMarkdownViewerControls(output);
  }
  function unwrapMarkdownCodeFence(content) {
    const original = String(content || "");
    const trimmed = original.trim();
    const fencedMultiline = trimmed.match(
      /^```[a-zA-Z0-9_+.-]*\s*\r?\n([\s\S]*?)\r?\n```$/
    );
    if (fencedMultiline) {
      return String(fencedMultiline[1] || "");
    }
    const fencedInline = trimmed.match(/^```([\s\S]*?)```$/);
    if (fencedInline) {
      return String(fencedInline[1] || "");
    }
    return original;
  }
  function stripMarkdownViewerControls(text2) {
    let output = String(text2 || "");
    let previous = "";
    const languagePattern = "(?:python|javascript|typescript|tsx|jsx|html|css|json|bash|shell|sh|sql|yaml|yml|xml|markdown|md)";
    while (output !== previous) {
      previous = output;
      output = output.replace(
        new RegExp(
          `^\\s*${languagePattern}\\s*(?:\\r?\\n|\\s+)(?:Kopyala|Copy)\\s*(?:\\r?\\n|\\s+)(?:İndir|Download)\\s*(?:\\r?\\n)*`,
          "i"
        ),
        ""
      );
      output = output.replace(
        /^\s*(?:Kopyala|Copy)\s*(?:\r?\n|\s+)(?:İndir|Download)\s*(?:\r?\n)*/i,
        ""
      );
    }
    return output;
  }
  function extractMessageRawText(node) {
    return parseNodeWithBestTextSource(node);
  }
  function parseNodeWithBestTextSource(node) {
    const candidates = getNodeTextCandidates(node);
    if (!candidates.length) {
      return "";
    }
    const tagCandidates = candidates.filter(
      (value) => /<BDS:|<BetterDeepSeek>/i.test(value)
    );
    const pool = tagCandidates.length ? tagCandidates : candidates;
    const selected = pool.sort(
      (a, b) => scoreRawTextCandidate(b) - scoreRawTextCandidate(a)
    )[0] || "";
    return stripMarkdownViewerControls(selected);
  }
  function getNodeTextCandidates(node) {
    const innerText = String(node.innerText || "");
    const textContent = String(node.textContent || "");
    const htmlDecoded = decodeNodeHtmlText(node.innerHTML || "");
    return [innerText, textContent, htmlDecoded].filter(
      (value) => value && value.trim()
    );
  }
  function decodeNodeHtmlText(html2) {
    const htmlWithBreaks = String(html2 || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|pre|code|blockquote|h[1-6])>/gi, "\n");
    const container = document.createElement("div");
    container.innerHTML = htmlWithBreaks;
    return String(container.textContent || "");
  }
  function scoreRawTextCandidate(value) {
    const text2 = String(value || "");
    const lineBreakCount = (text2.match(/\n/g) || []).length;
    const tagCount = (text2.match(/<BDS:|<BetterDeepSeek>/gi) || []).length;
    return tagCount * 1e4 + lineBreakCount * 100 + text2.length;
  }
  let memoryPersistTimer = 0;
  function parseMemoryWrite(content) {
    const cleaned = String(content || "").trim();
    if (!cleaned) {
      return null;
    }
    const match = cleaned.match(
      /^([a-z0-9_]+)\s*:\s*([\s\S]*?)(?:,\s*importance\s*:\s*(always|called))?$/i
    );
    if (!match) {
      return null;
    }
    const key2 = sanitizeMemoryKey$1(match[1]);
    const value = String(match[2] || "").trim();
    const importance = sanitizeMemoryImportance$1(match[3] || "called");
    if (!key2 || !value) {
      return null;
    }
    return { key: key2, value, importance };
  }
  function sanitizeMemoryKey$1(input) {
    return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  }
  function sanitizeMemoryImportance$1(input) {
    return String(input || "called").toLowerCase() === "always" ? "always" : "called";
  }
  function upsertMemories(items) {
    let changed = false;
    for (const item of items) {
      const key2 = sanitizeMemoryKey$1(item.key);
      const value = String(item.value || "").trim();
      const importance = sanitizeMemoryImportance$1(item.importance);
      if (!key2 || !value) {
        continue;
      }
      const existing = state$1.memories[key2];
      if (existing && existing.value === value && existing.importance === importance) {
        continue;
      }
      state$1.memories[key2] = { value, importance };
      changed = true;
    }
    if (!changed) {
      return;
    }
    if (state$1.ui) {
      state$1.ui.refreshMemories();
    }
    pushConfigToPage();
    if (memoryPersistTimer) {
      window.clearTimeout(memoryPersistTimer);
    }
    memoryPersistTimer = window.setTimeout(async () => {
      memoryPersistTimer = 0;
      await chrome.storage.local.set({
        [STORAGE_KEYS.memories]: state$1.memories
      });
    }, 300);
  }
  function sanitizeVisibleText(text2) {
    let output = String(text2 || "");
    output = output.replace(
      /<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi,
      ""
    );
    output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
    output = output.replace(
      /<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi,
      ""
    );
    output = output.replace(
      /<BDS:[A-Za-z0-9_]+[^>]*>[\s\S]*?<\/BDS:[A-Za-z0-9_]+>/gi,
      ""
    );
    output = output.replace(/<BDS:create_file[^>]*\/>/gi, "");
    output = output.replace(/<\/?BDS:LONG_WORK>/gi, "");
    output = output.replace(/Bds create file>[^\n]*/gi, "");
    return output.replace(/\n{3,}/g, "\n\n").trim();
  }
  const RENDERABLE_TOOLS = /* @__PURE__ */ new Set(["html", "latex", "run_python_embed"]);
  function parseBdsMessage(rawText) {
    const text2 = String(rawText || "");
    const result = {
      containsControlTags: false,
      longWorkOpen: false,
      longWorkClose: false,
      renderableBlocks: [],
      createFiles: [],
      memoryWrites: [],
      visibleText: text2
    };
    if (!/(<BDS:|<BetterDeepSeek>|Bds create file>)/i.test(text2)) {
      return result;
    }
    result.containsControlTags = true;
    result.longWorkOpen = /<BDS:LONG_WORK>/i.test(text2);
    result.longWorkClose = /<\/BDS:LONG_WORK>/i.test(text2);
    const createFilePairRegex = /<BDS:create_file([^>]*)>([\s\S]*?)<\/BDS:create_file>/gi;
    let match;
    while ((match = createFilePairRegex.exec(text2)) !== null) {
      const attrs = parseTagAttributes(match[1] || "");
      const fileName = attrs.fileName || attrs.filename || attrs.path;
      if (!fileName) {
        continue;
      }
      const content = normalizeTaggedCodeContent(
        String(match[2] || ""),
        "create_file"
      );
      result.createFiles.push({ fileName, content });
    }
    const pairTagRegex = /<BDS:([A-Za-z0-9_]+)([^>]*)>([\s\S]*?)<\/BDS:\1>/gi;
    match = null;
    while ((match = pairTagRegex.exec(text2)) !== null) {
      const name = String(match[1] || "").toLowerCase();
      const attrs = parseTagAttributes(match[2] || "");
      const content = normalizeTaggedCodeContent(
        String(match[3] || ""),
        name
      );
      if (RENDERABLE_TOOLS.has(name)) {
        result.renderableBlocks.push({ name, attrs, content });
      }
      if (name === "memory_write") {
        const parsedMemory = parseMemoryWrite(content);
        if (parsedMemory) {
          result.memoryWrites.push(parsedMemory);
        }
      }
    }
    const selfClosingCreateRegex = /<BDS:create_file([^>]*)\/>/gi;
    while ((match = selfClosingCreateRegex.exec(text2)) !== null) {
      const attrs = parseTagAttributes(match[1] || "");
      const fileName = attrs.fileName || attrs.filename || attrs.path;
      if (!fileName) {
        continue;
      }
      const content = normalizeTaggedCodeContent(
        String(attrs.content || ""),
        "create_file"
      );
      result.createFiles.push({ fileName, content });
    }
    const plainCreateRegex = /Bds create file>\s*fileName\s*=\s*"([^"]+)"\s*content\s*=\s*"([\s\S]*?)"/gi;
    while ((match = plainCreateRegex.exec(text2)) !== null) {
      result.createFiles.push({
        fileName: String(match[1] || "file.txt"),
        content: normalizeTaggedCodeContent(
          String(match[2] || ""),
          "create_file"
        )
      });
    }
    result.visibleText = sanitizeVisibleText(text2);
    return result;
  }
  function getOrCreateHost(node, hostClass) {
    let wrapper = node.nextElementSibling;
    if (!wrapper || !wrapper.classList || !wrapper.classList.contains("bds-host-wrapper")) {
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
  function triggerBlobDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = flattenPathForDownload(fileName);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2e3);
  }
  function triggerTextDownload(text2, fileName) {
    const blob = new Blob([String(text2 || "")], { type: "text/plain" });
    triggerBlobDownload(blob, fileName);
  }
  function triggerUrlDownload(url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  function flattenPathForDownload(path) {
    return String(path || "file.txt").replace(/[<>:"|?*]/g, "_").replace(/\//g, "__");
  }
  function createToolCardShell(title, subtitle) {
    const element2 = document.createElement("article");
    element2.className = "bds-tool-card";
    const header = document.createElement("header");
    header.className = "bds-tool-card-header";
    const titleNode = document.createElement("h4");
    titleNode.textContent = title;
    const subtitleNode = document.createElement("p");
    subtitleNode.textContent = subtitle;
    header.appendChild(titleNode);
    header.appendChild(subtitleNode);
    const body = document.createElement("div");
    body.className = "bds-tool-card-body";
    element2.appendChild(header);
    element2.appendChild(body);
    return { element: element2, body };
  }
  function buildDownloadCard({ title, description, fileName, blob }) {
    const card = document.createElement("article");
    card.className = "bds-download-card";
    const titleNode = document.createElement("h4");
    titleNode.textContent = title;
    const descriptionNode = document.createElement("p");
    descriptionNode.textContent = description;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bds-btn";
    button.textContent = `Download ${fileName}`;
    button.addEventListener("click", () => {
      triggerBlobDownload(blob, fileName);
    });
    card.appendChild(titleNode);
    card.appendChild(descriptionNode);
    card.appendChild(button);
    return card;
  }
  function ensureHtmlDocument(content) {
    const trimmed = String(content || "").trim();
    if (/<html[\s>]/i.test(trimmed)) {
      return trimmed;
    }
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        margin: 0;
        padding: 12px;
        font-family: "Segoe UI", sans-serif;
        background: #ffffff;
      }
    </style>
  </head>
  <body>${trimmed}</body>
</html>`;
  }
  function buildPythonRunnerDocument(sourceCode) {
    const encodedCode = encodeURIComponent(sourceCode);
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: "Consolas", "Courier New", monospace;
        background: #0f172a;
        color: #e2e8f0;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        background: #111827;
      }
      button {
        border: 0;
        padding: 6px 12px;
        border-radius: 999px;
        cursor: pointer;
        background: #14b8a6;
        color: #06201d;
        font-weight: 700;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border: 0;
        outline: 0;
        resize: vertical;
        box-sizing: border-box;
        padding: 10px;
        background: #1e293b;
        color: #f8fafc;
      }
      pre {
        margin: 0;
        padding: 10px;
        min-height: 100px;
        white-space: pre-wrap;
        background: #020617;
        color: #dcfce7;
      }
      .status {
        font-size: 12px;
        color: #93c5fd;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js"><\/script>
  </head>
  <body>
    <div class="toolbar">
      <button id="run-btn" type="button">Run Python</button>
      <span class="status" id="status">Loading runtime...</span>
    </div>
    <textarea id="editor"></textarea>
    <pre id="output"></pre>

    <script>
      const editor = document.getElementById("editor");
      const output = document.getElementById("output");
      const status = document.getElementById("status");
      const runButton = document.getElementById("run-btn");
      editor.value = decodeURIComponent("${encodedCode}");

      let runtimePromise = null;

      async function getRuntime() {
        if (!runtimePromise) {
          runtimePromise = (async () => {
            status.textContent = "Loading Pyodide...";
            const runtime = await loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/"
            });
            status.textContent = "Runtime ready.";
            return runtime;
          })();
        }

        return runtimePromise;
      }

      async function runPythonCode() {
        output.textContent = "";
        status.textContent = "Running...";

        try {
          const runtime = await getRuntime();
          runtime.globals.set("bds_user_code", editor.value);
          const result = await runtime.runPythonAsync(
            "import io, sys, traceback\\n" +
            "_buffer = io.StringIO()\\n" +
            "_old_stdout = sys.stdout\\n" +
            "_old_stderr = sys.stderr\\n" +
            "sys.stdout = _buffer\\n" +
            "sys.stderr = _buffer\\n" +
            "try:\\n" +
            "    exec(bds_user_code, {})\\n" +
            "except Exception:\\n" +
            "    traceback.print_exc()\\n" +
            "finally:\\n" +
            "    sys.stdout = _old_stdout\\n" +
            "    sys.stderr = _old_stderr\\n" +
            "_buffer.getvalue()"
          );

          output.textContent = result || "(No output)";
          status.textContent = "Finished.";
        } catch (error) {
          output.textContent = String(error);
          status.textContent = "Error.";
        }
      }

      runButton.addEventListener("click", runPythonCode);
      getRuntime();
    <\/script>
  </body>
</html>`;
  }
  function buildHtmlPreviewCard(htmlSource) {
    const card = createToolCardShell("HTML Preview", "Interactive output");
    const frame = document.createElement("iframe");
    frame.className = "bds-preview-frame";
    frame.sandbox = "allow-scripts allow-forms";
    frame.srcdoc = ensureHtmlDocument(String(htmlSource || ""));
    const actions = document.createElement("div");
    actions.className = "bds-card-actions";
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "bds-btn";
    downloadButton.textContent = "Download .html";
    downloadButton.addEventListener("click", () => {
      triggerTextDownload(frame.srcdoc, `preview-${Date.now()}.html`);
    });
    actions.appendChild(downloadButton);
    card.body.appendChild(frame);
    card.body.appendChild(actions);
    return card.element;
  }
  function makeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function buildTimestamp() {
    const now2 = /* @__PURE__ */ new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const yyyy = now2.getFullYear();
    const mm = pad(now2.getMonth() + 1);
    const dd = pad(now2.getDate());
    const hh = pad(now2.getHours());
    const mi = pad(now2.getMinutes());
    const ss = pad(now2.getSeconds());
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }
  function base64ToBlob(base64, mimeType) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index2 = 0; index2 < binary.length; index2 += 1) {
      bytes[index2] = binary.charCodeAt(index2);
    }
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  }
  function buildLatexCard(latexSource) {
    const source2 = String(latexSource || "");
    const card = createToolCardShell("LaTeX to PDF", "Compile and download");
    const status = document.createElement("p");
    status.className = "bds-latex-status";
    status.textContent = "Compiling PDF preview...";
    const pdfFrame = document.createElement("iframe");
    pdfFrame.className = "bds-latex-pdf-frame";
    pdfFrame.title = "LaTeX PDF Preview";
    const sourceDetails = document.createElement("details");
    sourceDetails.className = "bds-latex-source-details";
    const sourceSummary = document.createElement("summary");
    sourceSummary.textContent = "Show LaTeX source";
    const preview = document.createElement("pre");
    preview.className = "bds-latex-preview";
    preview.textContent = source2.slice(0, 4e3);
    sourceDetails.appendChild(sourceSummary);
    sourceDetails.appendChild(preview);
    const actions = document.createElement("div");
    actions.className = "bds-card-actions";
    const pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.className = "bds-btn";
    pdfButton.textContent = "Download PDF";
    pdfButton.addEventListener("click", async () => {
      const previousText = pdfButton.textContent;
      pdfButton.disabled = true;
      pdfButton.textContent = "Preparing PDF...";
      await downloadLatexPdf(source2, `latex-${Date.now()}.pdf`);
      pdfButton.disabled = false;
      pdfButton.textContent = previousText;
    });
    const texButton = document.createElement("button");
    texButton.type = "button";
    texButton.className = "bds-btn bds-btn-secondary";
    texButton.textContent = "Download .tex";
    texButton.addEventListener("click", () => {
      triggerTextDownload(source2, `latex-${Date.now()}.tex`);
    });
    actions.appendChild(pdfButton);
    actions.appendChild(texButton);
    card.body.appendChild(status);
    card.body.appendChild(pdfFrame);
    card.body.appendChild(sourceDetails);
    card.body.appendChild(actions);
    void renderLatexPdfPreview(source2, pdfFrame, status);
    if (state$1.settings.autoDownloadLatexPdf) {
      const autoKey = simpleHash(source2);
      if (!state$1.processedLatexAutoDownloads.has(autoKey)) {
        state$1.processedLatexAutoDownloads.add(autoKey);
        void downloadLatexPdf(source2, `latex-${Date.now()}.pdf`);
      }
    }
    return card.element;
  }
  async function renderLatexPdfPreview(source2, pdfFrame, statusNode) {
    try {
      const blob = await compileLatexPdfBlob(source2);
      const nextUrl = URL.createObjectURL(blob);
      const previousUrl = pdfFrame.dataset.pdfUrl;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      pdfFrame.dataset.pdfUrl = nextUrl;
      pdfFrame.src = nextUrl;
      statusNode.textContent = "PDF preview ready.";
    } catch (error) {
      statusNode.textContent = "PDF preview could not be rendered. You can use Download PDF or Download .tex.";
      pdfFrame.removeAttribute("src");
    }
  }
  async function compileLatexPdfBlob(source2) {
    const response = await chrome.runtime.sendMessage({
      type: "bds-compile-latex",
      source: source2
    });
    if (!response || !response.ok || !response.base64) {
      throw new Error(
        response && response.error ? response.error : "LaTeX compile failed."
      );
    }
    return base64ToBlob(response.base64, "application/pdf");
  }
  async function downloadLatexPdf(source2, fileName) {
    try {
      const blob = await compileLatexPdfBlob(source2);
      triggerBlobDownload(blob, fileName);
      if (state$1.ui) {
        state$1.ui.showToast("LaTeX PDF downloaded.");
      }
      return true;
    } catch (error) {
      if (state$1.ui) {
        state$1.ui.showToast("LaTeX PDF failed. Downloaded .tex fallback.");
      }
      triggerTextDownload(
        source2,
        String(fileName || "latex.pdf").replace(/\.pdf$/i, ".tex")
      );
      return false;
    }
  }
  function buildPythonCard(sourceCode) {
    const source2 = String(sourceCode || "");
    const card = createToolCardShell("Python Runner", "Pyodide in browser");
    const frame = document.createElement("iframe");
    frame.className = "bds-python-frame";
    frame.sandbox = "allow-scripts";
    frame.srcdoc = buildPythonRunnerDocument(source2);
    const actions = document.createElement("div");
    actions.className = "bds-card-actions";
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "bds-btn";
    downloadButton.textContent = "Download .py";
    downloadButton.addEventListener("click", () => {
      triggerTextDownload(source2, `script-${Date.now()}.py`);
    });
    actions.appendChild(downloadButton);
    card.body.appendChild(frame);
    card.body.appendChild(actions);
    return card.element;
  }
  const TOOL_RENDERERS = {
    html: (content) => buildHtmlPreviewCard(content),
    latex: (content) => buildLatexCard(content),
    run_python_embed: (content) => buildPythonCard(content)
  };
  function renderToolBlocks(node, blocks) {
    const host = getOrCreateHost(node, "bds-tool-host");
    if (!blocks.length) {
      host.replaceChildren();
      return;
    }
    const signature = simpleHash(
      blocks.map((block2) => `${block2.name}:${simpleHash(block2.content)}`).join("|")
    );
    if (host.dataset.signature === signature) {
      return;
    }
    host.dataset.signature = signature;
    host.replaceChildren();
    for (const block2 of blocks) {
      const renderer = TOOL_RENDERERS[block2.name];
      if (!renderer) {
        continue;
      }
      host.appendChild(renderer(block2.content));
    }
  }
  function normalizeFilePath(fileName) {
    const cleaned = String(fileName || "").trim().replace(/\\/g, "/").replace(/^[A-Za-z]:/, "").replace(/^\/+/, "");
    if (!cleaned) {
      return "file.txt";
    }
    const safeParts = cleaned.split("/").filter((part) => part && part !== "." && part !== "..").map((part) => part.replace(/[<>:"|?*]/g, "_"));
    return safeParts.join("/") || "file.txt";
  }
  function buildCreateFilePackageName(path) {
    const normalizedPath = normalizeFilePath(path);
    const folderHint = normalizedPath.includes("/") ? normalizedPath.split("/").slice(0, -1).join("-") : normalizedPath.split(".")[0];
    const safeHint = folderHint.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const base = safeHint || "generated-file";
    return `${base}-${buildTimestamp()}.zip`;
  }
  function guessMimeType(fileName) {
    const ext = String(fileName || "").split(".").pop().toLowerCase();
    switch (ext) {
      case "html":
        return "text/html";
      case "css":
        return "text/css";
      case "js":
      case "ts":
      case "tsx":
      case "jsx":
        return "application/javascript";
      case "json":
        return "application/json";
      case "md":
        return "text/markdown";
      case "py":
      case "txt":
      default:
        return "text/plain";
    }
  }
  const CRC_TABLE = buildCrcTable();
  function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        if (c & 1) {
          c = 3988292384 ^ c >>> 1;
        } else {
          c >>>= 1;
        }
      }
      table[i] = c >>> 0;
    }
    return table;
  }
  function crc32(bytes) {
    let crc = 4294967295;
    for (let i = 0; i < bytes.length; i += 1) {
      const index2 = (crc ^ bytes[i]) & 255;
      crc = CRC_TABLE[index2] ^ crc >>> 8;
    }
    return (crc ^ 4294967295) >>> 0;
  }
  function toUint16LE(value) {
    return Uint8Array.from([value & 255, value >>> 8 & 255]);
  }
  function toUint32LE(value) {
    return Uint8Array.from([
      value & 255,
      value >>> 8 & 255,
      value >>> 16 & 255,
      value >>> 24 & 255
    ]);
  }
  function concat(parts) {
    let totalLength = 0;
    for (const part of parts) {
      totalLength += part.length;
    }
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
  function encodeText(text2) {
    return new TextEncoder().encode(text2);
  }
  function normalizePath(inputPath) {
    const cleaned = String(inputPath || "").replace(/\\/g, "/").replace(/^[A-Za-z]:/, "").replace(/^\/+/, "");
    const parts = cleaned.split("/").filter((part) => part && part !== "." && part !== "..");
    return parts.join("/") || "file.txt";
  }
  function getDosDateTime() {
    const now2 = /* @__PURE__ */ new Date();
    const year = Math.max(now2.getFullYear(), 1980);
    const month = now2.getMonth() + 1;
    const day = now2.getDate();
    const hour = now2.getHours();
    const minute = now2.getMinutes();
    const second = now2.getSeconds();
    const dosTime = (hour & 31) << 11 | (minute & 63) << 5 | second / 2 & 31;
    const dosDate = (year - 1980 & 127) << 9 | (month & 15) << 5 | day & 31;
    return { dosDate, dosTime };
  }
  function buildZip(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("buildZip expects a non-empty files array.");
    }
    const localHeaders = [];
    const centralHeaders = [];
    let localOffset = 0;
    const { dosDate, dosTime } = getDosDateTime();
    for (const file of files) {
      const normalizedPath = normalizePath(file.path || file.fileName);
      const pathBytes = encodeText(normalizedPath);
      const contentBytes = encodeText(String(file.content || ""));
      const checksum = crc32(contentBytes);
      const localHeader = concat([
        toUint32LE(67324752),
        toUint16LE(20),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(dosTime),
        toUint16LE(dosDate),
        toUint32LE(checksum),
        toUint32LE(contentBytes.length),
        toUint32LE(contentBytes.length),
        toUint16LE(pathBytes.length),
        toUint16LE(0),
        pathBytes,
        contentBytes
      ]);
      localHeaders.push(localHeader);
      const centralHeader = concat([
        toUint32LE(33639248),
        toUint16LE(20),
        toUint16LE(20),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(dosTime),
        toUint16LE(dosDate),
        toUint32LE(checksum),
        toUint32LE(contentBytes.length),
        toUint32LE(contentBytes.length),
        toUint16LE(pathBytes.length),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(0),
        toUint16LE(0),
        toUint32LE(0),
        toUint32LE(localOffset),
        pathBytes
      ]);
      centralHeaders.push(centralHeader);
      localOffset += localHeader.length;
    }
    const centralDirectory = concat(centralHeaders);
    const localData = concat(localHeaders);
    const endOfCentralDirectory = concat([
      toUint32LE(101010256),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(files.length),
      toUint16LE(files.length),
      toUint32LE(centralDirectory.length),
      toUint32LE(localData.length),
      toUint16LE(0)
    ]);
    return new Blob([localData, centralDirectory, endOfCentralDirectory], {
      type: "application/zip"
    });
  }
  function emitStandaloneFiles(node, createFiles) {
    const host = getOrCreateHost(node, "bds-file-host");
    for (const item of createFiles) {
      const normalizedPath = normalizeFilePath(item.fileName);
      if (!normalizedPath) {
        continue;
      }
      const content = String(item.content || "");
      const signature = `${normalizedPath}:${simpleHash(content)}`;
      if (state$1.processedStandaloneFiles.has(signature)) {
        continue;
      }
      state$1.processedStandaloneFiles.add(signature);
      const shouldPackagePath = normalizedPath.includes("/");
      let blob;
      let cardTitle;
      let downloadName;
      let description = normalizedPath;
      if (shouldPackagePath) {
        blob = buildZip([{ path: normalizedPath, content }]);
        cardTitle = "Generated file package";
        downloadName = buildCreateFilePackageName(normalizedPath);
        description = `${normalizedPath} (folder path preserved)`;
      } else {
        blob = new Blob([content], { type: guessMimeType(normalizedPath) });
        cardTitle = "Generated file";
        downloadName = normalizedPath;
      }
      const card = buildDownloadCard({
        title: cardTitle,
        description,
        fileName: downloadName,
        blob
      });
      host.appendChild(card);
      if (state$1.settings.autoDownloadFiles) {
        triggerBlobDownload(blob, downloadName);
      }
    }
  }
  function collectLongWorkFiles(createFiles) {
    for (const item of createFiles) {
      const normalizedPath = normalizeFilePath(item.fileName);
      if (!normalizedPath) {
        continue;
      }
      state$1.longWork.files.set(normalizedPath, String(item.content || ""));
    }
  }
  function finalizeLongWork(node) {
    state$1.longWork.active = false;
    state$1.longWork.lastActivityAt = 0;
    if (state$1.ui) {
      state$1.ui.showLongWorkOverlay(false);
    }
    const entries = Array.from(state$1.longWork.files.entries()).map(
      ([path, content]) => ({ path, content })
    );
    state$1.longWork.files.clear();
    if (!entries.length) {
      if (state$1.ui) {
        state$1.ui.showToast("LONG_WORK finished. No files were produced.");
      }
      return;
    }
    try {
      const host = getOrCreateHost(node, "bds-file-host");
      const zipBlob = buildZip(entries);
      const zipName = `better-deepseek-${buildTimestamp()}.zip`;
      host.appendChild(
        buildDownloadCard({
          title: "LONG_WORK project",
          description: `${entries.length} files packaged`,
          fileName: zipName,
          blob: zipBlob
        })
      );
      if (state$1.settings.autoDownloadLongWorkZip) {
        triggerBlobDownload(zipBlob, zipName);
      }
      if (state$1.ui) {
        state$1.ui.showToast(
          `LONG_WORK complete: ${entries.length} files zipped.`
        );
      }
    } catch (error) {
      if (state$1.ui) {
        state$1.ui.showToast(
          "ZIP builder error. Files will be provided one by one."
        );
      }
      emitStandaloneFiles(
        node,
        entries.map((entry) => ({
          fileName: entry.path,
          content: entry.content
        }))
      );
    }
  }
  function applySanitizedDisplay(node, visibleText, role) {
    if (role !== "assistant") {
      return;
    }
    const text2 = String(visibleText || "").trim();
    const host = getOrCreateHost(node, "bds-sanitized-host");
    host.textContent = text2;
    node.dataset.bdsHiddenByTags = "1";
    node.style.display = "none";
    node.dataset.bdsSanitizedText = text2;
  }
  function restoreSanitizedDisplay(node) {
    delete node.dataset.bdsHiddenByTags;
    delete node.dataset.bdsSanitizedText;
    if (node.dataset.bdsHidden !== "1") {
      node.style.display = "";
    }
    const wrapper = node.nextElementSibling;
    if (!wrapper || !wrapper.classList || !wrapper.classList.contains("bds-host-wrapper")) {
      return;
    }
    const sanitizedHost = wrapper.querySelector(".bds-sanitized-host");
    if (sanitizedHost) {
      sanitizedHost.remove();
    }
    if (!wrapper.children.length) {
      wrapper.remove();
    }
  }
  function processMessageNode(node) {
    if (!node || node.closest("#bds-root")) {
      return;
    }
    const rawText = extractMessageRawText(node);
    if (!rawText.trim()) {
      return;
    }
    const signature = simpleHash(rawText);
    if (node.dataset.bdsHash === signature) {
      return;
    }
    node.dataset.bdsHash = signature;
    const role = detectMessageRole(node);
    const parsed = parseBdsMessage(rawText);
    const hasActionableFiles = parsed.createFiles.length > 0;
    const isLatestAssistant = role === "assistant" && isLatestAssistantMessage(node);
    const shouldStartLongWork = parsed.longWorkOpen && hasActionableFiles && isLatestAssistant;
    if (parsed.memoryWrites.length) {
      upsertMemories(parsed.memoryWrites);
    }
    if (role === "assistant") {
      if (shouldStartLongWork) {
        state$1.longWork.active = true;
        state$1.longWork.lastActivityAt = Date.now();
        if (state$1.ui) {
          state$1.ui.showLongWorkOverlay(true);
        }
      }
      if (state$1.longWork.active && !parsed.longWorkClose) {
        hideMessageNode(node, true);
      } else {
        hideMessageNode(node, false);
      }
      if (hasActionableFiles) {
        if ((state$1.longWork.active || parsed.longWorkOpen) && isLatestAssistant) {
          state$1.longWork.lastActivityAt = Date.now();
          collectLongWorkFiles(parsed.createFiles);
        } else {
          emitStandaloneFiles(node, parsed.createFiles);
        }
      }
      if (!(state$1.longWork.active && !parsed.longWorkClose)) {
        renderToolBlocks(node, parsed.renderableBlocks);
      }
      const hasCollectedFiles = state$1.longWork.files.size > 0 || hasActionableFiles;
      if (parsed.longWorkClose && hasCollectedFiles && isLatestAssistant && node.dataset.bdsLongWorkClosed !== "1") {
        node.dataset.bdsLongWorkClosed = "1";
        finalizeLongWork(node);
      }
    }
    if (parsed.containsControlTags && role === "assistant") {
      applySanitizedDisplay(node, parsed.visibleText, role);
    } else if (role === "assistant" && node.dataset.bdsHiddenByTags === "1") {
      restoreSanitizedDisplay(node);
    }
  }
  function hideMessageNode(node, hidden) {
    if (hidden) {
      node.dataset.bdsHidden = "1";
      node.style.display = "none";
      return;
    }
    if (node.dataset.bdsHidden === "1") {
      if (node.dataset.bdsHiddenByTags === "1") {
        node.style.display = "none";
      } else {
        node.style.display = "";
      }
      delete node.dataset.bdsHidden;
    }
  }
  function enhanceCodeBlockDownloads() {
    const blocks = document.querySelectorAll("pre");
    for (const pre of blocks) {
      if (pre.closest("#bds-root") || pre.dataset.bdsCodeDownloadAttached === "1") {
        continue;
      }
      const codeElement = pre.querySelector("code");
      if (!codeElement) {
        continue;
      }
      const codeText = String(codeElement.textContent || "");
      if (!codeText.trim()) {
        continue;
      }
      pre.dataset.bdsCodeDownloadAttached = "1";
      pre.style.position = "relative";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bds-code-download";
      button.textContent = "Download";
      button.addEventListener("click", () => {
        const extension = detectCodeExtension(codeElement);
        const fileName = `snippet-${++state$1.downloadCounter}.${extension}`;
        triggerTextDownload(codeText, fileName);
      });
      pre.appendChild(button);
    }
  }
  function detectCodeExtension(codeElement) {
    const className = `${codeElement.className || ""} ${codeElement.parentElement ? codeElement.parentElement.className : ""}`;
    const languageMatch = className.match(/language-([a-z0-9_+-]+)/i) || className.match(/lang-([a-z0-9_+-]+)/i);
    if (languageMatch) {
      const lang = String(languageMatch[1] || "").toLowerCase();
      if (CODE_EXTENSION_MAP[lang]) {
        return CODE_EXTENSION_MAP[lang];
      }
    }
    const firstLine = String(codeElement.textContent || "").split("\n")[0].toLowerCase();
    if (firstLine.startsWith("#!/usr/bin/env python")) {
      return "py";
    }
    return "txt";
  }
  function collectMessageNodes() {
    const set2 = /* @__PURE__ */ new Set();
    for (const node of document.querySelectorAll("div.ds-message._63c77b1")) {
      set2.add(node);
    }
    if (!set2.size) {
      for (const node of document.querySelectorAll("div.ds-message")) {
        set2.add(node);
      }
    }
    return Array.from(set2);
  }
  function findLatestAssistantMessageNode() {
    const nodes = collectMessageNodes();
    for (let index2 = nodes.length - 1; index2 >= 0; index2 -= 1) {
      const candidate = nodes[index2];
      if (!candidate || candidate.closest("#bds-root")) {
        continue;
      }
      if (detectMessageRole(candidate) === "assistant") {
        return candidate;
      }
    }
    return null;
  }
  function detectMessageRole(node) {
    if (node.classList && node.classList.contains("d29f3d7d")) {
      return "user";
    }
    if (node.closest("div._4f9bf79._43c05b5")) {
      return "assistant";
    }
    if (node.closest("div._9663006")) {
      return "user";
    }
    if (node.classList && node.classList.contains("ds-message")) {
      return "assistant";
    }
    const roleAttr = node.getAttribute("data-message-author-role");
    if (roleAttr) {
      return String(roleAttr).toLowerCase();
    }
    return "unknown";
  }
  function isLatestAssistantMessage(node) {
    return findLatestAssistantMessageNode() === node;
  }
  function observeChatDom() {
    if (state$1.observer || !document.body) {
      return;
    }
    state$1.observer = new MutationObserver(() => {
      scheduleScan();
    });
    state$1.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }
  function scheduleScan() {
    if (state$1.scanTimer) {
      return;
    }
    state$1.scanTimer = window.setTimeout(() => {
      state$1.scanTimer = 0;
      scanPage();
    }, 140);
  }
  function scanPage() {
    enhanceCodeBlockDownloads();
    if (state$1.longWork.active && Date.now() - state$1.longWork.lastActivityAt > LONG_WORK_STALE_MS) {
      state$1.longWork.active = false;
      state$1.longWork.files.clear();
      if (state$1.ui) {
        state$1.ui.showLongWorkOverlay(false);
        state$1.ui.showToast("LONG_WORK timeout cleared.");
      }
    }
    const nodes = collectMessageNodes();
    for (const node of nodes) {
      processMessageNode(node);
    }
  }
  function startUrlWatcher() {
    if (state$1.urlWatchTimer) {
      return;
    }
    state$1.urlWatchTimer = window.setInterval(() => {
      if (location.href === state$1.lastUrl) {
        return;
      }
      state$1.lastUrl = location.href;
      state$1.longWork.active = false;
      state$1.longWork.files.clear();
      state$1.longWork.lastActivityAt = 0;
      if (state$1.ui) {
        state$1.ui.showLongWorkOverlay(false);
      }
      scheduleScan();
    }, 1e3);
  }
  function setupBridgeEvents() {
    window.addEventListener(BRIDGE_EVENTS.requestConfig, () => {
      pushConfigToPage();
    });
    window.addEventListener(BRIDGE_EVENTS.networkState, (event2) => {
      handleNetworkState(event2 && event2.detail ? event2.detail : {});
    });
  }
  function pushConfigToPage() {
    const detail = {
      systemPrompt: String(state$1.settings.systemPrompt || ""),
      skills: state$1.skills.filter((skill) => skill.active).map((skill) => ({ name: skill.name, content: skill.content })),
      memories: Object.entries(state$1.memories).map(([key2, item]) => ({
        key: key2,
        value: item.value,
        importance: item.importance
      }))
    };
    window.dispatchEvent(
      new CustomEvent(BRIDGE_EVENTS.configUpdate, { detail })
    );
  }
  function handleNetworkState(detail) {
    const activeCompletionRequests = Math.max(
      0,
      Number(
        detail && detail.activeCompletionRequests ? detail.activeCompletionRequests : 0
      )
    );
    state$1.network.activeCompletionRequests = activeCompletionRequests;
    state$1.network.lastEventAt = Date.now();
    if (activeCompletionRequests > 0) {
      if (state$1.longWork.active) {
        state$1.longWork.lastActivityAt = Date.now();
      }
      return;
    }
    if (state$1.ui) {
      state$1.ui.showLongWorkOverlay(false);
    }
    if (!state$1.longWork.active) {
      return;
    }
    const pendingFiles = state$1.longWork.files.size;
    if (pendingFiles > 0) {
      const latestAssistant = findLatestAssistantMessageNode();
      if (latestAssistant && latestAssistant.dataset.bdsLongWorkClosed !== "1") {
        latestAssistant.dataset.bdsLongWorkClosed = "1";
        finalizeLongWork(latestAssistant);
        return;
      }
    }
    state$1.longWork.active = false;
    state$1.longWork.lastActivityAt = 0;
    state$1.longWork.files.clear();
    if (state$1.ui) {
      state$1.ui.showToast("LONG_WORK closed because API response ended.");
    }
  }
  function injectHookScript() {
    if (document.getElementById("bds-injected-hook")) {
      return;
    }
    const script = document.createElement("script");
    script.id = "bds-injected-hook";
    script.src = chrome.runtime.getURL("injected.js");
    script.async = false;
    script.onload = () => {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  async function loadStateFromStorage() {
    const values = await chrome.storage.local.get([
      STORAGE_KEYS.settings,
      STORAGE_KEYS.skills,
      STORAGE_KEYS.memories
    ]);
    const storedSettings = values[STORAGE_KEYS.settings] || {};
    state$1.settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings
    };
    if (shouldUpgradeSystemPrompt(storedSettings)) {
      state$1.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      state$1.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: state$1.settings
      });
    }
    const behaviorVersion = Number(
      storedSettings && storedSettings.downloadBehaviorVersion ? storedSettings.downloadBehaviorVersion : 0
    );
    if (behaviorVersion < DOWNLOAD_BEHAVIOR_VERSION) {
      state$1.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
      state$1.settings.autoDownloadFiles = false;
      state$1.settings.autoDownloadLongWorkZip = false;
      state$1.settings.autoDownloadLatexPdf = false;
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: state$1.settings
      });
    }
    state$1.skills = normalizeSkills(values[STORAGE_KEYS.skills]);
    state$1.memories = normalizeMemories(values[STORAGE_KEYS.memories]);
  }
  function shouldUpgradeSystemPrompt(storedSettings) {
    const version = Number(
      storedSettings && storedSettings.systemPromptTemplateVersion ? storedSettings.systemPromptTemplateVersion : 0
    );
    if (version >= SYSTEM_PROMPT_TEMPLATE_VERSION) {
      return false;
    }
    const prompt = String(
      storedSettings && storedSettings.systemPrompt ? storedSettings.systemPrompt : ""
    ).trim();
    if (!prompt) {
      return true;
    }
    if (prompt.includes(
      "You are Better DeepSeek, an output-focused assistant with tool tags."
    )) {
      return true;
    }
    if (prompt.includes("You are Better DeepSeek inside a tool-enabled extension.")) {
      return true;
    }
    if (prompt.includes("You are now Better DeepSeek.") && prompt.includes("When using <BDS:LONG_WORK>...</BDS:LONG_WORK>:")) {
      return true;
    }
    if (prompt.includes(
      "Prefer complete, runnable outputs for create_file and LONG_WORK tasks."
    )) {
      return true;
    }
    return false;
  }
  function normalizeSkills(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((item) => ({
      id: String(item && item.id ? item.id : makeId()),
      name: String(item && item.name ? item.name : "Skill"),
      content: String(item && item.content ? item.content : ""),
      active: item && typeof item.active === "boolean" ? item.active : true
    })).filter((item) => item.content.trim().length > 0);
  }
  function normalizeMemories(raw) {
    const memories = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const key2 = sanitizeMemoryKey(item && item.key);
        const value = String(item && item.value ? item.value : "").trim();
        if (!key2 || !value) {
          continue;
        }
        memories[key2] = {
          value,
          importance: sanitizeMemoryImportance(item && item.importance)
        };
      }
      return memories;
    }
    if (!raw || typeof raw !== "object") {
      return memories;
    }
    for (const [unsafeKey, item] of Object.entries(raw)) {
      const key2 = sanitizeMemoryKey(unsafeKey);
      const value = String(item && item.value ? item.value : "").trim();
      if (!key2 || !value) {
        continue;
      }
      memories[key2] = {
        value,
        importance: sanitizeMemoryImportance(item && item.importance)
      };
    }
    return memories;
  }
  function sanitizeMemoryKey(input) {
    return String(input || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  }
  function sanitizeMemoryImportance(input) {
    return String(input || "called").toLowerCase() === "always" ? "always" : "called";
  }
  function bindStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (changes[STORAGE_KEYS.settings]) {
        state$1.settings = {
          ...DEFAULT_SETTINGS,
          ...changes[STORAGE_KEYS.settings].newValue || {}
        };
        if (state$1.ui) {
          state$1.ui.refreshSettings();
        }
      }
      if (changes[STORAGE_KEYS.skills]) {
        state$1.skills = normalizeSkills(changes[STORAGE_KEYS.skills].newValue);
        if (state$1.ui) {
          state$1.ui.refreshSkills();
        }
      }
      if (changes[STORAGE_KEYS.memories]) {
        state$1.memories = normalizeMemories(
          changes[STORAGE_KEYS.memories].newValue
        );
        if (state$1.ui) {
          state$1.ui.refreshMemories();
        }
      }
      pushConfigToPage();
    });
  }
  const BROWSER = true;
  const DEV = false;
  var is_array = Array.isArray;
  var index_of = Array.prototype.indexOf;
  var includes = Array.prototype.includes;
  var array_from = Array.from;
  var object_keys = Object.keys;
  var define_property = Object.defineProperty;
  var get_descriptor = Object.getOwnPropertyDescriptor;
  var get_descriptors = Object.getOwnPropertyDescriptors;
  var object_prototype = Object.prototype;
  var array_prototype = Array.prototype;
  var get_prototype_of = Object.getPrototypeOf;
  var is_extensible = Object.isExtensible;
  var has_own_property = Object.prototype.hasOwnProperty;
  function is_function(thing) {
    return typeof thing === "function";
  }
  const noop = () => {
  };
  function is_promise(value) {
    return typeof (value == null ? void 0 : value.then) === "function";
  }
  function run$2(fn) {
    return fn();
  }
  function run_all(arr) {
    for (var i = 0; i < arr.length; i++) {
      arr[i]();
    }
  }
  function deferred() {
    var resolve;
    var reject;
    var promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  function fallback(value, fallback2, lazy = false) {
    return value === void 0 ? lazy ? (
      /** @type {() => V} */
      fallback2()
    ) : (
      /** @type {V} */
      fallback2
    ) : value;
  }
  function to_array(value, n) {
    if (Array.isArray(value)) {
      return value;
    }
    if (n === void 0 || !(Symbol.iterator in value)) {
      return Array.from(value);
    }
    const array = [];
    for (const element2 of value) {
      array.push(element2);
      if (array.length === n) break;
    }
    return array;
  }
  function exclude_from_object(obj, keys) {
    var result = {};
    for (var key2 in obj) {
      if (!keys.includes(key2)) {
        result[key2] = obj[key2];
      }
    }
    for (var symbol of Object.getOwnPropertySymbols(obj)) {
      if (Object.propertyIsEnumerable.call(obj, symbol) && !keys.includes(symbol)) {
        result[symbol] = obj[symbol];
      }
    }
    return result;
  }
  const DERIVED = 1 << 1;
  const EFFECT = 1 << 2;
  const RENDER_EFFECT = 1 << 3;
  const MANAGED_EFFECT = 1 << 24;
  const BLOCK_EFFECT = 1 << 4;
  const BRANCH_EFFECT = 1 << 5;
  const ROOT_EFFECT = 1 << 6;
  const BOUNDARY_EFFECT = 1 << 7;
  const CONNECTED = 1 << 9;
  const CLEAN = 1 << 10;
  const DIRTY = 1 << 11;
  const MAYBE_DIRTY = 1 << 12;
  const INERT = 1 << 13;
  const DESTROYED = 1 << 14;
  const REACTION_RAN = 1 << 15;
  const DESTROYING = 1 << 25;
  const EFFECT_TRANSPARENT = 1 << 16;
  const EAGER_EFFECT = 1 << 17;
  const HEAD_EFFECT = 1 << 18;
  const EFFECT_PRESERVED = 1 << 19;
  const USER_EFFECT = 1 << 20;
  const EFFECT_OFFSCREEN = 1 << 25;
  const WAS_MARKED = 1 << 16;
  const REACTION_IS_UPDATING = 1 << 21;
  const ASYNC = 1 << 22;
  const ERROR_VALUE = 1 << 23;
  const STATE_SYMBOL = Symbol("$state");
  const LEGACY_PROPS = Symbol("legacy props");
  const LOADING_ATTR_SYMBOL = Symbol("");
  const PROXY_PATH_SYMBOL = Symbol("proxy path");
  const HMR_ANCHOR = Symbol("hmr anchor");
  const STALE_REACTION = new class StaleReactionError extends Error {
    constructor() {
      super(...arguments);
      __publicField(this, "name", "StaleReactionError");
      __publicField(this, "message", "The reaction that called `getAbortSignal()` was re-run or destroyed");
    }
  }();
  const IS_XHTML = (
    // We gotta write it like this because after downleveling the pure comment may end up in the wrong location
    !!((_a = globalThis.document) == null ? void 0 : _a.contentType) && /* @__PURE__ */ globalThis.document.contentType.includes("xml")
  );
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const COMMENT_NODE = 8;
  const DOCUMENT_FRAGMENT_NODE = 11;
  function experimental_async_required(name) {
    if (DEV) {
      const error = new Error(`experimental_async_required
Cannot use \`${name}(...)\` unless the \`experimental.async\` compiler option is \`true\`
https://svelte.dev/e/experimental_async_required`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/experimental_async_required`);
    }
  }
  function invalid_default_snippet() {
    if (DEV) {
      const error = new Error(`invalid_default_snippet
Cannot use \`{@render children(...)}\` if the parent component uses \`let:\` directives. Consider using a named snippet instead
https://svelte.dev/e/invalid_default_snippet`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/invalid_default_snippet`);
    }
  }
  function invalid_snippet_arguments() {
    if (DEV) {
      const error = new Error(`invalid_snippet_arguments
A snippet function was passed invalid arguments. Snippets should only be instantiated via \`{@render ...}\`
https://svelte.dev/e/invalid_snippet_arguments`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/invalid_snippet_arguments`);
    }
  }
  function invariant_violation(message) {
    if (DEV) {
      const error = new Error(`invariant_violation
An invariant violation occurred, meaning Svelte's internal assumptions were flawed. This is a bug in Svelte, not your app — please open an issue at https://github.com/sveltejs/svelte, citing the following message: "${message}"
https://svelte.dev/e/invariant_violation`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/invariant_violation`);
    }
  }
  function lifecycle_outside_component(name) {
    if (DEV) {
      const error = new Error(`lifecycle_outside_component
\`${name}(...)\` can only be used during component initialisation
https://svelte.dev/e/lifecycle_outside_component`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
    }
  }
  function missing_context() {
    if (DEV) {
      const error = new Error(`missing_context
Context was not set in a parent component
https://svelte.dev/e/missing_context`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/missing_context`);
    }
  }
  function snippet_without_render_tag() {
    if (DEV) {
      const error = new Error(`snippet_without_render_tag
Attempted to render a snippet without a \`{@render}\` block. This would cause the snippet code to be stringified instead of its content being rendered to the DOM. To fix this, change \`{snippet}\` to \`{@render snippet()}\`.
https://svelte.dev/e/snippet_without_render_tag`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/snippet_without_render_tag`);
    }
  }
  function store_invalid_shape(name) {
    if (DEV) {
      const error = new Error(`store_invalid_shape
\`${name}\` is not a store with a \`subscribe\` method
https://svelte.dev/e/store_invalid_shape`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/store_invalid_shape`);
    }
  }
  function svelte_element_invalid_this_value() {
    if (DEV) {
      const error = new Error(`svelte_element_invalid_this_value
The \`this\` prop on \`<svelte:element>\` must be a string, if defined
https://svelte.dev/e/svelte_element_invalid_this_value`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/svelte_element_invalid_this_value`);
    }
  }
  function async_derived_orphan() {
    if (DEV) {
      const error = new Error(`async_derived_orphan
Cannot create a \`$derived(...)\` with an \`await\` expression outside of an effect tree
https://svelte.dev/e/async_derived_orphan`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/async_derived_orphan`);
    }
  }
  function bind_invalid_checkbox_value() {
    if (DEV) {
      const error = new Error(`bind_invalid_checkbox_value
Using \`bind:value\` together with a checkbox input is not allowed. Use \`bind:checked\` instead
https://svelte.dev/e/bind_invalid_checkbox_value`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/bind_invalid_checkbox_value`);
    }
  }
  function bind_invalid_export(component2, key2, name) {
    if (DEV) {
      const error = new Error(`bind_invalid_export
Component ${component2} has an export named \`${key2}\` that a consumer component is trying to access using \`bind:${key2}\`, which is disallowed. Instead, use \`bind:this\` (e.g. \`<${name} bind:this={component} />\`) and then access the property on the bound component instance (e.g. \`component.${key2}\`)
https://svelte.dev/e/bind_invalid_export`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/bind_invalid_export`);
    }
  }
  function bind_not_bindable(key2, component2, name) {
    if (DEV) {
      const error = new Error(`bind_not_bindable
A component is attempting to bind to a non-bindable property \`${key2}\` belonging to ${component2} (i.e. \`<${name} bind:${key2}={...}>\`). To mark a property as bindable: \`let { ${key2} = $bindable() } = $props()\`
https://svelte.dev/e/bind_not_bindable`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/bind_not_bindable`);
    }
  }
  function component_api_changed(method, component2) {
    if (DEV) {
      const error = new Error(`component_api_changed
Calling \`${method}\` on a component instance (of ${component2}) is no longer valid in Svelte 5
https://svelte.dev/e/component_api_changed`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/component_api_changed`);
    }
  }
  function component_api_invalid_new(component2, name) {
    if (DEV) {
      const error = new Error(`component_api_invalid_new
Attempted to instantiate ${component2} with \`new ${name}\`, which is no longer valid in Svelte 5. If this component is not under your control, set the \`compatibility.componentApi\` compiler option to \`4\` to keep it working.
https://svelte.dev/e/component_api_invalid_new`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/component_api_invalid_new`);
    }
  }
  function derived_references_self() {
    if (DEV) {
      const error = new Error(`derived_references_self
A derived value cannot reference itself recursively
https://svelte.dev/e/derived_references_self`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/derived_references_self`);
    }
  }
  function each_key_duplicate(a, b, value) {
    if (DEV) {
      const error = new Error(`each_key_duplicate
${value ? `Keyed each block has duplicate key \`${value}\` at indexes ${a} and ${b}` : `Keyed each block has duplicate key at indexes ${a} and ${b}`}
https://svelte.dev/e/each_key_duplicate`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/each_key_duplicate`);
    }
  }
  function each_key_volatile(index2, a, b) {
    if (DEV) {
      const error = new Error(`each_key_volatile
Keyed each block has key that is not idempotent — the key for item at index ${index2} was \`${a}\` but is now \`${b}\`. Keys must be the same each time for a given item
https://svelte.dev/e/each_key_volatile`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/each_key_volatile`);
    }
  }
  function effect_in_teardown(rune) {
    if (DEV) {
      const error = new Error(`effect_in_teardown
\`${rune}\` cannot be used inside an effect cleanup function
https://svelte.dev/e/effect_in_teardown`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/effect_in_teardown`);
    }
  }
  function effect_in_unowned_derived() {
    if (DEV) {
      const error = new Error(`effect_in_unowned_derived
Effect cannot be created inside a \`$derived\` value that was not itself created inside an effect
https://svelte.dev/e/effect_in_unowned_derived`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/effect_in_unowned_derived`);
    }
  }
  function effect_orphan(rune) {
    if (DEV) {
      const error = new Error(`effect_orphan
\`${rune}\` can only be used inside an effect (e.g. during component initialisation)
https://svelte.dev/e/effect_orphan`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/effect_orphan`);
    }
  }
  function effect_pending_outside_reaction() {
    if (DEV) {
      const error = new Error(`effect_pending_outside_reaction
\`$effect.pending()\` can only be called inside an effect or derived
https://svelte.dev/e/effect_pending_outside_reaction`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/effect_pending_outside_reaction`);
    }
  }
  function effect_update_depth_exceeded() {
    if (DEV) {
      const error = new Error(`effect_update_depth_exceeded
Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
https://svelte.dev/e/effect_update_depth_exceeded`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
    }
  }
  function flush_sync_in_effect() {
    if (DEV) {
      const error = new Error(`flush_sync_in_effect
Cannot use \`flushSync\` inside an effect
https://svelte.dev/e/flush_sync_in_effect`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/flush_sync_in_effect`);
    }
  }
  function fork_discarded() {
    if (DEV) {
      const error = new Error(`fork_discarded
Cannot commit a fork that was already discarded
https://svelte.dev/e/fork_discarded`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/fork_discarded`);
    }
  }
  function fork_timing() {
    if (DEV) {
      const error = new Error(`fork_timing
Cannot create a fork inside an effect or when state changes are pending
https://svelte.dev/e/fork_timing`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/fork_timing`);
    }
  }
  function get_abort_signal_outside_reaction() {
    if (DEV) {
      const error = new Error(`get_abort_signal_outside_reaction
\`getAbortSignal()\` can only be called inside an effect or derived
https://svelte.dev/e/get_abort_signal_outside_reaction`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/get_abort_signal_outside_reaction`);
    }
  }
  function hydratable_missing_but_required(key2) {
    if (DEV) {
      const error = new Error(`hydratable_missing_but_required
Expected to find a hydratable with key \`${key2}\` during hydration, but did not.
https://svelte.dev/e/hydratable_missing_but_required`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/hydratable_missing_but_required`);
    }
  }
  function hydration_failed() {
    if (DEV) {
      const error = new Error(`hydration_failed
Failed to hydrate the application
https://svelte.dev/e/hydration_failed`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/hydration_failed`);
    }
  }
  function invalid_snippet() {
    if (DEV) {
      const error = new Error(`invalid_snippet
Could not \`{@render}\` snippet due to the expression being \`null\` or \`undefined\`. Consider using optional chaining \`{@render snippet?.()}\`
https://svelte.dev/e/invalid_snippet`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/invalid_snippet`);
    }
  }
  function lifecycle_legacy_only(name) {
    if (DEV) {
      const error = new Error(`lifecycle_legacy_only
\`${name}(...)\` cannot be used in runes mode
https://svelte.dev/e/lifecycle_legacy_only`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/lifecycle_legacy_only`);
    }
  }
  function props_invalid_value(key2) {
    if (DEV) {
      const error = new Error(`props_invalid_value
Cannot do \`bind:${key2}={undefined}\` when \`${key2}\` has a fallback value
https://svelte.dev/e/props_invalid_value`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/props_invalid_value`);
    }
  }
  function props_rest_readonly(property) {
    if (DEV) {
      const error = new Error(`props_rest_readonly
Rest element properties of \`$props()\` such as \`${property}\` are readonly
https://svelte.dev/e/props_rest_readonly`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/props_rest_readonly`);
    }
  }
  function rune_outside_svelte(rune) {
    if (DEV) {
      const error = new Error(`rune_outside_svelte
The \`${rune}\` rune is only available inside \`.svelte\` and \`.svelte.js/ts\` files
https://svelte.dev/e/rune_outside_svelte`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/rune_outside_svelte`);
    }
  }
  function set_context_after_init() {
    if (DEV) {
      const error = new Error(`set_context_after_init
\`setContext\` must be called when a component first initializes, not in a subsequent effect or after an \`await\` expression
https://svelte.dev/e/set_context_after_init`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/set_context_after_init`);
    }
  }
  function state_descriptors_fixed() {
    if (DEV) {
      const error = new Error(`state_descriptors_fixed
Property descriptors defined on \`$state\` objects must contain \`value\` and always be \`enumerable\`, \`configurable\` and \`writable\`.
https://svelte.dev/e/state_descriptors_fixed`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
    }
  }
  function state_prototype_fixed() {
    if (DEV) {
      const error = new Error(`state_prototype_fixed
Cannot set prototype of \`$state\` object
https://svelte.dev/e/state_prototype_fixed`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
    }
  }
  function state_unsafe_mutation() {
    if (DEV) {
      const error = new Error(`state_unsafe_mutation
Updating state inside \`$derived(...)\`, \`$inspect(...)\` or a template expression is forbidden. If the value should not be reactive, declare it without \`$state\`
https://svelte.dev/e/state_unsafe_mutation`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
    }
  }
  function svelte_boundary_reset_onerror() {
    if (DEV) {
      const error = new Error(`svelte_boundary_reset_onerror
A \`<svelte:boundary>\` \`reset\` function cannot be called while an error is still being handled
https://svelte.dev/e/svelte_boundary_reset_onerror`);
      error.name = "Svelte error";
      throw error;
    } else {
      throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
    }
  }
  const EACH_ITEM_REACTIVE = 1;
  const EACH_INDEX_REACTIVE = 1 << 1;
  const EACH_IS_CONTROLLED = 1 << 2;
  const EACH_IS_ANIMATED = 1 << 3;
  const EACH_ITEM_IMMUTABLE = 1 << 4;
  const PROPS_IS_IMMUTABLE = 1;
  const PROPS_IS_RUNES = 1 << 1;
  const PROPS_IS_UPDATED = 1 << 2;
  const PROPS_IS_BINDABLE = 1 << 3;
  const PROPS_IS_LAZY_INITIAL = 1 << 4;
  const TRANSITION_IN = 1;
  const TRANSITION_OUT = 1 << 1;
  const TRANSITION_GLOBAL = 1 << 2;
  const TEMPLATE_FRAGMENT = 1;
  const TEMPLATE_USE_IMPORT_NODE = 1 << 1;
  const TEMPLATE_USE_SVG = 1 << 2;
  const TEMPLATE_USE_MATHML = 1 << 3;
  const HYDRATION_START = "[";
  const HYDRATION_START_ELSE = "[!";
  const HYDRATION_START_FAILED = "[?";
  const HYDRATION_END = "]";
  const HYDRATION_ERROR = {};
  const ELEMENT_IS_NAMESPACED = 1;
  const ELEMENT_PRESERVE_ATTRIBUTE_CASE = 1 << 1;
  const ELEMENT_IS_INPUT = 1 << 2;
  const UNINITIALIZED = Symbol();
  const FILENAME = Symbol("filename");
  const HMR = Symbol("hmr");
  const NAMESPACE_HTML = "http://www.w3.org/1999/xhtml";
  const NAMESPACE_SVG = "http://www.w3.org/2000/svg";
  const NAMESPACE_MATHML = "http://www.w3.org/1998/Math/MathML";
  const IGNORABLE_RUNTIME_WARNINGS = (
    /** @type {const} */
    [
      "await_waterfall",
      "await_reactivity_loss",
      "state_snapshot_uncloneable",
      "binding_property_non_reactive",
      "hydration_attribute_changed",
      "hydration_html_changed",
      "ownership_invalid_binding",
      "ownership_invalid_mutation"
    ]
  );
  const ELEMENTS_WITHOUT_TEXT = ["audio", "datalist", "dl", "optgroup", "select", "video"];
  const ATTACHMENT_KEY = "@attach";
  var bold$1 = "font-weight: bold";
  var normal$1 = "font-weight: normal";
  function assignment_value_stale(property, location2) {
    if (DEV) {
      console.warn(`%c[svelte] assignment_value_stale
%cAssignment to \`${property}\` property (${location2}) will evaluate to the right-hand side, not the value of \`${property}\` following the assignment. This may result in unexpected behaviour.
https://svelte.dev/e/assignment_value_stale`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/assignment_value_stale`);
    }
  }
  function await_reactivity_loss(name) {
    if (DEV) {
      console.warn(`%c[svelte] await_reactivity_loss
%cDetected reactivity loss when reading \`${name}\`. This happens when state is read in an async function after an earlier \`await\`
https://svelte.dev/e/await_reactivity_loss`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/await_reactivity_loss`);
    }
  }
  function await_waterfall(name, location2) {
    if (DEV) {
      console.warn(`%c[svelte] await_waterfall
%cAn async derived, \`${name}\` (${location2}) was not read immediately after it resolved. This often indicates an unnecessary waterfall, which can slow down your app
https://svelte.dev/e/await_waterfall`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/await_waterfall`);
    }
  }
  function binding_property_non_reactive(binding, location2) {
    if (DEV) {
      console.warn(
        `%c[svelte] binding_property_non_reactive
%c${location2 ? `\`${binding}\` (${location2}) is binding to a non-reactive property` : `\`${binding}\` is binding to a non-reactive property`}
https://svelte.dev/e/binding_property_non_reactive`,
        bold$1,
        normal$1
      );
    } else {
      console.warn(`https://svelte.dev/e/binding_property_non_reactive`);
    }
  }
  function console_log_state(method) {
    if (DEV) {
      console.warn(`%c[svelte] console_log_state
%cYour \`console.${method}\` contained \`$state\` proxies. Consider using \`$inspect(...)\` or \`$state.snapshot(...)\` instead
https://svelte.dev/e/console_log_state`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/console_log_state`);
    }
  }
  function derived_inert() {
    if (DEV) {
      console.warn(`%c[svelte] derived_inert
%cReading a derived belonging to a now-destroyed effect may result in stale values
https://svelte.dev/e/derived_inert`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/derived_inert`);
    }
  }
  function event_handler_invalid(handler, suggestion) {
    if (DEV) {
      console.warn(`%c[svelte] event_handler_invalid
%c${handler} should be a function. Did you mean to ${suggestion}?
https://svelte.dev/e/event_handler_invalid`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/event_handler_invalid`);
    }
  }
  function hydratable_missing_but_expected(key2) {
    if (DEV) {
      console.warn(`%c[svelte] hydratable_missing_but_expected
%cExpected to find a hydratable with key \`${key2}\` during hydration, but did not.
https://svelte.dev/e/hydratable_missing_but_expected`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/hydratable_missing_but_expected`);
    }
  }
  function hydration_attribute_changed(attribute, html2, value) {
    if (DEV) {
      console.warn(`%c[svelte] hydration_attribute_changed
%cThe \`${attribute}\` attribute on \`${html2}\` changed its value between server and client renders. The client value, \`${value}\`, will be ignored in favour of the server value
https://svelte.dev/e/hydration_attribute_changed`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/hydration_attribute_changed`);
    }
  }
  function hydration_html_changed(location2) {
    if (DEV) {
      console.warn(
        `%c[svelte] hydration_html_changed
%c${location2 ? `The value of an \`{@html ...}\` block ${location2} changed between server and client renders. The client value will be ignored in favour of the server value` : "The value of an `{@html ...}` block changed between server and client renders. The client value will be ignored in favour of the server value"}
https://svelte.dev/e/hydration_html_changed`,
        bold$1,
        normal$1
      );
    } else {
      console.warn(`https://svelte.dev/e/hydration_html_changed`);
    }
  }
  function hydration_mismatch(location2) {
    if (DEV) {
      console.warn(
        `%c[svelte] hydration_mismatch
%c${location2 ? `Hydration failed because the initial UI does not match what was rendered on the server. The error occurred near ${location2}` : "Hydration failed because the initial UI does not match what was rendered on the server"}
https://svelte.dev/e/hydration_mismatch`,
        bold$1,
        normal$1
      );
    } else {
      console.warn(`https://svelte.dev/e/hydration_mismatch`);
    }
  }
  function invalid_raw_snippet_render() {
    if (DEV) {
      console.warn(`%c[svelte] invalid_raw_snippet_render
%cThe \`render\` function passed to \`createRawSnippet\` should return HTML for a single element
https://svelte.dev/e/invalid_raw_snippet_render`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/invalid_raw_snippet_render`);
    }
  }
  function legacy_recursive_reactive_block(filename) {
    if (DEV) {
      console.warn(`%c[svelte] legacy_recursive_reactive_block
%cDetected a migrated \`$:\` reactive block in \`${filename}\` that both accesses and updates the same reactive value. This may cause recursive updates when converted to an \`$effect\`.
https://svelte.dev/e/legacy_recursive_reactive_block`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/legacy_recursive_reactive_block`);
    }
  }
  function lifecycle_double_unmount() {
    if (DEV) {
      console.warn(`%c[svelte] lifecycle_double_unmount
%cTried to unmount a component that was not mounted
https://svelte.dev/e/lifecycle_double_unmount`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/lifecycle_double_unmount`);
    }
  }
  function ownership_invalid_binding(parent, prop2, child2, owner) {
    if (DEV) {
      console.warn(`%c[svelte] ownership_invalid_binding
%c${parent} passed property \`${prop2}\` to ${child2} with \`bind:\`, but its parent component ${owner} did not declare \`${prop2}\` as a binding. Consider creating a binding between ${owner} and ${parent} (e.g. \`bind:${prop2}={...}\` instead of \`${prop2}={...}\`)
https://svelte.dev/e/ownership_invalid_binding`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/ownership_invalid_binding`);
    }
  }
  function ownership_invalid_mutation(name, location2, prop2, parent) {
    if (DEV) {
      console.warn(`%c[svelte] ownership_invalid_mutation
%cMutating unbound props (\`${name}\`, at ${location2}) is strongly discouraged. Consider using \`bind:${prop2}={...}\` in ${parent} (or using a callback) instead
https://svelte.dev/e/ownership_invalid_mutation`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/ownership_invalid_mutation`);
    }
  }
  function select_multiple_invalid_value() {
    if (DEV) {
      console.warn(`%c[svelte] select_multiple_invalid_value
%cThe \`value\` property of a \`<select multiple>\` element should be an array, but it received a non-array value. The selection will be kept as is.
https://svelte.dev/e/select_multiple_invalid_value`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/select_multiple_invalid_value`);
    }
  }
  function state_proxy_equality_mismatch(operator) {
    if (DEV) {
      console.warn(`%c[svelte] state_proxy_equality_mismatch
%cReactive \`$state(...)\` proxies and the values they proxy have different identities. Because of this, comparisons with \`${operator}\` will produce unexpected results
https://svelte.dev/e/state_proxy_equality_mismatch`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/state_proxy_equality_mismatch`);
    }
  }
  function state_proxy_unmount() {
    if (DEV) {
      console.warn(`%c[svelte] state_proxy_unmount
%cTried to unmount a state proxy, rather than a component
https://svelte.dev/e/state_proxy_unmount`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/state_proxy_unmount`);
    }
  }
  function svelte_boundary_reset_noop() {
    if (DEV) {
      console.warn(`%c[svelte] svelte_boundary_reset_noop
%cA \`<svelte:boundary>\` \`reset\` function only resets the boundary the first time it is called
https://svelte.dev/e/svelte_boundary_reset_noop`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
    }
  }
  function transition_slide_display(value) {
    if (DEV) {
      console.warn(`%c[svelte] transition_slide_display
%cThe \`slide\` transition does not work correctly for elements with \`display: ${value}\`
https://svelte.dev/e/transition_slide_display`, bold$1, normal$1);
    } else {
      console.warn(`https://svelte.dev/e/transition_slide_display`);
    }
  }
  let hydrating = false;
  function set_hydrating(value) {
    hydrating = value;
  }
  let hydrate_node;
  function set_hydrate_node(node) {
    if (node === null) {
      hydration_mismatch();
      throw HYDRATION_ERROR;
    }
    return hydrate_node = node;
  }
  function hydrate_next() {
    return set_hydrate_node(/* @__PURE__ */ get_next_sibling(hydrate_node));
  }
  function reset(node) {
    if (!hydrating) return;
    if (/* @__PURE__ */ get_next_sibling(hydrate_node) !== null) {
      hydration_mismatch();
      throw HYDRATION_ERROR;
    }
    hydrate_node = node;
  }
  function hydrate_template(template) {
    if (hydrating) {
      hydrate_node = template.content;
    }
  }
  function next(count = 1) {
    if (hydrating) {
      var i = count;
      var node = hydrate_node;
      while (i--) {
        node = /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node);
      }
      hydrate_node = node;
    }
  }
  function skip_nodes(remove = true) {
    var depth = 0;
    var node = hydrate_node;
    while (true) {
      if (node.nodeType === COMMENT_NODE) {
        var data = (
          /** @type {Comment} */
          node.data
        );
        if (data === HYDRATION_END) {
          if (depth === 0) return node;
          depth -= 1;
        } else if (data === HYDRATION_START || data === HYDRATION_START_ELSE || // "[1", "[2", etc. for if blocks
        data[0] === "[" && !isNaN(Number(data.slice(1)))) {
          depth += 1;
        }
      }
      var next2 = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      if (remove) node.remove();
      node = next2;
    }
  }
  function read_hydration_instruction(node) {
    if (!node || node.nodeType !== COMMENT_NODE) {
      hydration_mismatch();
      throw HYDRATION_ERROR;
    }
    return (
      /** @type {Comment} */
      node.data
    );
  }
  function equals$1(value) {
    return value === this.v;
  }
  function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
  }
  function not_equal(a, b) {
    return a !== b;
  }
  function safe_equals(value) {
    return !safe_not_equal(value, this.v);
  }
  let async_mode_flag = false;
  let legacy_mode_flag = false;
  let tracing_mode_flag = false;
  function enable_async_mode_flag() {
    async_mode_flag = true;
  }
  function disable_async_mode_flag() {
    async_mode_flag = false;
  }
  function enable_legacy_mode_flag() {
    legacy_mode_flag = true;
  }
  function enable_tracing_mode_flag() {
    tracing_mode_flag = true;
  }
  var bold = "font-weight: bold";
  var normal = "font-weight: normal";
  function dynamic_void_element_content(tag2) {
    if (DEV) {
      console.warn(`%c[svelte] dynamic_void_element_content
%c\`<svelte:element this="${tag2}">\` is a void element — it cannot have content
https://svelte.dev/e/dynamic_void_element_content`, bold, normal);
    } else {
      console.warn(`https://svelte.dev/e/dynamic_void_element_content`);
    }
  }
  function state_snapshot_uncloneable(properties) {
    if (DEV) {
      console.warn(
        `%c[svelte] state_snapshot_uncloneable
%c${properties ? `The following properties cannot be cloned with \`$state.snapshot\` — the return value contains the originals:

${properties}` : "Value cannot be cloned with `$state.snapshot` — the original value was returned"}
https://svelte.dev/e/state_snapshot_uncloneable`,
        bold,
        normal
      );
    } else {
      console.warn(`https://svelte.dev/e/state_snapshot_uncloneable`);
    }
  }
  const empty = [];
  function snapshot(value, skip_warning = false, no_tojson = false) {
    if (DEV && !skip_warning) {
      const paths = [];
      const copy = clone(value, /* @__PURE__ */ new Map(), "", paths, null, no_tojson);
      if (paths.length === 1 && paths[0] === "") {
        state_snapshot_uncloneable();
      } else if (paths.length > 0) {
        const slice = paths.length > 10 ? paths.slice(0, 7) : paths.slice(0, 10);
        const excess = paths.length - slice.length;
        let uncloned = slice.map((path) => `- <value>${path}`).join("\n");
        if (excess > 0) uncloned += `
- ...and ${excess} more`;
        state_snapshot_uncloneable(uncloned);
      }
      return copy;
    }
    return clone(value, /* @__PURE__ */ new Map(), "", empty, null, no_tojson);
  }
  function clone(value, cloned, path, paths, original = null, no_tojson = false) {
    if (typeof value === "object" && value !== null) {
      var unwrapped = cloned.get(value);
      if (unwrapped !== void 0) return unwrapped;
      if (value instanceof Map) return (
        /** @type {Snapshot<T>} */
        new Map(value)
      );
      if (value instanceof Set) return (
        /** @type {Snapshot<T>} */
        new Set(value)
      );
      if (is_array(value)) {
        var copy = (
          /** @type {Snapshot<any>} */
          Array(value.length)
        );
        cloned.set(value, copy);
        if (original !== null) {
          cloned.set(original, copy);
        }
        for (var i = 0; i < value.length; i += 1) {
          var element2 = value[i];
          if (i in value) {
            copy[i] = clone(element2, cloned, DEV ? `${path}[${i}]` : path, paths, null, no_tojson);
          }
        }
        return copy;
      }
      if (get_prototype_of(value) === object_prototype) {
        copy = {};
        cloned.set(value, copy);
        if (original !== null) {
          cloned.set(original, copy);
        }
        for (var key2 of Object.keys(value)) {
          copy[key2] = clone(
            // @ts-expect-error
            value[key2],
            cloned,
            DEV ? `${path}.${key2}` : path,
            paths,
            null,
            no_tojson
          );
        }
        return copy;
      }
      if (value instanceof Date) {
        return (
          /** @type {Snapshot<T>} */
          structuredClone(value)
        );
      }
      if (typeof /** @type {T & { toJSON?: any } } */
      value.toJSON === "function" && !no_tojson) {
        return clone(
          /** @type {T & { toJSON(): any } } */
          value.toJSON(),
          cloned,
          DEV ? `${path}.toJSON()` : path,
          paths,
          // Associate the instance with the toJSON clone
          value
        );
      }
    }
    if (value instanceof EventTarget) {
      return (
        /** @type {Snapshot<T>} */
        value
      );
    }
    try {
      return (
        /** @type {Snapshot<T>} */
        structuredClone(value)
      );
    } catch (e) {
      if (DEV) {
        paths.push(path);
      }
      return (
        /** @type {Snapshot<T>} */
        value
      );
    }
  }
  let tracing_expressions = null;
  function log_entry(signal, entry) {
    const value = signal.v;
    if (value === UNINITIALIZED) {
      return;
    }
    const type = get_type(signal);
    const current_reaction = (
      /** @type {Reaction} */
      active_reaction
    );
    const dirty = signal.wv > current_reaction.wv || current_reaction.wv === 0;
    const style = dirty ? "color: CornflowerBlue; font-weight: bold" : "color: grey; font-weight: normal";
    console.groupCollapsed(
      signal.label ? `%c${type}%c ${signal.label}` : `%c${type}%c`,
      style,
      dirty ? "font-weight: normal" : style,
      typeof value === "object" && value !== null && STATE_SYMBOL in value ? snapshot(value, true) : value
    );
    if (type === "$derived") {
      const deps = new Set(
        /** @type {Derived} */
        signal.deps
      );
      for (const dep of deps) {
        log_entry(dep);
      }
    }
    if (signal.created) {
      console.log(signal.created);
    }
    if (dirty && signal.updated) {
      for (const updated of signal.updated.values()) {
        if (updated.error) {
          console.log(updated.error);
        }
      }
    }
    if (entry) {
      for (var trace2 of entry.traces) {
        console.log(trace2);
      }
    }
    console.groupEnd();
  }
  function get_type(signal) {
    var _a2;
    if ((signal.f & (DERIVED | ASYNC)) !== 0) return "$derived";
    return ((_a2 = signal.label) == null ? void 0 : _a2.startsWith("$")) ? "store" : "$state";
  }
  function trace(label2, fn) {
    var previously_tracing_expressions = tracing_expressions;
    try {
      tracing_expressions = { entries: /* @__PURE__ */ new Map(), reaction: active_reaction };
      var start = performance.now();
      var value = fn();
      var time = (performance.now() - start).toFixed(2);
      var prefix = untrack(label2);
      if (!effect_tracking()) {
        console.log(`${prefix} %cran outside of an effect (${time}ms)`, "color: grey");
      } else if (tracing_expressions.entries.size === 0) {
        console.log(`${prefix} %cno reactive dependencies (${time}ms)`, "color: grey");
      } else {
        console.group(`${prefix} %c(${time}ms)`, "color: grey");
        var entries = tracing_expressions.entries;
        untrack(() => {
          for (const [signal, traces] of entries) {
            log_entry(signal, traces);
          }
        });
        tracing_expressions = null;
        console.groupEnd();
      }
      return value;
    } finally {
      tracing_expressions = previously_tracing_expressions;
    }
  }
  function tag(source2, label2) {
    source2.label = label2;
    tag_proxy(source2.v, label2);
    return source2;
  }
  function tag_proxy(value, label2) {
    var _a2;
    (_a2 = value == null ? void 0 : value[PROXY_PATH_SYMBOL]) == null ? void 0 : _a2.call(value, label2);
    return value;
  }
  function label(value) {
    if (typeof value === "symbol") return `Symbol(${value.description})`;
    if (typeof value === "function") return "<function>";
    if (typeof value === "object" && value) return "<object>";
    return String(value);
  }
  function get_error(label2) {
    const error = new Error();
    const stack2 = get_stack();
    if (stack2.length === 0) {
      return null;
    }
    stack2.unshift("\n");
    define_property(error, "stack", {
      value: stack2.join("\n")
    });
    define_property(error, "name", {
      value: label2
    });
    return (
      /** @type {Error & { stack: string }} */
      error
    );
  }
  function get_stack() {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    const stack2 = new Error().stack;
    Error.stackTraceLimit = limit;
    if (!stack2) return [];
    const lines = stack2.split("\n");
    const new_lines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const posixified = line.replaceAll("\\", "/");
      if (line.trim() === "Error") {
        continue;
      }
      if (line.includes("validate_each_keys")) {
        return [];
      }
      if (posixified.includes("svelte/src/internal") || posixified.includes("node_modules/.vite")) {
        continue;
      }
      new_lines.push(line);
    }
    return new_lines;
  }
  function invariant(condition, message) {
    if (!DEV) {
      throw new Error("invariant(...) was not guarded by if (DEV)");
    }
    if (!condition) invariant_violation(message);
  }
  let component_context = null;
  function set_component_context(context) {
    component_context = context;
  }
  let dev_stack = null;
  function set_dev_stack(stack2) {
    dev_stack = stack2;
  }
  function add_svelte_meta(callback, type, component2, line, column, additional) {
    const parent = dev_stack;
    dev_stack = {
      type,
      file: component2[FILENAME],
      line,
      column,
      parent,
      ...additional
    };
    try {
      return callback();
    } finally {
      dev_stack = parent;
    }
  }
  let dev_current_component_function = null;
  function set_dev_current_component_function(fn) {
    dev_current_component_function = fn;
  }
  function createContext() {
    const key2 = {};
    return [
      () => {
        if (!hasContext(key2)) {
          missing_context();
        }
        return getContext(key2);
      },
      (context) => setContext(key2, context)
    ];
  }
  function getContext(key2) {
    const context_map = get_or_init_context_map("getContext");
    const result = (
      /** @type {T} */
      context_map.get(key2)
    );
    return result;
  }
  function setContext(key2, context) {
    const context_map = get_or_init_context_map("setContext");
    if (async_mode_flag) {
      var flags2 = (
        /** @type {Effect} */
        active_effect.f
      );
      var valid = !active_reaction && (flags2 & BRANCH_EFFECT) !== 0 && // pop() runs synchronously, so this indicates we're setting context after an await
      !/** @type {ComponentContext} */
      component_context.i;
      if (!valid) {
        set_context_after_init();
      }
    }
    context_map.set(key2, context);
    return context;
  }
  function hasContext(key2) {
    const context_map = get_or_init_context_map("hasContext");
    return context_map.has(key2);
  }
  function getAllContexts() {
    const context_map = get_or_init_context_map("getAllContexts");
    return (
      /** @type {T} */
      context_map
    );
  }
  function push(props, runes = false, fn) {
    component_context = {
      p: component_context,
      i: false,
      c: null,
      e: null,
      s: props,
      x: null,
      r: (
        /** @type {Effect} */
        active_effect
      ),
      l: legacy_mode_flag && !runes ? { s: null, u: null, $: [] } : null
    };
    if (DEV) {
      component_context.function = fn;
      dev_current_component_function = fn;
    }
  }
  function pop(component2) {
    var context = (
      /** @type {ComponentContext} */
      component_context
    );
    var effects = context.e;
    if (effects !== null) {
      context.e = null;
      for (var fn of effects) {
        create_user_effect(fn);
      }
    }
    if (component2 !== void 0) {
      context.x = component2;
    }
    context.i = true;
    component_context = context.p;
    if (DEV) {
      dev_current_component_function = (component_context == null ? void 0 : component_context.function) ?? null;
    }
    return component2 ?? /** @type {T} */
    {};
  }
  function is_runes() {
    return !legacy_mode_flag || component_context !== null && component_context.l === null;
  }
  function get_or_init_context_map(name) {
    if (component_context === null) {
      lifecycle_outside_component(name);
    }
    return component_context.c ?? (component_context.c = new Map(get_parent_context(component_context) || void 0));
  }
  function get_parent_context(component_context2) {
    let parent = component_context2.p;
    while (parent !== null) {
      const context_map = parent.c;
      if (context_map !== null) {
        return context_map;
      }
      parent = parent.p;
    }
    return null;
  }
  let micro_tasks = [];
  function run_micro_tasks() {
    var tasks = micro_tasks;
    micro_tasks = [];
    run_all(tasks);
  }
  function queue_micro_task(fn) {
    if (micro_tasks.length === 0 && !is_flushing_sync) {
      var tasks = micro_tasks;
      queueMicrotask(() => {
        if (tasks === micro_tasks) run_micro_tasks();
      });
    }
    micro_tasks.push(fn);
  }
  function flush_tasks() {
    while (micro_tasks.length > 0) {
      run_micro_tasks();
    }
  }
  const adjustments = /* @__PURE__ */ new WeakMap();
  function handle_error(error) {
    var effect2 = active_effect;
    if (effect2 === null) {
      active_reaction.f |= ERROR_VALUE;
      return error;
    }
    if (DEV && error instanceof Error && !adjustments.has(error)) {
      adjustments.set(error, get_adjustments(error, effect2));
    }
    if ((effect2.f & REACTION_RAN) === 0 && (effect2.f & EFFECT) === 0) {
      if (DEV && !effect2.parent && error instanceof Error) {
        apply_adjustments(error);
      }
      throw error;
    }
    invoke_error_boundary(error, effect2);
  }
  function invoke_error_boundary(error, effect2) {
    while (effect2 !== null) {
      if ((effect2.f & BOUNDARY_EFFECT) !== 0) {
        if ((effect2.f & REACTION_RAN) === 0) {
          throw error;
        }
        try {
          effect2.b.error(error);
          return;
        } catch (e) {
          error = e;
        }
      }
      effect2 = effect2.parent;
    }
    if (DEV && error instanceof Error) {
      apply_adjustments(error);
    }
    throw error;
  }
  function get_adjustments(error, effect2) {
    var _a2, _b2, _c2;
    const message_descriptor = get_descriptor(error, "message");
    if (message_descriptor && !message_descriptor.configurable) return;
    var indent = is_firefox ? "  " : "	";
    var component_stack = `
${indent}in ${((_a2 = effect2.fn) == null ? void 0 : _a2.name) || "<unknown>"}`;
    var context = effect2.ctx;
    while (context !== null) {
      component_stack += `
${indent}in ${(_b2 = context.function) == null ? void 0 : _b2[FILENAME].split("/").pop()}`;
      context = context.p;
    }
    return {
      message: error.message + `
${component_stack}
`,
      stack: (_c2 = error.stack) == null ? void 0 : _c2.split("\n").filter((line) => !line.includes("svelte/src/internal")).join("\n")
    };
  }
  function apply_adjustments(error) {
    const adjusted = adjustments.get(error);
    if (adjusted) {
      define_property(error, "message", {
        value: adjusted.message
      });
      define_property(error, "stack", {
        value: adjusted.stack
      });
    }
  }
  const STATUS_MASK = ~(DIRTY | MAYBE_DIRTY | CLEAN);
  function set_signal_status(signal, status) {
    signal.f = signal.f & STATUS_MASK | status;
  }
  function update_derived_status(derived2) {
    if ((derived2.f & CONNECTED) !== 0 || derived2.deps === null) {
      set_signal_status(derived2, CLEAN);
    } else {
      set_signal_status(derived2, MAYBE_DIRTY);
    }
  }
  function clear_marked(deps) {
    if (deps === null) return;
    for (const dep of deps) {
      if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
        continue;
      }
      dep.f ^= WAS_MARKED;
      clear_marked(
        /** @type {Derived} */
        dep.deps
      );
    }
  }
  function defer_effect(effect2, dirty_effects, maybe_dirty_effects) {
    if ((effect2.f & DIRTY) !== 0) {
      dirty_effects.add(effect2);
    } else if ((effect2.f & MAYBE_DIRTY) !== 0) {
      maybe_dirty_effects.add(effect2);
    }
    clear_marked(effect2.deps);
    set_signal_status(effect2, CLEAN);
  }
  function subscribe_to_store(store, run2, invalidate) {
    if (store == null) {
      run2(void 0);
      if (invalidate) invalidate(void 0);
      return noop;
    }
    const unsub = untrack(
      () => store.subscribe(
        run2,
        // @ts-expect-error
        invalidate
      )
    );
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
  }
  const subscriber_queue = [];
  function readable(value, start) {
    return {
      subscribe: writable(value, start).subscribe
    };
  }
  function writable(value, start = noop) {
    let stop = null;
    const subscribers = /* @__PURE__ */ new Set();
    function set2(new_value) {
      if (safe_not_equal(value, new_value)) {
        value = new_value;
        if (stop) {
          const run_queue = !subscriber_queue.length;
          for (const subscriber of subscribers) {
            subscriber[1]();
            subscriber_queue.push(subscriber, value);
          }
          if (run_queue) {
            for (let i = 0; i < subscriber_queue.length; i += 2) {
              subscriber_queue[i][0](subscriber_queue[i + 1]);
            }
            subscriber_queue.length = 0;
          }
        }
      }
    }
    function update2(fn) {
      set2(fn(
        /** @type {T} */
        value
      ));
    }
    function subscribe(run2, invalidate = noop) {
      const subscriber = [run2, invalidate];
      subscribers.add(subscriber);
      if (subscribers.size === 1) {
        stop = start(set2, update2) || noop;
      }
      run2(
        /** @type {T} */
        value
      );
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    }
    return { set: set2, update: update2, subscribe };
  }
  function derived$1(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single ? [stores] : stores;
    if (!stores_array.every(Boolean)) {
      throw new Error("derived() expects stores as input, got a falsy value");
    }
    const auto = fn.length < 2;
    return readable(initial_value, (set2, update2) => {
      let started = false;
      const values = [];
      let pending2 = 0;
      let cleanup = noop;
      const sync = () => {
        if (pending2) {
          return;
        }
        cleanup();
        const result = fn(single ? values[0] : values, set2, update2);
        if (auto) {
          set2(result);
        } else {
          cleanup = typeof result === "function" ? result : noop;
        }
      };
      const unsubscribers = stores_array.map(
        (store, i) => subscribe_to_store(
          store,
          (value) => {
            values[i] = value;
            pending2 &= ~(1 << i);
            if (started) {
              sync();
            }
          },
          () => {
            pending2 |= 1 << i;
          }
        )
      );
      started = true;
      sync();
      return function stop() {
        run_all(unsubscribers);
        cleanup();
        started = false;
      };
    });
  }
  function readonly(store) {
    return {
      // @ts-expect-error TODO i suspect the bind is unnecessary
      subscribe: store.subscribe.bind(store)
    };
  }
  function get$1(store) {
    let value;
    subscribe_to_store(store, (_) => value = _)();
    return value;
  }
  let legacy_is_updating_store = false;
  let is_store_binding = false;
  let IS_UNMOUNTED = Symbol();
  function store_get(store, store_name, stores) {
    const entry = stores[store_name] ?? (stores[store_name] = {
      store: null,
      source: /* @__PURE__ */ mutable_source(void 0),
      unsubscribe: noop
    });
    if (DEV) {
      entry.source.label = store_name;
    }
    if (entry.store !== store && !(IS_UNMOUNTED in stores)) {
      entry.unsubscribe();
      entry.store = store ?? null;
      if (store == null) {
        entry.source.v = void 0;
        entry.unsubscribe = noop;
      } else {
        var is_synchronous_callback = true;
        entry.unsubscribe = subscribe_to_store(store, (v) => {
          if (is_synchronous_callback) {
            entry.source.v = v;
          } else {
            set(entry.source, v);
          }
        });
        is_synchronous_callback = false;
      }
    }
    if (store && IS_UNMOUNTED in stores) {
      return get$1(store);
    }
    return get(entry.source);
  }
  function store_unsub(store, store_name, stores) {
    let entry = stores[store_name];
    if (entry && entry.store !== store) {
      entry.unsubscribe();
      entry.unsubscribe = noop;
    }
    return store;
  }
  function store_set(store, value) {
    update_with_flag(store, value);
    return value;
  }
  function invalidate_store(stores, store_name) {
    var entry = stores[store_name];
    if (entry.store !== null) {
      store_set(entry.store, entry.source.v);
    }
  }
  function setup_stores() {
    const stores = {};
    function cleanup() {
      teardown(() => {
        for (var store_name in stores) {
          const ref = stores[store_name];
          ref.unsubscribe();
        }
        define_property(stores, IS_UNMOUNTED, {
          enumerable: false,
          value: true
        });
      });
    }
    return [stores, cleanup];
  }
  function update_with_flag(store, value) {
    legacy_is_updating_store = true;
    try {
      store.set(value);
    } finally {
      legacy_is_updating_store = false;
    }
  }
  function store_mutate(store, expression, new_value) {
    update_with_flag(store, new_value);
    return expression;
  }
  function update_store(store, store_value, d = 1) {
    update_with_flag(store, store_value + d);
    return store_value;
  }
  function update_pre_store(store, store_value, d = 1) {
    const value = store_value + d;
    update_with_flag(store, value);
    return value;
  }
  function mark_store_binding() {
    is_store_binding = true;
  }
  function capture_store_binding(fn) {
    var previous_is_store_binding = is_store_binding;
    try {
      is_store_binding = false;
      return [fn(), is_store_binding];
    } finally {
      is_store_binding = previous_is_store_binding;
    }
  }
  function root$7(effect2) {
    while (effect2.parent !== null) {
      effect2 = effect2.parent;
    }
    return effect2;
  }
  function effect_label(effect2, append_effect = false) {
    const flags2 = effect2.f;
    let label2 = `(unknown ${append_effect ? "effect" : ""})`;
    if ((flags2 & ROOT_EFFECT) !== 0) {
      label2 = "root";
    } else if ((flags2 & BOUNDARY_EFFECT) !== 0) {
      label2 = "boundary";
    } else if ((flags2 & BLOCK_EFFECT) !== 0) {
      label2 = "block";
    } else if ((flags2 & MANAGED_EFFECT) !== 0) {
      label2 = "managed";
    } else if ((flags2 & ASYNC) !== 0) {
      label2 = "async";
    } else if ((flags2 & BRANCH_EFFECT) !== 0) {
      label2 = "branch";
    } else if ((flags2 & RENDER_EFFECT) !== 0) {
      label2 = "render effect";
    } else if ((flags2 & EFFECT) !== 0) {
      label2 = "effect";
    }
    if (append_effect && !label2.endsWith("effect")) {
      label2 += " effect";
    }
    return label2;
  }
  function log_effect_tree(effect2, highlighted = [], depth = 0, is_reachable = true) {
    var _a2;
    const flags2 = effect2.f;
    let label2 = effect_label(effect2);
    let status = (flags2 & CLEAN) !== 0 ? "clean" : (flags2 & MAYBE_DIRTY) !== 0 ? "maybe dirty" : "dirty";
    let styles = [`font-weight: ${status === "clean" ? "normal" : "bold"}`];
    if (status !== "clean" && !is_reachable) {
      label2 = `⚠️ ${label2}`;
      styles.push(`color: red`);
    }
    if ((flags2 & INERT) !== 0) {
      styles.push("font-style: italic");
    }
    if (highlighted.includes(effect2)) {
      styles.push("background-color: yellow");
    }
    console.group(`%c${label2} (${status})`, styles.join("; "));
    if (depth === 0) {
      const callsite = (_a2 = new Error().stack) == null ? void 0 : _a2.split("\n")[2].replace(/\s+at (?: \w+\(?)?(.+)\)?/, (m, $1) => $1.replace(/\?[^:]+/, ""));
      console.log(callsite);
    } else {
      console.groupCollapsed(`%cfn`, `font-weight: normal`);
      console.log(effect2.fn);
      console.groupEnd();
    }
    if (effect2.deps !== null) {
      console.groupCollapsed("%cdeps", "font-weight: normal");
      for (const dep of effect2.deps) {
        log_dep(dep);
      }
      console.groupEnd();
    }
    if (effect2.nodes) {
      console.log(effect2.nodes.start);
      if (effect2.nodes.start !== effect2.nodes.end) {
        console.log(effect2.nodes.end);
      }
    }
    var child_is_reachable = is_reachable && ((flags2 & BRANCH_EFFECT) === 0 || (flags2 & CLEAN) === 0);
    let child2 = effect2.first;
    while (child2 !== null) {
      log_effect_tree(child2, highlighted, depth + 1, child_is_reachable);
      child2 = child2.next;
    }
    console.groupEnd();
  }
  function log_dep(dep) {
    if ((dep.f & DERIVED) !== 0) {
      const derived2 = (
        /** @type {Derived} */
        dep
      );
      console.groupCollapsed(
        `%c$derived %c${dep.label ?? "<unknown>"}`,
        "font-weight: bold; color: CornflowerBlue",
        "font-weight: normal",
        untrack(() => snapshot(derived2.v))
      );
      if (derived2.deps) {
        for (const d of derived2.deps) {
          log_dep(d);
        }
      }
      console.groupEnd();
    } else {
      console.log(
        `%c$state %c${dep.label ?? "<unknown>"}`,
        "font-weight: bold; color: CornflowerBlue",
        "font-weight: normal",
        untrack(() => snapshot(dep.v))
      );
    }
  }
  function log_reactions(signal) {
    const visited = /* @__PURE__ */ new Set();
    function get_derived_flag_names(flags2) {
      const names = [];
      if ((flags2 & CLEAN) !== 0) names.push("CLEAN");
      if ((flags2 & DIRTY) !== 0) names.push("DIRTY");
      if ((flags2 & MAYBE_DIRTY) !== 0) names.push("MAYBE_DIRTY");
      if ((flags2 & CONNECTED) !== 0) names.push("CONNECTED");
      if ((flags2 & WAS_MARKED) !== 0) names.push("WAS_MARKED");
      if ((flags2 & INERT) !== 0) names.push("INERT");
      if ((flags2 & DESTROYED) !== 0) names.push("DESTROYED");
      return names;
    }
    function log_derived(d, depth) {
      const flags2 = d.f;
      const flag_names = get_derived_flag_names(flags2);
      const flags_str = flag_names.length > 0 ? `(${flag_names.join(", ")})` : "(no flags)";
      console.group(
        `%c${flags2 & DERIVED ? "$derived" : "$state"} %c${d.label ?? "<unknown>"} %c${flags_str}`,
        "font-weight: bold; color: CornflowerBlue",
        "font-weight: normal; color: inherit",
        "font-weight: normal; color: gray"
      );
      console.log(untrack(() => snapshot(d.v)));
      if ("fn" in d) {
        console.log("%cfn:", "font-weight: bold", d.fn);
      }
      if (d.reactions !== null && d.reactions.length > 0) {
        console.group("%creactions", "font-weight: bold");
        for (const reaction of d.reactions) {
          if ((reaction.f & DERIVED) !== 0) {
            const derived_reaction = (
              /** @type {Derived} */
              reaction
            );
            if (visited.has(derived_reaction)) {
              console.log(
                `%c$derived %c${derived_reaction.label ?? "<unknown>"} %c(already seen)`,
                "font-weight: bold; color: CornflowerBlue",
                "font-weight: normal; color: inherit",
                "font-weight: bold; color: orange"
              );
            } else {
              visited.add(derived_reaction);
              log_derived(derived_reaction, depth + 1);
            }
          } else {
            let check_reachable = function(effect2) {
              if (effect2 === null || reachable) return;
              if (effect2 === reaction) {
                reachable = true;
                return;
              }
              if (effect2.f & DESTROYED) return;
              if (seen_effects.has(effect2)) {
                throw new Error("");
              }
              seen_effects.add(effect2);
              let child2 = effect2.first;
              while (child2 !== null) {
                check_reachable(child2);
                child2 = child2.next;
              }
            };
            const label2 = effect_label(
              /** @type {Effect} */
              reaction,
              true
            );
            const status = (flags2 & MAYBE_DIRTY) !== 0 ? "maybe dirty" : "dirty";
            const parent_statuses = [];
            let show = false;
            let current = (
              /** @type {Effect} */
              reaction.parent
            );
            while (current !== null) {
              const parent_flags = current.f;
              if ((parent_flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
                const parent_status = (parent_flags & CLEAN) !== 0 ? "clean" : "not clean";
                if (parent_status === "clean" && parent_statuses.includes("not clean")) show = true;
                parent_statuses.push(parent_status);
              }
              if (!current.parent) break;
              current = current.parent;
            }
            const seen_effects = /* @__PURE__ */ new Set();
            let reachable = false;
            try {
              if (current) check_reachable(current);
            } catch (e) {
              console.log(
                `%c⚠️ Circular reference detected in effect tree`,
                "font-weight: bold; color: red",
                seen_effects
              );
            }
            if (!reachable) {
              console.log(
                `%c⚠️ Effect is NOT reachable from its parent chain`,
                "font-weight: bold; color: red"
              );
            }
            const parent_status_str = show ? ` (${parent_statuses.join(", ")})` : "";
            console.log(
              `%c${label2} (${status})${parent_status_str}`,
              `font-weight: bold; color: ${parent_status_str ? "red" : "green"}`,
              reaction
            );
          }
        }
        console.groupEnd();
      } else {
        console.log("%cno reactions", "font-style: italic; color: gray");
      }
      console.groupEnd();
    }
    console.group(`%cDerived Reactions Graph`, "font-weight: bold; color: purple");
    visited.add(signal);
    log_derived(signal, 0);
    console.groupEnd();
  }
  function log_inconsistent_branches(effect2) {
    const root_effect = root$7(effect2);
    function collect_branches(eff, parent_clean) {
      const branches2 = [];
      const flags2 = eff.f;
      const is_branch = (flags2 & BRANCH_EFFECT) !== 0;
      if (is_branch) {
        const status = (flags2 & CLEAN) !== 0 ? "clean" : (flags2 & MAYBE_DIRTY) !== 0 ? "maybe dirty" : "dirty";
        const child_branches = [];
        let child2 = eff.first;
        while (child2 !== null) {
          child_branches.push(...collect_branches(child2, status === "clean"));
          child2 = child2.next;
        }
        branches2.push({
          effect: eff,
          status,
          parent_clean,
          children: child_branches
        });
      } else {
        let child2 = eff.first;
        while (child2 !== null) {
          branches2.push(...collect_branches(child2, parent_clean));
          child2 = child2.next;
        }
      }
      return branches2;
    }
    function has_inconsistency(branch2, ancestor_clean) {
      const is_inconsistent = ancestor_clean && branch2.status !== "clean";
      if (is_inconsistent) return true;
      const new_ancestor_clean = ancestor_clean || branch2.status === "clean";
      for (const child2 of branch2.children) {
        if (has_inconsistency(child2, new_ancestor_clean)) return true;
      }
      return false;
    }
    function log_branch(branch2, ancestor_clean, depth) {
      const is_inconsistent = ancestor_clean && branch2.status !== "clean";
      const new_ancestor_clean = ancestor_clean || branch2.status === "clean";
      if (!has_inconsistency(branch2, ancestor_clean) && !is_inconsistent) {
        return;
      }
      const style = is_inconsistent ? "font-weight: bold; color: red" : branch2.status === "clean" ? "font-weight: normal; color: green" : "font-weight: bold; color: orange";
      const warning = is_inconsistent ? " ⚠️ INCONSISTENT" : "";
      console.group(`%cbranch (${branch2.status})${warning}`, style);
      console.log("%ceffect:", "font-weight: bold", branch2.effect);
      if (branch2.effect.fn) {
        console.log("%cfn:", "font-weight: bold", branch2.effect.fn);
      }
      if (branch2.effect.deps !== null) {
        console.groupCollapsed("%cdeps", "font-weight: normal");
        for (const dep of branch2.effect.deps) {
          log_dep(dep);
        }
        console.groupEnd();
      }
      if (is_inconsistent) {
        log_effect_tree(branch2.effect);
      } else if (branch2.children.length > 0) {
        console.group("%cchild branches", "font-weight: bold");
        for (const child2 of branch2.children) {
          log_branch(child2, new_ancestor_clean, depth + 1);
        }
        console.groupEnd();
      }
      console.groupEnd();
    }
    const branches = collect_branches(root_effect, false);
    let has_any_inconsistency = false;
    for (const branch2 of branches) {
      if (has_inconsistency(branch2, false)) {
        has_any_inconsistency = true;
        break;
      }
    }
    if (!has_any_inconsistency) {
      console.log("%cNo inconsistent branches found", "font-weight: bold; color: green");
      return;
    }
    console.group(`%cInconsistent Branches (non-clean below clean)`, "font-weight: bold; color: red");
    for (const branch2 of branches) {
      log_branch(branch2, false, 0);
    }
    console.groupEnd();
    return true;
  }
  const batches = /* @__PURE__ */ new Set();
  let current_batch = null;
  let previous_batch = null;
  let batch_values = null;
  let last_scheduled_effect = null;
  let is_flushing_sync = false;
  let is_processing = false;
  let collected_effects = null;
  let legacy_updates = null;
  var flush_count = 0;
  var source_stacks = DEV ? /* @__PURE__ */ new Set() : null;
  let uid = 1;
  const _Batch = class _Batch {
    constructor() {
      __privateAdd(this, _Batch_instances);
      __publicField(this, "id", uid++);
      /**
       * The current values of any signals that are updated in this batch.
       * Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
       * They keys of this map are identical to `this.#previous`
       * @type {Map<Value, [any, boolean]>}
       */
      __publicField(this, "current", /* @__PURE__ */ new Map());
      /**
       * The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
       * They keys of this map are identical to `this.#current`
       * @type {Map<Value, any>}
       */
      __publicField(this, "previous", /* @__PURE__ */ new Map());
      /**
       * When the batch is committed (and the DOM is updated), we need to remove old branches
       * and append new ones by calling the functions added inside (if/each/key/etc) blocks
       * @type {Set<(batch: Batch) => void>}
       */
      __privateAdd(this, _commit_callbacks, /* @__PURE__ */ new Set());
      /**
       * If a fork is discarded, we need to destroy any effects that are no longer needed
       * @type {Set<(batch: Batch) => void>}
       */
      __privateAdd(this, _discard_callbacks, /* @__PURE__ */ new Set());
      /**
       * Callbacks that should run only when a fork is committed.
       * @type {Set<(batch: Batch) => void>}
       */
      __privateAdd(this, _fork_commit_callbacks, /* @__PURE__ */ new Set());
      /**
       * Async effects that are currently in flight
       * @type {Map<Effect, number>}
       */
      __privateAdd(this, _pending, /* @__PURE__ */ new Map());
      /**
       * Async effects that are currently in flight, _not_ inside a pending boundary
       * @type {Map<Effect, number>}
       */
      __privateAdd(this, _blocking_pending, /* @__PURE__ */ new Map());
      /**
       * A deferred that resolves when the batch is committed, used with `settled()`
       * TODO replace with Promise.withResolvers once supported widely enough
       * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
       */
      __privateAdd(this, _deferred, null);
      /**
       * The root effects that need to be flushed
       * @type {Effect[]}
       */
      __privateAdd(this, _roots, []);
      /**
       * Effects created while this batch was active.
       * @type {Effect[]}
       */
      __privateAdd(this, _new_effects, []);
      /**
       * Deferred effects (which run after async work has completed) that are DIRTY
       * @type {Set<Effect>}
       */
      __privateAdd(this, _dirty_effects, /* @__PURE__ */ new Set());
      /**
       * Deferred effects that are MAYBE_DIRTY
       * @type {Set<Effect>}
       */
      __privateAdd(this, _maybe_dirty_effects, /* @__PURE__ */ new Set());
      /**
       * A map of branches that still exist, but will be destroyed when this batch
       * is committed — we skip over these during `process`.
       * The value contains child effects that were dirty/maybe_dirty before being reset,
       * so they can be rescheduled if the branch survives.
       * @type {Map<Effect, { d: Effect[], m: Effect[] }>}
       */
      __privateAdd(this, _skipped_branches, /* @__PURE__ */ new Map());
      /**
       * Inverse of #skipped_branches which we need to tell prior batches to unskip them when committing
       * @type {Set<Effect>}
       */
      __privateAdd(this, _unskipped_branches, /* @__PURE__ */ new Set());
      __publicField(this, "is_fork", false);
      __privateAdd(this, _decrement_queued, false);
      /** @type {Set<Batch>} */
      __privateAdd(this, _blockers, /* @__PURE__ */ new Set());
    }
    /**
     * Add an effect to the #skipped_branches map and reset its children
     * @param {Effect} effect
     */
    skip_effect(effect2) {
      if (!__privateGet(this, _skipped_branches).has(effect2)) {
        __privateGet(this, _skipped_branches).set(effect2, { d: [], m: [] });
      }
      __privateGet(this, _unskipped_branches).delete(effect2);
    }
    /**
     * Remove an effect from the #skipped_branches map and reschedule
     * any tracked dirty/maybe_dirty child effects
     * @param {Effect} effect
     * @param {(e: Effect) => void} callback
     */
    unskip_effect(effect2, callback = (e) => this.schedule(e)) {
      var tracked = __privateGet(this, _skipped_branches).get(effect2);
      if (tracked) {
        __privateGet(this, _skipped_branches).delete(effect2);
        for (var e of tracked.d) {
          set_signal_status(e, DIRTY);
          callback(e);
        }
        for (e of tracked.m) {
          set_signal_status(e, MAYBE_DIRTY);
          callback(e);
        }
      }
      __privateGet(this, _unskipped_branches).add(effect2);
    }
    /**
     * Associate a change to a given source with the current
     * batch, noting its previous and current values
     * @param {Value} source
     * @param {any} value
     * @param {boolean} [is_derived]
     */
    capture(source2, value, is_derived = false) {
      if (source2.v !== UNINITIALIZED && !this.previous.has(source2)) {
        this.previous.set(source2, source2.v);
      }
      if ((source2.f & ERROR_VALUE) === 0) {
        this.current.set(source2, [value, is_derived]);
        batch_values == null ? void 0 : batch_values.set(source2, value);
      }
      if (!this.is_fork) {
        source2.v = value;
      }
    }
    activate() {
      current_batch = this;
    }
    deactivate() {
      current_batch = null;
      batch_values = null;
    }
    flush() {
      var source_stacks2 = DEV ? /* @__PURE__ */ new Set() : null;
      try {
        is_processing = true;
        current_batch = this;
        __privateMethod(this, _Batch_instances, process_fn).call(this);
      } finally {
        flush_count = 0;
        last_scheduled_effect = null;
        collected_effects = null;
        legacy_updates = null;
        is_processing = false;
        current_batch = null;
        batch_values = null;
        old_values.clear();
        if (DEV) {
          for (
            const source2 of
            /** @type {Set<Source>} */
            source_stacks2
          ) {
            source2.updated = null;
          }
        }
      }
    }
    discard() {
      for (const fn of __privateGet(this, _discard_callbacks)) fn(this);
      __privateGet(this, _discard_callbacks).clear();
      __privateGet(this, _fork_commit_callbacks).clear();
      batches.delete(this);
    }
    /**
     * @param {Effect} effect
     */
    register_created_effect(effect2) {
      __privateGet(this, _new_effects).push(effect2);
    }
    /**
     * @param {boolean} blocking
     * @param {Effect} effect
     */
    increment(blocking, effect2) {
      let pending_count = __privateGet(this, _pending).get(effect2) ?? 0;
      __privateGet(this, _pending).set(effect2, pending_count + 1);
      if (blocking) {
        let blocking_pending_count = __privateGet(this, _blocking_pending).get(effect2) ?? 0;
        __privateGet(this, _blocking_pending).set(effect2, blocking_pending_count + 1);
      }
    }
    /**
     * @param {boolean} blocking
     * @param {Effect} effect
     * @param {boolean} skip - whether to skip updates (because this is triggered by a stale reaction)
     */
    decrement(blocking, effect2, skip) {
      let pending_count = __privateGet(this, _pending).get(effect2) ?? 0;
      if (pending_count === 1) {
        __privateGet(this, _pending).delete(effect2);
      } else {
        __privateGet(this, _pending).set(effect2, pending_count - 1);
      }
      if (blocking) {
        let blocking_pending_count = __privateGet(this, _blocking_pending).get(effect2) ?? 0;
        if (blocking_pending_count === 1) {
          __privateGet(this, _blocking_pending).delete(effect2);
        } else {
          __privateGet(this, _blocking_pending).set(effect2, blocking_pending_count - 1);
        }
      }
      if (__privateGet(this, _decrement_queued) || skip) return;
      __privateSet(this, _decrement_queued, true);
      queue_micro_task(() => {
        __privateSet(this, _decrement_queued, false);
        this.flush();
      });
    }
    /**
     * @param {Set<Effect>} dirty_effects
     * @param {Set<Effect>} maybe_dirty_effects
     */
    transfer_effects(dirty_effects, maybe_dirty_effects) {
      for (const e of dirty_effects) {
        __privateGet(this, _dirty_effects).add(e);
      }
      for (const e of maybe_dirty_effects) {
        __privateGet(this, _maybe_dirty_effects).add(e);
      }
      dirty_effects.clear();
      maybe_dirty_effects.clear();
    }
    /** @param {(batch: Batch) => void} fn */
    oncommit(fn) {
      __privateGet(this, _commit_callbacks).add(fn);
    }
    /** @param {(batch: Batch) => void} fn */
    ondiscard(fn) {
      __privateGet(this, _discard_callbacks).add(fn);
    }
    /** @param {(batch: Batch) => void} fn */
    on_fork_commit(fn) {
      __privateGet(this, _fork_commit_callbacks).add(fn);
    }
    run_fork_commit_callbacks() {
      for (const fn of __privateGet(this, _fork_commit_callbacks)) fn(this);
      __privateGet(this, _fork_commit_callbacks).clear();
    }
    settled() {
      return (__privateGet(this, _deferred) ?? __privateSet(this, _deferred, deferred())).promise;
    }
    static ensure() {
      if (current_batch === null) {
        const batch = current_batch = new _Batch();
        if (!is_processing) {
          batches.add(current_batch);
          if (!is_flushing_sync) {
            queue_micro_task(() => {
              if (current_batch !== batch) {
                return;
              }
              batch.flush();
            });
          }
        }
      }
      return current_batch;
    }
    apply() {
      if (!async_mode_flag || !this.is_fork && batches.size === 1) {
        batch_values = null;
        return;
      }
      batch_values = /* @__PURE__ */ new Map();
      for (const [source2, [value]] of this.current) {
        batch_values.set(source2, value);
      }
      for (const batch of batches) {
        if (batch === this || batch.is_fork) continue;
        var intersects = false;
        var differs = false;
        if (batch.id < this.id) {
          for (const [source2, [, is_derived]] of batch.current) {
            if (is_derived) continue;
            intersects || (intersects = this.current.has(source2));
            differs || (differs = !this.current.has(source2));
          }
        }
        if (intersects && differs) {
          __privateGet(this, _blockers).add(batch);
        } else {
          for (const [source2, previous] of batch.previous) {
            if (!batch_values.has(source2)) {
              batch_values.set(source2, previous);
            }
          }
        }
      }
    }
    /**
     *
     * @param {Effect} effect
     */
    schedule(effect2) {
      var _a2;
      last_scheduled_effect = effect2;
      if (((_a2 = effect2.b) == null ? void 0 : _a2.is_pending) && (effect2.f & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0 && (effect2.f & REACTION_RAN) === 0) {
        effect2.b.defer_effect(effect2);
        return;
      }
      var e = effect2;
      while (e.parent !== null) {
        e = e.parent;
        var flags2 = e.f;
        if (collected_effects !== null && e === active_effect) {
          if (async_mode_flag) return;
          if ((active_reaction === null || (active_reaction.f & DERIVED) === 0) && !legacy_is_updating_store) {
            return;
          }
        }
        if ((flags2 & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
          if ((flags2 & CLEAN) === 0) {
            return;
          }
          e.f ^= CLEAN;
        }
      }
      __privateGet(this, _roots).push(e);
    }
  };
  _commit_callbacks = new WeakMap();
  _discard_callbacks = new WeakMap();
  _fork_commit_callbacks = new WeakMap();
  _pending = new WeakMap();
  _blocking_pending = new WeakMap();
  _deferred = new WeakMap();
  _roots = new WeakMap();
  _new_effects = new WeakMap();
  _dirty_effects = new WeakMap();
  _maybe_dirty_effects = new WeakMap();
  _skipped_branches = new WeakMap();
  _unskipped_branches = new WeakMap();
  _decrement_queued = new WeakMap();
  _blockers = new WeakMap();
  _Batch_instances = new WeakSet();
  is_deferred_fn = function() {
    return this.is_fork || __privateGet(this, _blocking_pending).size > 0;
  };
  is_blocked_fn = function() {
    for (const batch of __privateGet(this, _blockers)) {
      for (const effect2 of __privateGet(batch, _blocking_pending).keys()) {
        var skipped = false;
        var e = effect2;
        while (e.parent !== null) {
          if (__privateGet(this, _skipped_branches).has(e)) {
            skipped = true;
            break;
          }
          e = e.parent;
        }
        if (!skipped) {
          return true;
        }
      }
    }
    return false;
  };
  process_fn = function() {
    var _a2, _b2;
    if (flush_count++ > 1e3) {
      batches.delete(this);
      infinite_loop_guard();
    }
    if (!__privateMethod(this, _Batch_instances, is_deferred_fn).call(this)) {
      for (const e of __privateGet(this, _dirty_effects)) {
        __privateGet(this, _maybe_dirty_effects).delete(e);
        set_signal_status(e, DIRTY);
        this.schedule(e);
      }
      for (const e of __privateGet(this, _maybe_dirty_effects)) {
        set_signal_status(e, MAYBE_DIRTY);
        this.schedule(e);
      }
    }
    const roots = __privateGet(this, _roots);
    __privateSet(this, _roots, []);
    this.apply();
    var effects = collected_effects = [];
    var render_effects = [];
    var updates = legacy_updates = [];
    for (const root2 of roots) {
      try {
        __privateMethod(this, _Batch_instances, traverse_fn).call(this, root2, effects, render_effects);
      } catch (e) {
        reset_all(root2);
        throw e;
      }
    }
    current_batch = null;
    if (updates.length > 0) {
      var batch = _Batch.ensure();
      for (const e of updates) {
        batch.schedule(e);
      }
    }
    collected_effects = null;
    legacy_updates = null;
    if (__privateMethod(this, _Batch_instances, is_deferred_fn).call(this) || __privateMethod(this, _Batch_instances, is_blocked_fn).call(this)) {
      __privateMethod(this, _Batch_instances, defer_effects_fn).call(this, render_effects);
      __privateMethod(this, _Batch_instances, defer_effects_fn).call(this, effects);
      for (const [e, t] of __privateGet(this, _skipped_branches)) {
        reset_branch(e, t);
      }
    } else {
      if (__privateGet(this, _pending).size === 0) {
        batches.delete(this);
      }
      __privateGet(this, _dirty_effects).clear();
      __privateGet(this, _maybe_dirty_effects).clear();
      for (const fn of __privateGet(this, _commit_callbacks)) fn(this);
      __privateGet(this, _commit_callbacks).clear();
      previous_batch = this;
      flush_queued_effects(render_effects);
      flush_queued_effects(effects);
      previous_batch = null;
      (_a2 = __privateGet(this, _deferred)) == null ? void 0 : _a2.resolve();
    }
    var next_batch = (
      /** @type {Batch | null} */
      /** @type {unknown} */
      current_batch
    );
    if (__privateGet(this, _roots).length > 0) {
      const batch2 = next_batch ?? (next_batch = this);
      __privateGet(batch2, _roots).push(...__privateGet(this, _roots).filter((r2) => !__privateGet(batch2, _roots).includes(r2)));
    }
    if (next_batch !== null) {
      batches.add(next_batch);
      if (DEV) {
        for (const source2 of this.current.keys()) {
          source_stacks.add(source2);
        }
      }
      __privateMethod(_b2 = next_batch, _Batch_instances, process_fn).call(_b2);
    }
    if (async_mode_flag && !batches.has(this)) {
      __privateMethod(this, _Batch_instances, commit_fn).call(this);
    }
  };
  /**
   * Traverse the effect tree, executing effects or stashing
   * them for later execution as appropriate
   * @param {Effect} root
   * @param {Effect[]} effects
   * @param {Effect[]} render_effects
   */
  traverse_fn = function(root2, effects, render_effects) {
    root2.f ^= CLEAN;
    var effect2 = root2.first;
    while (effect2 !== null) {
      var flags2 = effect2.f;
      var is_branch = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
      var is_skippable_branch = is_branch && (flags2 & CLEAN) !== 0;
      var skip = is_skippable_branch || (flags2 & INERT) !== 0 || __privateGet(this, _skipped_branches).has(effect2);
      if (!skip && effect2.fn !== null) {
        if (is_branch) {
          effect2.f ^= CLEAN;
        } else if ((flags2 & EFFECT) !== 0) {
          effects.push(effect2);
        } else if (async_mode_flag && (flags2 & (RENDER_EFFECT | MANAGED_EFFECT)) !== 0) {
          render_effects.push(effect2);
        } else if (is_dirty(effect2)) {
          if ((flags2 & BLOCK_EFFECT) !== 0) __privateGet(this, _maybe_dirty_effects).add(effect2);
          update_effect(effect2);
        }
        var child2 = effect2.first;
        if (child2 !== null) {
          effect2 = child2;
          continue;
        }
      }
      while (effect2 !== null) {
        var next2 = effect2.next;
        if (next2 !== null) {
          effect2 = next2;
          break;
        }
        effect2 = effect2.parent;
      }
    }
  };
  /**
   * @param {Effect[]} effects
   */
  defer_effects_fn = function(effects) {
    for (var i = 0; i < effects.length; i += 1) {
      defer_effect(effects[i], __privateGet(this, _dirty_effects), __privateGet(this, _maybe_dirty_effects));
    }
  };
  commit_fn = function() {
    var _a2, _b2, _c2;
    for (const batch of batches) {
      var is_earlier = batch.id < this.id;
      var sources = [];
      for (const [source3, [value, is_derived]] of this.current) {
        if (batch.current.has(source3)) {
          var batch_value = (
            /** @type {[any, boolean]} */
            batch.current.get(source3)[0]
          );
          if (is_earlier && value !== batch_value) {
            batch.current.set(source3, [value, is_derived]);
          } else {
            continue;
          }
        }
        sources.push(source3);
      }
      var others = [...batch.current.keys()].filter((s) => !this.current.has(s));
      if (others.length === 0) {
        if (is_earlier) {
          batch.discard();
        }
      } else if (sources.length > 0) {
        if (DEV) {
          invariant(__privateGet(batch, _roots).length === 0, "Batch has scheduled roots");
        }
        if (is_earlier) {
          for (const unskipped of __privateGet(this, _unskipped_branches)) {
            batch.unskip_effect(unskipped, (e) => {
              var _a3;
              if ((e.f & (BLOCK_EFFECT | ASYNC)) !== 0) {
                batch.schedule(e);
              } else {
                __privateMethod(_a3 = batch, _Batch_instances, defer_effects_fn).call(_a3, [e]);
              }
            });
          }
        }
        batch.activate();
        var marked = /* @__PURE__ */ new Set();
        var checked = /* @__PURE__ */ new Map();
        for (var source2 of sources) {
          mark_effects(source2, others, marked, checked);
        }
        checked = /* @__PURE__ */ new Map();
        var current_unequal = [...batch.current.keys()].filter(
          (c) => this.current.has(c) ? (
            /** @type {[any, boolean]} */
            this.current.get(c)[0] !== c
          ) : true
        );
        for (const effect2 of __privateGet(this, _new_effects)) {
          if ((effect2.f & (DESTROYED | INERT | EAGER_EFFECT)) === 0 && depends_on(effect2, current_unequal, checked)) {
            if ((effect2.f & (ASYNC | BLOCK_EFFECT)) !== 0) {
              set_signal_status(effect2, DIRTY);
              batch.schedule(effect2);
            } else {
              __privateGet(batch, _dirty_effects).add(effect2);
            }
          }
        }
        if (__privateGet(batch, _roots).length > 0) {
          batch.apply();
          for (var root2 of __privateGet(batch, _roots)) {
            __privateMethod(_a2 = batch, _Batch_instances, traverse_fn).call(_a2, root2, [], []);
          }
          __privateSet(batch, _roots, []);
        }
        batch.deactivate();
      }
    }
    for (const batch of batches) {
      if (__privateGet(batch, _blockers).has(this)) {
        __privateGet(batch, _blockers).delete(this);
        if (__privateGet(batch, _blockers).size === 0 && !__privateMethod(_b2 = batch, _Batch_instances, is_deferred_fn).call(_b2)) {
          batch.activate();
          __privateMethod(_c2 = batch, _Batch_instances, process_fn).call(_c2);
        }
      }
    }
  };
  let Batch = _Batch;
  function flushSync(fn) {
    var was_flushing_sync = is_flushing_sync;
    is_flushing_sync = true;
    try {
      var result;
      if (fn) {
        if (current_batch !== null && !current_batch.is_fork) {
          current_batch.flush();
        }
        result = fn();
      }
      while (true) {
        flush_tasks();
        if (current_batch === null) {
          return (
            /** @type {T} */
            result
          );
        }
        current_batch.flush();
      }
    } finally {
      is_flushing_sync = was_flushing_sync;
    }
  }
  function infinite_loop_guard() {
    if (DEV) {
      var updates = /* @__PURE__ */ new Map();
      for (
        const source2 of
        /** @type {Batch} */
        current_batch.current.keys()
      ) {
        for (const [stack2, update2] of source2.updated ?? []) {
          var entry = updates.get(stack2);
          if (!entry) {
            entry = { error: update2.error, count: 0 };
            updates.set(stack2, entry);
          }
          entry.count += update2.count;
        }
      }
      for (const update2 of updates.values()) {
        if (update2.error) {
          console.error(update2.error);
        }
      }
    }
    try {
      effect_update_depth_exceeded();
    } catch (error) {
      if (DEV) {
        define_property(error, "stack", { value: "" });
      }
      invoke_error_boundary(error, last_scheduled_effect);
    }
  }
  let eager_block_effects = null;
  function flush_queued_effects(effects) {
    var length = effects.length;
    if (length === 0) return;
    var i = 0;
    while (i < length) {
      var effect2 = effects[i++];
      if ((effect2.f & (DESTROYED | INERT)) === 0 && is_dirty(effect2)) {
        eager_block_effects = /* @__PURE__ */ new Set();
        update_effect(effect2);
        if (effect2.deps === null && effect2.first === null && effect2.nodes === null && effect2.teardown === null && effect2.ac === null) {
          unlink_effect(effect2);
        }
        if ((eager_block_effects == null ? void 0 : eager_block_effects.size) > 0) {
          old_values.clear();
          for (const e of eager_block_effects) {
            if ((e.f & (DESTROYED | INERT)) !== 0) continue;
            const ordered_effects = [e];
            let ancestor = e.parent;
            while (ancestor !== null) {
              if (eager_block_effects.has(ancestor)) {
                eager_block_effects.delete(ancestor);
                ordered_effects.push(ancestor);
              }
              ancestor = ancestor.parent;
            }
            for (let j = ordered_effects.length - 1; j >= 0; j--) {
              const e2 = ordered_effects[j];
              if ((e2.f & (DESTROYED | INERT)) !== 0) continue;
              update_effect(e2);
            }
          }
          eager_block_effects.clear();
        }
      }
    }
    eager_block_effects = null;
  }
  function mark_effects(value, sources, marked, checked) {
    if (marked.has(value)) return;
    marked.add(value);
    if (value.reactions !== null) {
      for (const reaction of value.reactions) {
        const flags2 = reaction.f;
        if ((flags2 & DERIVED) !== 0) {
          mark_effects(
            /** @type {Derived} */
            reaction,
            sources,
            marked,
            checked
          );
        } else if ((flags2 & (ASYNC | BLOCK_EFFECT)) !== 0 && (flags2 & DIRTY) === 0 && depends_on(reaction, sources, checked)) {
          set_signal_status(reaction, DIRTY);
          schedule_effect(
            /** @type {Effect} */
            reaction
          );
        }
      }
    }
  }
  function mark_eager_effects(value, effects) {
    if (value.reactions === null) return;
    for (const reaction of value.reactions) {
      const flags2 = reaction.f;
      if ((flags2 & DERIVED) !== 0) {
        mark_eager_effects(
          /** @type {Derived} */
          reaction,
          effects
        );
      } else if ((flags2 & EAGER_EFFECT) !== 0) {
        set_signal_status(reaction, DIRTY);
        effects.add(
          /** @type {Effect} */
          reaction
        );
      }
    }
  }
  function depends_on(reaction, sources, checked) {
    const depends = checked.get(reaction);
    if (depends !== void 0) return depends;
    if (reaction.deps !== null) {
      for (const dep of reaction.deps) {
        if (includes.call(sources, dep)) {
          return true;
        }
        if ((dep.f & DERIVED) !== 0 && depends_on(
          /** @type {Derived} */
          dep,
          sources,
          checked
        )) {
          checked.set(
            /** @type {Derived} */
            dep,
            true
          );
          return true;
        }
      }
    }
    checked.set(reaction, false);
    return false;
  }
  function schedule_effect(effect2) {
    current_batch.schedule(effect2);
  }
  let eager_versions = [];
  function eager_flush() {
    try {
      flushSync(() => {
        for (const version of eager_versions) {
          update(version);
        }
      });
    } finally {
      eager_versions = [];
    }
  }
  function eager(fn) {
    var version = source(0);
    var initial = true;
    var value = (
      /** @type {T} */
      void 0
    );
    get(version);
    eager_effect(() => {
      if (initial) {
        var previous_batch_values = batch_values;
        try {
          batch_values = null;
          value = fn();
        } finally {
          batch_values = previous_batch_values;
        }
        return;
      }
      if (eager_versions.length === 0) {
        queue_micro_task(eager_flush);
      }
      eager_versions.push(version);
    });
    initial = false;
    return value;
  }
  function reset_branch(effect2, tracked) {
    if ((effect2.f & BRANCH_EFFECT) !== 0 && (effect2.f & CLEAN) !== 0) {
      return;
    }
    if ((effect2.f & DIRTY) !== 0) {
      tracked.d.push(effect2);
    } else if ((effect2.f & MAYBE_DIRTY) !== 0) {
      tracked.m.push(effect2);
    }
    set_signal_status(effect2, CLEAN);
    var e = effect2.first;
    while (e !== null) {
      reset_branch(e, tracked);
      e = e.next;
    }
  }
  function reset_all(effect2) {
    set_signal_status(effect2, CLEAN);
    var e = effect2.first;
    while (e !== null) {
      reset_all(e);
      e = e.next;
    }
  }
  function fork(fn) {
    if (!async_mode_flag) {
      experimental_async_required("fork");
    }
    if (current_batch !== null) {
      fork_timing();
    }
    var batch = Batch.ensure();
    batch.is_fork = true;
    batch_values = /* @__PURE__ */ new Map();
    var committed = false;
    var settled2 = batch.settled();
    flushSync(fn);
    return {
      commit: async () => {
        if (committed) {
          await settled2;
          return;
        }
        if (!batches.has(batch)) {
          fork_discarded();
        }
        committed = true;
        batch.is_fork = false;
        for (var [source2, [value]] of batch.current) {
          source2.v = value;
          source2.wv = increment_write_version();
        }
        batch.activate();
        batch.run_fork_commit_callbacks();
        batch.deactivate();
        flushSync(() => {
          var eager_effects2 = /* @__PURE__ */ new Set();
          for (var source3 of batch.current.keys()) {
            mark_eager_effects(source3, eager_effects2);
          }
          set_eager_effects(eager_effects2);
          flush_eager_effects();
        });
        batch.flush();
        await settled2;
      },
      discard: () => {
        for (var source2 of batch.current.keys()) {
          source2.wv = increment_write_version();
        }
        if (!committed && batches.has(batch)) {
          batch.discard();
        }
      }
    };
  }
  function clear() {
    batches.clear();
  }
  function createSubscriber(start) {
    let subscribers = 0;
    let version = source(0);
    let stop;
    if (DEV) {
      tag(version, "createSubscriber version");
    }
    return () => {
      if (effect_tracking()) {
        get(version);
        render_effect(() => {
          if (subscribers === 0) {
            stop = untrack(() => start(() => increment(version)));
          }
          subscribers += 1;
          return () => {
            queue_micro_task(() => {
              subscribers -= 1;
              if (subscribers === 0) {
                stop == null ? void 0 : stop();
                stop = void 0;
                increment(version);
              }
            });
          };
        });
      }
    };
  }
  var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;
  function boundary(node, props, children, transform_error) {
    new Boundary(node, props, children, transform_error);
  }
  class Boundary {
    /**
     * @param {TemplateNode} node
     * @param {BoundaryProps} props
     * @param {((anchor: Node) => void)} children
     * @param {((error: unknown) => unknown) | undefined} [transform_error]
     */
    constructor(node, props, children, transform_error) {
      __privateAdd(this, _Boundary_instances);
      /** @type {Boundary | null} */
      __publicField(this, "parent");
      __publicField(this, "is_pending", false);
      /**
       * API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
       * Inherited from parent boundary, or defaults to identity.
       * @type {(error: unknown) => unknown}
       */
      __publicField(this, "transform_error");
      /** @type {TemplateNode} */
      __privateAdd(this, _anchor);
      /** @type {TemplateNode | null} */
      __privateAdd(this, _hydrate_open, hydrating ? hydrate_node : null);
      /** @type {BoundaryProps} */
      __privateAdd(this, _props);
      /** @type {((anchor: Node) => void)} */
      __privateAdd(this, _children);
      /** @type {Effect} */
      __privateAdd(this, _effect);
      /** @type {Effect | null} */
      __privateAdd(this, _main_effect, null);
      /** @type {Effect | null} */
      __privateAdd(this, _pending_effect, null);
      /** @type {Effect | null} */
      __privateAdd(this, _failed_effect, null);
      /** @type {DocumentFragment | null} */
      __privateAdd(this, _offscreen_fragment, null);
      __privateAdd(this, _local_pending_count, 0);
      __privateAdd(this, _pending_count, 0);
      __privateAdd(this, _pending_count_update_queued, false);
      /** @type {Set<Effect>} */
      __privateAdd(this, _dirty_effects2, /* @__PURE__ */ new Set());
      /** @type {Set<Effect>} */
      __privateAdd(this, _maybe_dirty_effects2, /* @__PURE__ */ new Set());
      /**
       * A source containing the number of pending async deriveds/expressions.
       * Only created if `$effect.pending()` is used inside the boundary,
       * otherwise updating the source results in needless `Batch.ensure()`
       * calls followed by no-op flushes
       * @type {Source<number> | null}
       */
      __privateAdd(this, _effect_pending, null);
      __privateAdd(this, _effect_pending_subscriber, createSubscriber(() => {
        __privateSet(this, _effect_pending, source(__privateGet(this, _local_pending_count)));
        if (DEV) {
          tag(__privateGet(this, _effect_pending), "$effect.pending()");
        }
        return () => {
          __privateSet(this, _effect_pending, null);
        };
      }));
      var _a2;
      __privateSet(this, _anchor, node);
      __privateSet(this, _props, props);
      __privateSet(this, _children, (anchor) => {
        var effect2 = (
          /** @type {Effect} */
          active_effect
        );
        effect2.b = this;
        effect2.f |= BOUNDARY_EFFECT;
        children(anchor);
      });
      this.parent = /** @type {Effect} */
      active_effect.b;
      this.transform_error = transform_error ?? ((_a2 = this.parent) == null ? void 0 : _a2.transform_error) ?? ((e) => e);
      __privateSet(this, _effect, block(() => {
        if (hydrating) {
          const comment2 = (
            /** @type {Comment} */
            __privateGet(this, _hydrate_open)
          );
          hydrate_next();
          const server_rendered_pending = comment2.data === HYDRATION_START_ELSE;
          const server_rendered_failed = comment2.data.startsWith(HYDRATION_START_FAILED);
          if (server_rendered_failed) {
            const serialized_error = JSON.parse(comment2.data.slice(HYDRATION_START_FAILED.length));
            __privateMethod(this, _Boundary_instances, hydrate_failed_content_fn).call(this, serialized_error);
          } else if (server_rendered_pending) {
            __privateMethod(this, _Boundary_instances, hydrate_pending_content_fn).call(this);
          } else {
            __privateMethod(this, _Boundary_instances, hydrate_resolved_content_fn).call(this);
          }
        } else {
          __privateMethod(this, _Boundary_instances, render_fn).call(this);
        }
      }, flags));
      if (hydrating) {
        __privateSet(this, _anchor, hydrate_node);
      }
    }
    /**
     * Defer an effect inside a pending boundary until the boundary resolves
     * @param {Effect} effect
     */
    defer_effect(effect2) {
      defer_effect(effect2, __privateGet(this, _dirty_effects2), __privateGet(this, _maybe_dirty_effects2));
    }
    /**
     * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
     * @returns {boolean}
     */
    is_rendered() {
      return !this.is_pending && (!this.parent || this.parent.is_rendered());
    }
    has_pending_snippet() {
      return !!__privateGet(this, _props).pending;
    }
    /**
     * Update the source that powers `$effect.pending()` inside this boundary,
     * and controls when the current `pending` snippet (if any) is removed.
     * Do not call from inside the class
     * @param {1 | -1} d
     * @param {Batch} batch
     */
    update_pending_count(d, batch) {
      __privateMethod(this, _Boundary_instances, update_pending_count_fn).call(this, d, batch);
      __privateSet(this, _local_pending_count, __privateGet(this, _local_pending_count) + d);
      if (!__privateGet(this, _effect_pending) || __privateGet(this, _pending_count_update_queued)) return;
      __privateSet(this, _pending_count_update_queued, true);
      queue_micro_task(() => {
        __privateSet(this, _pending_count_update_queued, false);
        if (__privateGet(this, _effect_pending)) {
          internal_set(__privateGet(this, _effect_pending), __privateGet(this, _local_pending_count));
        }
      });
    }
    get_effect_pending() {
      __privateGet(this, _effect_pending_subscriber).call(this);
      return get(
        /** @type {Source<number>} */
        __privateGet(this, _effect_pending)
      );
    }
    /** @param {unknown} error */
    error(error) {
      if (!__privateGet(this, _props).onerror && !__privateGet(this, _props).failed) {
        throw error;
      }
      if (current_batch == null ? void 0 : current_batch.is_fork) {
        if (__privateGet(this, _main_effect)) current_batch.skip_effect(__privateGet(this, _main_effect));
        if (__privateGet(this, _pending_effect)) current_batch.skip_effect(__privateGet(this, _pending_effect));
        if (__privateGet(this, _failed_effect)) current_batch.skip_effect(__privateGet(this, _failed_effect));
        current_batch.on_fork_commit(() => {
          __privateMethod(this, _Boundary_instances, handle_error_fn).call(this, error);
        });
      } else {
        __privateMethod(this, _Boundary_instances, handle_error_fn).call(this, error);
      }
    }
  }
  _anchor = new WeakMap();
  _hydrate_open = new WeakMap();
  _props = new WeakMap();
  _children = new WeakMap();
  _effect = new WeakMap();
  _main_effect = new WeakMap();
  _pending_effect = new WeakMap();
  _failed_effect = new WeakMap();
  _offscreen_fragment = new WeakMap();
  _local_pending_count = new WeakMap();
  _pending_count = new WeakMap();
  _pending_count_update_queued = new WeakMap();
  _dirty_effects2 = new WeakMap();
  _maybe_dirty_effects2 = new WeakMap();
  _effect_pending = new WeakMap();
  _effect_pending_subscriber = new WeakMap();
  _Boundary_instances = new WeakSet();
  hydrate_resolved_content_fn = function() {
    try {
      __privateSet(this, _main_effect, branch(() => __privateGet(this, _children).call(this, __privateGet(this, _anchor))));
    } catch (error) {
      this.error(error);
    }
  };
  /**
   * @param {unknown} error The deserialized error from the server's hydration comment
   */
  hydrate_failed_content_fn = function(error) {
    const failed = __privateGet(this, _props).failed;
    if (!failed) return;
    __privateSet(this, _failed_effect, branch(() => {
      failed(
        __privateGet(this, _anchor),
        () => error,
        () => () => {
        }
      );
    }));
  };
  hydrate_pending_content_fn = function() {
    const pending2 = __privateGet(this, _props).pending;
    if (!pending2) return;
    this.is_pending = true;
    __privateSet(this, _pending_effect, branch(() => pending2(__privateGet(this, _anchor))));
    queue_micro_task(() => {
      var fragment = __privateSet(this, _offscreen_fragment, document.createDocumentFragment());
      var anchor = create_text();
      fragment.append(anchor);
      __privateSet(this, _main_effect, __privateMethod(this, _Boundary_instances, run_fn).call(this, () => {
        return branch(() => __privateGet(this, _children).call(this, anchor));
      }));
      if (__privateGet(this, _pending_count) === 0) {
        __privateGet(this, _anchor).before(fragment);
        __privateSet(this, _offscreen_fragment, null);
        pause_effect(
          /** @type {Effect} */
          __privateGet(this, _pending_effect),
          () => {
            __privateSet(this, _pending_effect, null);
          }
        );
        __privateMethod(this, _Boundary_instances, resolve_fn).call(
          this,
          /** @type {Batch} */
          current_batch
        );
      }
    });
  };
  render_fn = function() {
    try {
      this.is_pending = this.has_pending_snippet();
      __privateSet(this, _pending_count, 0);
      __privateSet(this, _local_pending_count, 0);
      __privateSet(this, _main_effect, branch(() => {
        __privateGet(this, _children).call(this, __privateGet(this, _anchor));
      }));
      if (__privateGet(this, _pending_count) > 0) {
        var fragment = __privateSet(this, _offscreen_fragment, document.createDocumentFragment());
        move_effect(__privateGet(this, _main_effect), fragment);
        const pending2 = (
          /** @type {(anchor: Node) => void} */
          __privateGet(this, _props).pending
        );
        __privateSet(this, _pending_effect, branch(() => pending2(__privateGet(this, _anchor))));
      } else {
        __privateMethod(this, _Boundary_instances, resolve_fn).call(
          this,
          /** @type {Batch} */
          current_batch
        );
      }
    } catch (error) {
      this.error(error);
    }
  };
  /**
   * @param {Batch} batch
   */
  resolve_fn = function(batch) {
    this.is_pending = false;
    batch.transfer_effects(__privateGet(this, _dirty_effects2), __privateGet(this, _maybe_dirty_effects2));
  };
  /**
   * @template T
   * @param {() => T} fn
   */
  run_fn = function(fn) {
    var previous_effect = active_effect;
    var previous_reaction = active_reaction;
    var previous_ctx = component_context;
    set_active_effect(__privateGet(this, _effect));
    set_active_reaction(__privateGet(this, _effect));
    set_component_context(__privateGet(this, _effect).ctx);
    try {
      Batch.ensure();
      return fn();
    } catch (e) {
      handle_error(e);
      return null;
    } finally {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_ctx);
    }
  };
  /**
   * Updates the pending count associated with the currently visible pending snippet,
   * if any, such that we can replace the snippet with content once work is done
   * @param {1 | -1} d
   * @param {Batch} batch
   */
  update_pending_count_fn = function(d, batch) {
    var _a2;
    if (!this.has_pending_snippet()) {
      if (this.parent) {
        __privateMethod(_a2 = this.parent, _Boundary_instances, update_pending_count_fn).call(_a2, d, batch);
      }
      return;
    }
    __privateSet(this, _pending_count, __privateGet(this, _pending_count) + d);
    if (__privateGet(this, _pending_count) === 0) {
      __privateMethod(this, _Boundary_instances, resolve_fn).call(this, batch);
      if (__privateGet(this, _pending_effect)) {
        pause_effect(__privateGet(this, _pending_effect), () => {
          __privateSet(this, _pending_effect, null);
        });
      }
      if (__privateGet(this, _offscreen_fragment)) {
        __privateGet(this, _anchor).before(__privateGet(this, _offscreen_fragment));
        __privateSet(this, _offscreen_fragment, null);
      }
    }
  };
  /**
   * @param {unknown} error
   */
  handle_error_fn = function(error) {
    if (__privateGet(this, _main_effect)) {
      destroy_effect(__privateGet(this, _main_effect));
      __privateSet(this, _main_effect, null);
    }
    if (__privateGet(this, _pending_effect)) {
      destroy_effect(__privateGet(this, _pending_effect));
      __privateSet(this, _pending_effect, null);
    }
    if (__privateGet(this, _failed_effect)) {
      destroy_effect(__privateGet(this, _failed_effect));
      __privateSet(this, _failed_effect, null);
    }
    if (hydrating) {
      set_hydrate_node(
        /** @type {TemplateNode} */
        __privateGet(this, _hydrate_open)
      );
      next();
      set_hydrate_node(skip_nodes());
    }
    var onerror = __privateGet(this, _props).onerror;
    let failed = __privateGet(this, _props).failed;
    var did_reset = false;
    var calling_on_error = false;
    const reset2 = () => {
      if (did_reset) {
        svelte_boundary_reset_noop();
        return;
      }
      did_reset = true;
      if (calling_on_error) {
        svelte_boundary_reset_onerror();
      }
      if (__privateGet(this, _failed_effect) !== null) {
        pause_effect(__privateGet(this, _failed_effect), () => {
          __privateSet(this, _failed_effect, null);
        });
      }
      __privateMethod(this, _Boundary_instances, run_fn).call(this, () => {
        __privateMethod(this, _Boundary_instances, render_fn).call(this);
      });
    };
    const handle_error_result = (transformed_error) => {
      try {
        calling_on_error = true;
        onerror == null ? void 0 : onerror(transformed_error, reset2);
        calling_on_error = false;
      } catch (error2) {
        invoke_error_boundary(error2, __privateGet(this, _effect) && __privateGet(this, _effect).parent);
      }
      if (failed) {
        __privateSet(this, _failed_effect, __privateMethod(this, _Boundary_instances, run_fn).call(this, () => {
          try {
            return branch(() => {
              var effect2 = (
                /** @type {Effect} */
                active_effect
              );
              effect2.b = this;
              effect2.f |= BOUNDARY_EFFECT;
              failed(
                __privateGet(this, _anchor),
                () => transformed_error,
                () => reset2
              );
            });
          } catch (error2) {
            invoke_error_boundary(
              error2,
              /** @type {Effect} */
              __privateGet(this, _effect).parent
            );
            return null;
          }
        }));
      }
    };
    queue_micro_task(() => {
      var result;
      try {
        result = this.transform_error(error);
      } catch (e) {
        invoke_error_boundary(e, __privateGet(this, _effect) && __privateGet(this, _effect).parent);
        return;
      }
      if (result !== null && typeof result === "object" && typeof /** @type {any} */
      result.then === "function") {
        result.then(
          handle_error_result,
          /** @param {unknown} e */
          (e) => invoke_error_boundary(e, __privateGet(this, _effect) && __privateGet(this, _effect).parent)
        );
      } else {
        handle_error_result(result);
      }
    });
  };
  function pending$1() {
    if (active_effect === null) {
      effect_pending_outside_reaction();
    }
    var boundary2 = active_effect.b;
    if (boundary2 === null) {
      return 0;
    }
    return boundary2.get_effect_pending();
  }
  function flatten(blockers, sync, async2, fn) {
    const d = is_runes() ? derived : derived_safe_equal;
    var pending2 = blockers.filter((b) => !b.settled);
    if (async2.length === 0 && pending2.length === 0) {
      fn(sync.map(d));
      return;
    }
    var parent = (
      /** @type {Effect} */
      active_effect
    );
    var restore = capture();
    var blocker_promise = pending2.length === 1 ? pending2[0].promise : pending2.length > 1 ? Promise.all(pending2.map((b) => b.promise)) : null;
    function finish(values) {
      restore();
      try {
        fn(values);
      } catch (error) {
        if ((parent.f & DESTROYED) === 0) {
          invoke_error_boundary(error, parent);
        }
      }
      unset_context();
    }
    if (async2.length === 0) {
      blocker_promise.then(() => finish(sync.map(d)));
      return;
    }
    var decrement_pending = increment_pending();
    function run2() {
      Promise.all(async2.map((expression) => /* @__PURE__ */ async_derived(expression))).then((result) => finish([...sync.map(d), ...result])).catch((error) => invoke_error_boundary(error, parent)).finally(() => decrement_pending());
    }
    if (blocker_promise) {
      blocker_promise.then(() => {
        restore();
        run2();
        unset_context();
      });
    } else {
      run2();
    }
  }
  function run_after_blockers(blockers, fn) {
    flatten(blockers, [], [], fn);
  }
  function capture() {
    var previous_effect = (
      /** @type {Effect} */
      active_effect
    );
    var previous_reaction = active_reaction;
    var previous_component_context = component_context;
    var previous_batch2 = (
      /** @type {Batch} */
      current_batch
    );
    if (DEV) {
      var previous_dev_stack = dev_stack;
    }
    return function restore(activate_batch = true) {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_component_context);
      if (activate_batch && (previous_effect.f & DESTROYED) === 0) {
        previous_batch2 == null ? void 0 : previous_batch2.activate();
        previous_batch2 == null ? void 0 : previous_batch2.apply();
      }
      if (DEV) {
        set_reactivity_loss_tracker(null);
        set_dev_stack(previous_dev_stack);
      }
    };
  }
  async function save(promise) {
    var restore = capture();
    var value = await promise;
    return () => {
      restore();
      return value;
    };
  }
  async function track_reactivity_loss(promise) {
    var previous_async_effect = reactivity_loss_tracker;
    queueMicrotask(() => {
      if (reactivity_loss_tracker === previous_async_effect) {
        set_reactivity_loss_tracker(null);
      }
    });
    var value = await promise;
    return () => {
      set_reactivity_loss_tracker(previous_async_effect);
      queueMicrotask(() => {
        if (reactivity_loss_tracker === previous_async_effect) {
          set_reactivity_loss_tracker(null);
        }
      });
      return value;
    };
  }
  async function* for_await_track_reactivity_loss(iterable) {
    var _a2, _b2;
    const iterator = ((_a2 = iterable[Symbol.asyncIterator]) == null ? void 0 : _a2.call(iterable)) ?? ((_b2 = iterable[Symbol.iterator]) == null ? void 0 : _b2.call(iterable));
    if (iterator === void 0) {
      throw new TypeError("value is not async iterable");
    }
    let normal_completion = false;
    try {
      while (true) {
        const { done, value } = (await track_reactivity_loss(iterator.next()))();
        if (done) {
          normal_completion = true;
          break;
        }
        var prev = reactivity_loss_tracker;
        yield value;
        set_reactivity_loss_tracker(prev);
      }
    } finally {
      if (!normal_completion && iterator.return !== void 0) {
        return (
          /** @type {TReturn} */
          (await track_reactivity_loss(iterator.return()))().value
        );
      }
    }
  }
  function unset_context(deactivate_batch = true) {
    set_active_effect(null);
    set_active_reaction(null);
    set_component_context(null);
    if (deactivate_batch) current_batch == null ? void 0 : current_batch.deactivate();
    if (DEV) {
      set_reactivity_loss_tracker(null);
      set_dev_stack(null);
    }
  }
  function run$1(thunks) {
    const restore = capture();
    const decrement_pending = increment_pending();
    var active = (
      /** @type {Effect} */
      active_effect
    );
    var errored = null;
    const handle_error2 = (error) => {
      errored = { error };
      if (!aborted(active)) {
        invoke_error_boundary(error, active);
      }
    };
    var promise = Promise.resolve(thunks[0]()).catch(handle_error2);
    var blocker = { promise, settled: false };
    var blockers = [blocker];
    promise.finally(() => {
      blocker.settled = true;
      unset_context();
    });
    for (const fn of thunks.slice(1)) {
      promise = promise.then(() => {
        restore();
        if (errored) {
          throw errored.error;
        }
        if (aborted(active)) {
          throw STALE_REACTION;
        }
        return fn();
      }).catch(handle_error2);
      const blocker2 = { promise, settled: false };
      blockers.push(blocker2);
      promise.finally(() => {
        blocker2.settled = true;
        unset_context();
      });
    }
    promise.then(() => Promise.resolve()).finally(() => decrement_pending());
    return blockers;
  }
  function wait(blockers) {
    return Promise.all(blockers.map((b) => b.promise));
  }
  function increment_pending() {
    var effect2 = (
      /** @type {Effect} */
      active_effect
    );
    var boundary2 = (
      /** @type {Boundary} */
      effect2.b
    );
    var batch = (
      /** @type {Batch} */
      current_batch
    );
    var blocking = boundary2.is_rendered();
    boundary2.update_pending_count(1, batch);
    batch.increment(blocking, effect2);
    return (skip = false) => {
      boundary2.update_pending_count(-1, batch);
      batch.decrement(blocking, effect2, skip);
    };
  }
  let reactivity_loss_tracker = null;
  function set_reactivity_loss_tracker(v) {
    reactivity_loss_tracker = v;
  }
  const recent_async_deriveds = /* @__PURE__ */ new Set();
  // @__NO_SIDE_EFFECTS__
  function derived(fn) {
    var flags2 = DERIVED | DIRTY;
    if (active_effect !== null) {
      active_effect.f |= EFFECT_PRESERVED;
    }
    const signal = {
      ctx: component_context,
      deps: null,
      effects: null,
      equals: equals$1,
      f: flags2,
      fn,
      reactions: null,
      rv: 0,
      v: (
        /** @type {V} */
        UNINITIALIZED
      ),
      wv: 0,
      parent: active_effect,
      ac: null
    };
    if (DEV && tracing_mode_flag) {
      signal.created = get_error("created at");
    }
    return signal;
  }
  // @__NO_SIDE_EFFECTS__
  function async_derived(fn, label2, location2) {
    let parent = (
      /** @type {Effect | null} */
      active_effect
    );
    if (parent === null) {
      async_derived_orphan();
    }
    var promise = (
      /** @type {Promise<V>} */
      /** @type {unknown} */
      void 0
    );
    var signal = source(
      /** @type {V} */
      UNINITIALIZED
    );
    if (DEV) signal.label = label2;
    var should_suspend = !active_reaction;
    var deferreds = /* @__PURE__ */ new Map();
    async_effect(() => {
      var _a2;
      var effect2 = (
        /** @type {Effect} */
        active_effect
      );
      if (DEV) {
        reactivity_loss_tracker = { effect: effect2, effect_deps: /* @__PURE__ */ new Set(), warned: false };
      }
      var d = deferred();
      promise = d.promise;
      try {
        Promise.resolve(fn()).then(d.resolve, d.reject).finally(unset_context);
      } catch (error) {
        d.reject(error);
        unset_context();
      }
      if (DEV) {
        if (reactivity_loss_tracker) {
          if (effect2.deps !== null) {
            for (let i = 0; i < skipped_deps; i += 1) {
              reactivity_loss_tracker.effect_deps.add(effect2.deps[i]);
            }
          }
          if (new_deps !== null) {
            for (let i = 0; i < new_deps.length; i += 1) {
              reactivity_loss_tracker.effect_deps.add(new_deps[i]);
            }
          }
        }
        reactivity_loss_tracker = null;
      }
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      if (should_suspend) {
        if ((effect2.f & REACTION_RAN) !== 0) {
          var decrement_pending = increment_pending();
        }
        if (
          /** @type {Boundary} */
          parent.b.is_rendered()
        ) {
          (_a2 = deferreds.get(batch)) == null ? void 0 : _a2.reject(STALE_REACTION);
          deferreds.delete(batch);
        } else {
          for (const d2 of deferreds.values()) {
            d2.reject(STALE_REACTION);
          }
          deferreds.clear();
        }
        deferreds.set(batch, d);
      }
      const handler = (value, error = void 0) => {
        if (DEV) {
          reactivity_loss_tracker = null;
        }
        if (decrement_pending) {
          var skip = error === STALE_REACTION;
          decrement_pending(skip);
        }
        if (error === STALE_REACTION || (effect2.f & DESTROYED) !== 0) {
          return;
        }
        batch.activate();
        if (error) {
          signal.f |= ERROR_VALUE;
          internal_set(signal, error);
        } else {
          if ((signal.f & ERROR_VALUE) !== 0) {
            signal.f ^= ERROR_VALUE;
          }
          internal_set(signal, value);
          for (const [b, d2] of deferreds) {
            deferreds.delete(b);
            if (b === batch) break;
            d2.reject(STALE_REACTION);
          }
          if (DEV && location2 !== void 0) {
            recent_async_deriveds.add(signal);
            setTimeout(() => {
              if (recent_async_deriveds.has(signal)) {
                await_waterfall(
                  /** @type {string} */
                  signal.label,
                  location2
                );
                recent_async_deriveds.delete(signal);
              }
            });
          }
        }
        batch.deactivate();
      };
      d.promise.then(handler, (e) => handler(null, e || "unknown"));
    });
    teardown(() => {
      for (const d of deferreds.values()) {
        d.reject(STALE_REACTION);
      }
    });
    if (DEV) {
      signal.f |= ASYNC;
    }
    return new Promise((fulfil) => {
      function next2(p) {
        function go() {
          if (p === promise) {
            fulfil(signal);
          } else {
            next2(promise);
          }
        }
        p.then(go, go);
      }
      next2(promise);
    });
  }
  // @__NO_SIDE_EFFECTS__
  function user_derived(fn) {
    const d = /* @__PURE__ */ derived(fn);
    if (!async_mode_flag) push_reaction_value(d);
    return d;
  }
  // @__NO_SIDE_EFFECTS__
  function derived_safe_equal(fn) {
    const signal = /* @__PURE__ */ derived(fn);
    signal.equals = safe_equals;
    return signal;
  }
  function destroy_derived_effects(derived2) {
    var effects = derived2.effects;
    if (effects !== null) {
      derived2.effects = null;
      for (var i = 0; i < effects.length; i += 1) {
        destroy_effect(
          /** @type {Effect} */
          effects[i]
        );
      }
    }
  }
  let stack = [];
  function execute_derived(derived2) {
    var value;
    var prev_active_effect = active_effect;
    var parent = derived2.parent;
    if (!is_destroying_effect && parent !== null && (parent.f & (DESTROYED | INERT)) !== 0) {
      derived_inert();
      return derived2.v;
    }
    set_active_effect(parent);
    if (DEV) {
      let prev_eager_effects = eager_effects;
      set_eager_effects(/* @__PURE__ */ new Set());
      try {
        if (includes.call(stack, derived2)) {
          derived_references_self();
        }
        stack.push(derived2);
        derived2.f &= ~WAS_MARKED;
        destroy_derived_effects(derived2);
        value = update_reaction(derived2);
      } finally {
        set_active_effect(prev_active_effect);
        set_eager_effects(prev_eager_effects);
        stack.pop();
      }
    } else {
      try {
        derived2.f &= ~WAS_MARKED;
        destroy_derived_effects(derived2);
        value = update_reaction(derived2);
      } finally {
        set_active_effect(prev_active_effect);
      }
    }
    return value;
  }
  function update_derived(derived2) {
    var value = execute_derived(derived2);
    if (!derived2.equals(value)) {
      derived2.wv = increment_write_version();
      if (!(current_batch == null ? void 0 : current_batch.is_fork) || derived2.deps === null) {
        if (current_batch !== null) {
          current_batch.capture(derived2, value, true);
        } else {
          derived2.v = value;
        }
        if (derived2.deps === null) {
          set_signal_status(derived2, CLEAN);
          return;
        }
      }
    }
    if (is_destroying_effect) {
      return;
    }
    if (batch_values !== null) {
      if (effect_tracking() || (current_batch == null ? void 0 : current_batch.is_fork)) {
        batch_values.set(derived2, value);
      }
    } else {
      update_derived_status(derived2);
    }
  }
  function freeze_derived_effects(derived2) {
    var _a2, _b2;
    if (derived2.effects === null) return;
    for (const e of derived2.effects) {
      if (e.teardown || e.ac) {
        (_a2 = e.teardown) == null ? void 0 : _a2.call(e);
        (_b2 = e.ac) == null ? void 0 : _b2.abort(STALE_REACTION);
        e.teardown = noop;
        e.ac = null;
        remove_reactions(e, 0);
        destroy_effect_children(e);
      }
    }
  }
  function unfreeze_derived_effects(derived2) {
    if (derived2.effects === null) return;
    for (const e of derived2.effects) {
      if (e.teardown) {
        update_effect(e);
      }
    }
  }
  let eager_effects = /* @__PURE__ */ new Set();
  const old_values = /* @__PURE__ */ new Map();
  function set_eager_effects(v) {
    eager_effects = v;
  }
  let eager_effects_deferred = false;
  function set_eager_effects_deferred() {
    eager_effects_deferred = true;
  }
  function source(v, stack2) {
    var signal = {
      f: 0,
      // TODO ideally we could skip this altogether, but it causes type errors
      v,
      reactions: null,
      equals: equals$1,
      rv: 0,
      wv: 0
    };
    if (DEV && tracing_mode_flag) {
      signal.created = stack2 ?? get_error("created at");
      signal.updated = null;
      signal.set_during_effect = false;
      signal.trace = null;
    }
    return signal;
  }
  // @__NO_SIDE_EFFECTS__
  function state(v, stack2) {
    const s = source(v, stack2);
    push_reaction_value(s);
    return s;
  }
  // @__NO_SIDE_EFFECTS__
  function mutable_source(initial_value, immutable = false, trackable = true) {
    var _a2;
    const s = source(initial_value);
    if (!immutable) {
      s.equals = safe_equals;
    }
    if (legacy_mode_flag && trackable && component_context !== null && component_context.l !== null) {
      ((_a2 = component_context.l).s ?? (_a2.s = [])).push(s);
    }
    return s;
  }
  function mutate(source2, value) {
    set(
      source2,
      untrack(() => get(source2))
    );
    return value;
  }
  function set(source2, value, should_proxy = false) {
    if (active_reaction !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
    // to ensure we error if state is set inside an inspect effect
    (!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) && is_runes() && (active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 && (current_sources === null || !includes.call(current_sources, source2))) {
      state_unsafe_mutation();
    }
    let new_value = should_proxy ? proxy(value) : value;
    if (DEV) {
      tag_proxy(
        new_value,
        /** @type {string} */
        source2.label
      );
    }
    return internal_set(source2, new_value, legacy_updates);
  }
  function internal_set(source2, value, updated_during_traversal = null) {
    var _a2;
    if (!source2.equals(value)) {
      old_values.set(source2, is_destroying_effect ? value : source2.v);
      var batch = Batch.ensure();
      batch.capture(source2, value);
      if (DEV) {
        if (tracing_mode_flag || active_effect !== null) {
          source2.updated ?? (source2.updated = /* @__PURE__ */ new Map());
          const count = (((_a2 = source2.updated.get("")) == null ? void 0 : _a2.count) ?? 0) + 1;
          source2.updated.set("", { error: (
            /** @type {any} */
            null
          ), count });
          if (tracing_mode_flag || count > 5) {
            const error = get_error("updated at");
            if (error !== null) {
              let entry = source2.updated.get(error.stack);
              if (!entry) {
                entry = { error, count: 0 };
                source2.updated.set(error.stack, entry);
              }
              entry.count++;
            }
          }
        }
        if (active_effect !== null) {
          source2.set_during_effect = true;
        }
      }
      if ((source2.f & DERIVED) !== 0) {
        const derived2 = (
          /** @type {Derived} */
          source2
        );
        if ((source2.f & DIRTY) !== 0) {
          execute_derived(derived2);
        }
        if (batch_values === null) {
          update_derived_status(derived2);
        }
      }
      source2.wv = increment_write_version();
      mark_reactions(source2, DIRTY, updated_during_traversal);
      if (is_runes() && active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
        if (untracked_writes === null) {
          set_untracked_writes([source2]);
        } else {
          untracked_writes.push(source2);
        }
      }
      if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
        flush_eager_effects();
      }
    }
    return value;
  }
  function flush_eager_effects() {
    eager_effects_deferred = false;
    for (const effect2 of eager_effects) {
      if ((effect2.f & CLEAN) !== 0) {
        set_signal_status(effect2, MAYBE_DIRTY);
      }
      if (is_dirty(effect2)) {
        update_effect(effect2);
      }
    }
    eager_effects.clear();
  }
  function update(source2, d = 1) {
    var value = get(source2);
    var result = d === 1 ? value++ : value--;
    set(source2, value);
    return result;
  }
  function update_pre(source2, d = 1) {
    var value = get(source2);
    return set(source2, d === 1 ? ++value : --value);
  }
  function increment(source2) {
    set(source2, source2.v + 1);
  }
  function mark_reactions(signal, status, updated_during_traversal) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    var runes = is_runes();
    var length = reactions.length;
    for (var i = 0; i < length; i++) {
      var reaction = reactions[i];
      var flags2 = reaction.f;
      if (!runes && reaction === active_effect) continue;
      if (DEV && (flags2 & EAGER_EFFECT) !== 0) {
        eager_effects.add(reaction);
        continue;
      }
      var not_dirty = (flags2 & DIRTY) === 0;
      if (not_dirty) {
        set_signal_status(reaction, status);
      }
      if ((flags2 & DERIVED) !== 0) {
        var derived2 = (
          /** @type {Derived} */
          reaction
        );
        batch_values == null ? void 0 : batch_values.delete(derived2);
        if ((flags2 & WAS_MARKED) === 0) {
          if (flags2 & CONNECTED) {
            reaction.f |= WAS_MARKED;
          }
          mark_reactions(derived2, MAYBE_DIRTY, updated_during_traversal);
        }
      } else if (not_dirty) {
        var effect2 = (
          /** @type {Effect} */
          reaction
        );
        if ((flags2 & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
          eager_block_effects.add(effect2);
        }
        if (updated_during_traversal !== null) {
          updated_during_traversal.push(effect2);
        } else {
          schedule_effect(effect2);
        }
      }
    }
  }
  const regex_is_valid_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
  function proxy(value) {
    if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
      return value;
    }
    const prototype = get_prototype_of(value);
    if (prototype !== object_prototype && prototype !== array_prototype) {
      return value;
    }
    var sources = /* @__PURE__ */ new Map();
    var is_proxied_array = is_array(value);
    var version = /* @__PURE__ */ state(0);
    var stack2 = DEV && tracing_mode_flag ? get_error("created at") : null;
    var parent_version = update_version;
    var with_parent = (fn) => {
      if (update_version === parent_version) {
        return fn();
      }
      var reaction = active_reaction;
      var version2 = update_version;
      set_active_reaction(null);
      set_update_version(parent_version);
      var result = fn();
      set_active_reaction(reaction);
      set_update_version(version2);
      return result;
    };
    if (is_proxied_array) {
      sources.set("length", /* @__PURE__ */ state(
        /** @type {any[]} */
        value.length,
        stack2
      ));
      if (DEV) {
        value = /** @type {any} */
        inspectable_array(
          /** @type {any[]} */
          value
        );
      }
    }
    var path = "";
    let updating = false;
    function update_path(new_path) {
      if (updating) return;
      updating = true;
      path = new_path;
      tag(version, `${path} version`);
      for (const [prop2, source2] of sources) {
        tag(source2, get_label(path, prop2));
      }
      updating = false;
    }
    return new Proxy(
      /** @type {any} */
      value,
      {
        defineProperty(_, prop2, descriptor) {
          if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
            state_descriptors_fixed();
          }
          var s = sources.get(prop2);
          if (s === void 0) {
            with_parent(() => {
              var s2 = /* @__PURE__ */ state(descriptor.value, stack2);
              sources.set(prop2, s2);
              if (DEV && typeof prop2 === "string") {
                tag(s2, get_label(path, prop2));
              }
              return s2;
            });
          } else {
            set(s, descriptor.value, true);
          }
          return true;
        },
        deleteProperty(target, prop2) {
          var s = sources.get(prop2);
          if (s === void 0) {
            if (prop2 in target) {
              const s2 = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED, stack2));
              sources.set(prop2, s2);
              increment(version);
              if (DEV) {
                tag(s2, get_label(path, prop2));
              }
            }
          } else {
            set(s, UNINITIALIZED);
            increment(version);
          }
          return true;
        },
        get(target, prop2, receiver) {
          var _a2;
          if (prop2 === STATE_SYMBOL) {
            return value;
          }
          if (DEV && prop2 === PROXY_PATH_SYMBOL) {
            return update_path;
          }
          var s = sources.get(prop2);
          var exists = prop2 in target;
          if (s === void 0 && (!exists || ((_a2 = get_descriptor(target, prop2)) == null ? void 0 : _a2.writable))) {
            s = with_parent(() => {
              var p = proxy(exists ? target[prop2] : UNINITIALIZED);
              var s2 = /* @__PURE__ */ state(p, stack2);
              if (DEV) {
                tag(s2, get_label(path, prop2));
              }
              return s2;
            });
            sources.set(prop2, s);
          }
          if (s !== void 0) {
            var v = get(s);
            return v === UNINITIALIZED ? void 0 : v;
          }
          return Reflect.get(target, prop2, receiver);
        },
        getOwnPropertyDescriptor(target, prop2) {
          var descriptor = Reflect.getOwnPropertyDescriptor(target, prop2);
          if (descriptor && "value" in descriptor) {
            var s = sources.get(prop2);
            if (s) descriptor.value = get(s);
          } else if (descriptor === void 0) {
            var source2 = sources.get(prop2);
            var value2 = source2 == null ? void 0 : source2.v;
            if (source2 !== void 0 && value2 !== UNINITIALIZED) {
              return {
                enumerable: true,
                configurable: true,
                value: value2,
                writable: true
              };
            }
          }
          return descriptor;
        },
        has(target, prop2) {
          var _a2;
          if (prop2 === STATE_SYMBOL) {
            return true;
          }
          var s = sources.get(prop2);
          var has = s !== void 0 && s.v !== UNINITIALIZED || Reflect.has(target, prop2);
          if (s !== void 0 || active_effect !== null && (!has || ((_a2 = get_descriptor(target, prop2)) == null ? void 0 : _a2.writable))) {
            if (s === void 0) {
              s = with_parent(() => {
                var p = has ? proxy(target[prop2]) : UNINITIALIZED;
                var s2 = /* @__PURE__ */ state(p, stack2);
                if (DEV) {
                  tag(s2, get_label(path, prop2));
                }
                return s2;
              });
              sources.set(prop2, s);
            }
            var value2 = get(s);
            if (value2 === UNINITIALIZED) {
              return false;
            }
          }
          return has;
        },
        set(target, prop2, value2, receiver) {
          var _a2;
          var s = sources.get(prop2);
          var has = prop2 in target;
          if (is_proxied_array && prop2 === "length") {
            for (var i = value2; i < /** @type {Source<number>} */
            s.v; i += 1) {
              var other_s = sources.get(i + "");
              if (other_s !== void 0) {
                set(other_s, UNINITIALIZED);
              } else if (i in target) {
                other_s = with_parent(() => /* @__PURE__ */ state(UNINITIALIZED, stack2));
                sources.set(i + "", other_s);
                if (DEV) {
                  tag(other_s, get_label(path, i));
                }
              }
            }
          }
          if (s === void 0) {
            if (!has || ((_a2 = get_descriptor(target, prop2)) == null ? void 0 : _a2.writable)) {
              s = with_parent(() => /* @__PURE__ */ state(void 0, stack2));
              if (DEV) {
                tag(s, get_label(path, prop2));
              }
              set(s, proxy(value2));
              sources.set(prop2, s);
            }
          } else {
            has = s.v !== UNINITIALIZED;
            var p = with_parent(() => proxy(value2));
            set(s, p);
          }
          var descriptor = Reflect.getOwnPropertyDescriptor(target, prop2);
          if (descriptor == null ? void 0 : descriptor.set) {
            descriptor.set.call(receiver, value2);
          }
          if (!has) {
            if (is_proxied_array && typeof prop2 === "string") {
              var ls = (
                /** @type {Source<number>} */
                sources.get("length")
              );
              var n = Number(prop2);
              if (Number.isInteger(n) && n >= ls.v) {
                set(ls, n + 1);
              }
            }
            increment(version);
          }
          return true;
        },
        ownKeys(target) {
          get(version);
          var own_keys = Reflect.ownKeys(target).filter((key3) => {
            var source3 = sources.get(key3);
            return source3 === void 0 || source3.v !== UNINITIALIZED;
          });
          for (var [key2, source2] of sources) {
            if (source2.v !== UNINITIALIZED && !(key2 in target)) {
              own_keys.push(key2);
            }
          }
          return own_keys;
        },
        setPrototypeOf() {
          state_prototype_fixed();
        }
      }
    );
  }
  function get_label(path, prop2) {
    if (typeof prop2 === "symbol") return `${path}[Symbol(${prop2.description ?? ""})]`;
    if (regex_is_valid_identifier.test(prop2)) return `${path}.${prop2}`;
    return /^\d+$/.test(prop2) ? `${path}[${prop2}]` : `${path}['${prop2}']`;
  }
  function get_proxied_value(value) {
    try {
      if (value !== null && typeof value === "object" && STATE_SYMBOL in value) {
        return value[STATE_SYMBOL];
      }
    } catch {
    }
    return value;
  }
  function is(a, b) {
    return Object.is(get_proxied_value(a), get_proxied_value(b));
  }
  const ARRAY_MUTATING_METHODS = /* @__PURE__ */ new Set([
    "copyWithin",
    "fill",
    "pop",
    "push",
    "reverse",
    "shift",
    "sort",
    "splice",
    "unshift"
  ]);
  function inspectable_array(array) {
    return new Proxy(array, {
      get(target, prop2, receiver) {
        var value = Reflect.get(target, prop2, receiver);
        if (!ARRAY_MUTATING_METHODS.has(
          /** @type {string} */
          prop2
        )) {
          return value;
        }
        return function(...args) {
          set_eager_effects_deferred();
          var result = value.apply(this, args);
          flush_eager_effects();
          return result;
        };
      }
    });
  }
  function init_array_prototype_warnings() {
    const array_prototype2 = Array.prototype;
    const cleanup = Array.__svelte_cleanup;
    if (cleanup) {
      cleanup();
    }
    const { indexOf, lastIndexOf, includes: includes2 } = array_prototype2;
    array_prototype2.indexOf = function(item, from_index) {
      const index2 = indexOf.call(this, item, from_index);
      if (index2 === -1) {
        for (let i = from_index ?? 0; i < this.length; i += 1) {
          if (get_proxied_value(this[i]) === item) {
            state_proxy_equality_mismatch("array.indexOf(...)");
            break;
          }
        }
      }
      return index2;
    };
    array_prototype2.lastIndexOf = function(item, from_index) {
      const index2 = lastIndexOf.call(this, item, from_index ?? this.length - 1);
      if (index2 === -1) {
        for (let i = 0; i <= (from_index ?? this.length - 1); i += 1) {
          if (get_proxied_value(this[i]) === item) {
            state_proxy_equality_mismatch("array.lastIndexOf(...)");
            break;
          }
        }
      }
      return index2;
    };
    array_prototype2.includes = function(item, from_index) {
      const has = includes2.call(this, item, from_index);
      if (!has) {
        for (let i = 0; i < this.length; i += 1) {
          if (get_proxied_value(this[i]) === item) {
            state_proxy_equality_mismatch("array.includes(...)");
            break;
          }
        }
      }
      return has;
    };
    Array.__svelte_cleanup = () => {
      array_prototype2.indexOf = indexOf;
      array_prototype2.lastIndexOf = lastIndexOf;
      array_prototype2.includes = includes2;
    };
  }
  function strict_equals(a, b, equal = true) {
    try {
      if (a === b !== (get_proxied_value(a) === get_proxied_value(b))) {
        state_proxy_equality_mismatch(equal ? "===" : "!==");
      }
    } catch {
    }
    return a === b === equal;
  }
  function equals(a, b, equal = true) {
    if (a == b !== (get_proxied_value(a) == get_proxied_value(b))) {
      state_proxy_equality_mismatch(equal ? "==" : "!=");
    }
    return a == b === equal;
  }
  var $window;
  var $document;
  var is_firefox;
  var first_child_getter;
  var next_sibling_getter;
  function init_operations() {
    if ($window !== void 0) {
      return;
    }
    $window = window;
    $document = document;
    is_firefox = /Firefox/.test(navigator.userAgent);
    var element_prototype = Element.prototype;
    var node_prototype = Node.prototype;
    var text_prototype = Text.prototype;
    first_child_getter = get_descriptor(node_prototype, "firstChild").get;
    next_sibling_getter = get_descriptor(node_prototype, "nextSibling").get;
    if (is_extensible(element_prototype)) {
      element_prototype.__click = void 0;
      element_prototype.__className = void 0;
      element_prototype.__attributes = null;
      element_prototype.__style = void 0;
      element_prototype.__e = void 0;
    }
    if (is_extensible(text_prototype)) {
      text_prototype.__t = void 0;
    }
    if (DEV) {
      element_prototype.__svelte_meta = null;
      init_array_prototype_warnings();
    }
  }
  function create_text(value = "") {
    return document.createTextNode(value);
  }
  // @__NO_SIDE_EFFECTS__
  function get_first_child(node) {
    return (
      /** @type {TemplateNode | null} */
      first_child_getter.call(node)
    );
  }
  // @__NO_SIDE_EFFECTS__
  function get_next_sibling(node) {
    return (
      /** @type {TemplateNode | null} */
      next_sibling_getter.call(node)
    );
  }
  function child(node, is_text) {
    if (!hydrating) {
      return /* @__PURE__ */ get_first_child(node);
    }
    var child2 = /* @__PURE__ */ get_first_child(hydrate_node);
    if (child2 === null) {
      child2 = hydrate_node.appendChild(create_text());
    } else if (is_text && child2.nodeType !== TEXT_NODE) {
      var text2 = create_text();
      child2 == null ? void 0 : child2.before(text2);
      set_hydrate_node(text2);
      return text2;
    }
    if (is_text) {
      merge_text_nodes(
        /** @type {Text} */
        child2
      );
    }
    set_hydrate_node(child2);
    return child2;
  }
  function first_child(node, is_text = false) {
    if (!hydrating) {
      var first = /* @__PURE__ */ get_first_child(node);
      if (first instanceof Comment && first.data === "") return /* @__PURE__ */ get_next_sibling(first);
      return first;
    }
    if (is_text) {
      if ((hydrate_node == null ? void 0 : hydrate_node.nodeType) !== TEXT_NODE) {
        var text2 = create_text();
        hydrate_node == null ? void 0 : hydrate_node.before(text2);
        set_hydrate_node(text2);
        return text2;
      }
      merge_text_nodes(
        /** @type {Text} */
        hydrate_node
      );
    }
    return hydrate_node;
  }
  function sibling(node, count = 1, is_text = false) {
    let next_sibling = hydrating ? hydrate_node : node;
    var last_sibling;
    while (count--) {
      last_sibling = next_sibling;
      next_sibling = /** @type {TemplateNode} */
      /* @__PURE__ */ get_next_sibling(next_sibling);
    }
    if (!hydrating) {
      return next_sibling;
    }
    if (is_text) {
      if ((next_sibling == null ? void 0 : next_sibling.nodeType) !== TEXT_NODE) {
        var text2 = create_text();
        if (next_sibling === null) {
          last_sibling == null ? void 0 : last_sibling.after(text2);
        } else {
          next_sibling.before(text2);
        }
        set_hydrate_node(text2);
        return text2;
      }
      merge_text_nodes(
        /** @type {Text} */
        next_sibling
      );
    }
    set_hydrate_node(next_sibling);
    return next_sibling;
  }
  function clear_text_content(node) {
    node.textContent = "";
  }
  function should_defer_append() {
    if (!async_mode_flag) return false;
    if (eager_block_effects !== null) return false;
    var flags2 = (
      /** @type {Effect} */
      active_effect.f
    );
    return (flags2 & REACTION_RAN) !== 0;
  }
  function create_element(tag2, namespace, is2) {
    let options = is2 ? { is: is2 } : void 0;
    return (
      /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */
      document.createElementNS(namespace ?? NAMESPACE_HTML, tag2, options)
    );
  }
  function create_fragment() {
    return document.createDocumentFragment();
  }
  function create_comment(data = "") {
    return document.createComment(data);
  }
  function set_attribute$1(element2, key2, value = "") {
    if (key2.startsWith("xlink:")) {
      element2.setAttributeNS("http://www.w3.org/1999/xlink", key2, value);
      return;
    }
    return element2.setAttribute(key2, value);
  }
  function merge_text_nodes(text2) {
    if (
      /** @type {string} */
      text2.nodeValue.length < 65536
    ) {
      return;
    }
    let next2 = text2.nextSibling;
    while (next2 !== null && next2.nodeType === TEXT_NODE) {
      next2.remove();
      text2.nodeValue += /** @type {string} */
      next2.nodeValue;
      next2 = text2.nextSibling;
    }
  }
  function autofocus(dom, value) {
    if (value) {
      const body = document.body;
      dom.autofocus = true;
      queue_micro_task(() => {
        if (document.activeElement === body) {
          dom.focus();
        }
      });
    }
  }
  function remove_textarea_child(dom) {
    if (hydrating && /* @__PURE__ */ get_first_child(dom) !== null) {
      clear_text_content(dom);
    }
  }
  let listening_to_form_reset = false;
  function add_form_reset_listener() {
    if (!listening_to_form_reset) {
      listening_to_form_reset = true;
      document.addEventListener(
        "reset",
        (evt) => {
          Promise.resolve().then(() => {
            var _a2;
            if (!evt.defaultPrevented) {
              for (
                const e of
                /**@type {HTMLFormElement} */
                evt.target.elements
              ) {
                (_a2 = e.__on_r) == null ? void 0 : _a2.call(e);
              }
            }
          });
        },
        // In the capture phase to guarantee we get noticed of it (no possibility of stopPropagation)
        { capture: true }
      );
    }
  }
  function listen(target, events, handler, call_handler_immediately = true) {
    if (call_handler_immediately) {
      handler();
    }
    for (var name of events) {
      target.addEventListener(name, handler);
    }
    teardown(() => {
      for (var name2 of events) {
        target.removeEventListener(name2, handler);
      }
    });
  }
  function without_reactive_context(fn) {
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      return fn();
    } finally {
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  function listen_to_event_and_reset_event(element2, event2, handler, on_reset = handler) {
    element2.addEventListener(event2, () => without_reactive_context(handler));
    const prev = element2.__on_r;
    if (prev) {
      element2.__on_r = () => {
        prev();
        on_reset(true);
      };
    } else {
      element2.__on_r = () => on_reset(true);
    }
    add_form_reset_listener();
  }
  function validate_effect(rune) {
    if (active_effect === null) {
      if (active_reaction === null) {
        effect_orphan(rune);
      }
      effect_in_unowned_derived();
    }
    if (is_destroying_effect) {
      effect_in_teardown(rune);
    }
  }
  function push_effect(effect2, parent_effect) {
    var parent_last = parent_effect.last;
    if (parent_last === null) {
      parent_effect.last = parent_effect.first = effect2;
    } else {
      parent_last.next = effect2;
      effect2.prev = parent_last;
      parent_effect.last = effect2;
    }
  }
  function create_effect(type, fn) {
    var parent = active_effect;
    if (DEV) {
      while (parent !== null && (parent.f & EAGER_EFFECT) !== 0) {
        parent = parent.parent;
      }
    }
    if (parent !== null && (parent.f & INERT) !== 0) {
      type |= INERT;
    }
    var effect2 = {
      ctx: component_context,
      deps: null,
      nodes: null,
      f: type | DIRTY | CONNECTED,
      first: null,
      fn,
      last: null,
      next: null,
      parent,
      b: parent && parent.b,
      prev: null,
      teardown: null,
      wv: 0,
      ac: null
    };
    if (DEV) {
      effect2.component_function = dev_current_component_function;
    }
    current_batch == null ? void 0 : current_batch.register_created_effect(effect2);
    var e = effect2;
    if ((type & EFFECT) !== 0) {
      if (collected_effects !== null) {
        collected_effects.push(effect2);
      } else {
        Batch.ensure().schedule(effect2);
      }
    } else if (fn !== null) {
      try {
        update_effect(effect2);
      } catch (e2) {
        destroy_effect(effect2);
        throw e2;
      }
      if (e.deps === null && e.teardown === null && e.nodes === null && e.first === e.last && // either `null`, or a singular child
      (e.f & EFFECT_PRESERVED) === 0) {
        e = e.first;
        if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
          e.f |= EFFECT_TRANSPARENT;
        }
      }
    }
    if (e !== null) {
      e.parent = parent;
      if (parent !== null) {
        push_effect(e, parent);
      }
      if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
        var derived2 = (
          /** @type {Derived} */
          active_reaction
        );
        (derived2.effects ?? (derived2.effects = [])).push(e);
      }
    }
    return effect2;
  }
  function effect_tracking() {
    return active_reaction !== null && !untracking;
  }
  function teardown(fn) {
    const effect2 = create_effect(RENDER_EFFECT, null);
    set_signal_status(effect2, CLEAN);
    effect2.teardown = fn;
    return effect2;
  }
  function user_effect(fn) {
    validate_effect("$effect");
    if (DEV) {
      define_property(fn, "name", {
        value: "$effect"
      });
    }
    var flags2 = (
      /** @type {Effect} */
      active_effect.f
    );
    var defer = !active_reaction && (flags2 & BRANCH_EFFECT) !== 0 && (flags2 & REACTION_RAN) === 0;
    if (defer) {
      var context = (
        /** @type {ComponentContext} */
        component_context
      );
      (context.e ?? (context.e = [])).push(fn);
    } else {
      return create_user_effect(fn);
    }
  }
  function create_user_effect(fn) {
    return create_effect(EFFECT | USER_EFFECT, fn);
  }
  function user_pre_effect(fn) {
    validate_effect("$effect.pre");
    if (DEV) {
      define_property(fn, "name", {
        value: "$effect.pre"
      });
    }
    return create_effect(RENDER_EFFECT | USER_EFFECT, fn);
  }
  function eager_effect(fn) {
    return create_effect(EAGER_EFFECT, fn);
  }
  function effect_root(fn) {
    Batch.ensure();
    const effect2 = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);
    return () => {
      destroy_effect(effect2);
    };
  }
  function component_root(fn) {
    Batch.ensure();
    const effect2 = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);
    return (options = {}) => {
      return new Promise((fulfil) => {
        if (options.outro) {
          pause_effect(effect2, () => {
            destroy_effect(effect2);
            fulfil(void 0);
          });
        } else {
          destroy_effect(effect2);
          fulfil(void 0);
        }
      });
    };
  }
  function effect(fn) {
    return create_effect(EFFECT, fn);
  }
  function legacy_pre_effect(deps, fn) {
    var context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    var token = { effect: null, ran: false, deps };
    context.l.$.push(token);
    token.effect = render_effect(() => {
      deps();
      if (token.ran) return;
      token.ran = true;
      var effect2 = (
        /** @type {Effect} */
        active_effect
      );
      try {
        set_active_effect(effect2.parent);
        untrack(fn);
      } finally {
        set_active_effect(effect2);
      }
    });
  }
  function legacy_pre_effect_reset() {
    var context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    render_effect(() => {
      for (var token of context.l.$) {
        token.deps();
        var effect2 = token.effect;
        if ((effect2.f & CLEAN) !== 0 && effect2.deps !== null) {
          set_signal_status(effect2, MAYBE_DIRTY);
        }
        if (is_dirty(effect2)) {
          update_effect(effect2);
        }
        token.ran = false;
      }
    });
  }
  function async_effect(fn) {
    return create_effect(ASYNC | EFFECT_PRESERVED, fn);
  }
  function render_effect(fn, flags2 = 0) {
    return create_effect(RENDER_EFFECT | flags2, fn);
  }
  function template_effect(fn, sync = [], async2 = [], blockers = []) {
    flatten(blockers, sync, async2, (values) => {
      create_effect(RENDER_EFFECT, () => fn(...values.map(get)));
    });
  }
  function deferred_template_effect(fn, sync = [], async2 = [], blockers = []) {
    if (async2.length > 0 || blockers.length > 0) {
      var decrement_pending = increment_pending();
    }
    flatten(blockers, sync, async2, (values) => {
      create_effect(EFFECT, () => fn(...values.map(get)));
      if (decrement_pending) {
        decrement_pending();
      }
    });
  }
  function block(fn, flags2 = 0) {
    var effect2 = create_effect(BLOCK_EFFECT | flags2, fn);
    if (DEV) {
      effect2.dev_stack = dev_stack;
    }
    return effect2;
  }
  function managed(fn, flags2 = 0) {
    var effect2 = create_effect(MANAGED_EFFECT | flags2, fn);
    if (DEV) {
      effect2.dev_stack = dev_stack;
    }
    return effect2;
  }
  function branch(fn) {
    return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn);
  }
  function execute_effect_teardown(effect2) {
    var teardown2 = effect2.teardown;
    if (teardown2 !== null) {
      const previously_destroying_effect = is_destroying_effect;
      const previous_reaction = active_reaction;
      set_is_destroying_effect(true);
      set_active_reaction(null);
      try {
        teardown2.call(null);
      } finally {
        set_is_destroying_effect(previously_destroying_effect);
        set_active_reaction(previous_reaction);
      }
    }
  }
  function destroy_effect_children(signal, remove_dom = false) {
    var effect2 = signal.first;
    signal.first = signal.last = null;
    while (effect2 !== null) {
      const controller = effect2.ac;
      if (controller !== null) {
        without_reactive_context(() => {
          controller.abort(STALE_REACTION);
        });
      }
      var next2 = effect2.next;
      if ((effect2.f & ROOT_EFFECT) !== 0) {
        effect2.parent = null;
      } else {
        destroy_effect(effect2, remove_dom);
      }
      effect2 = next2;
    }
  }
  function destroy_block_effect_children(signal) {
    var effect2 = signal.first;
    while (effect2 !== null) {
      var next2 = effect2.next;
      if ((effect2.f & BRANCH_EFFECT) === 0) {
        destroy_effect(effect2);
      }
      effect2 = next2;
    }
  }
  function destroy_effect(effect2, remove_dom = true) {
    var removed = false;
    if ((remove_dom || (effect2.f & HEAD_EFFECT) !== 0) && effect2.nodes !== null && effect2.nodes.end !== null) {
      remove_effect_dom(
        effect2.nodes.start,
        /** @type {TemplateNode} */
        effect2.nodes.end
      );
      removed = true;
    }
    set_signal_status(effect2, DESTROYING);
    destroy_effect_children(effect2, remove_dom && !removed);
    remove_reactions(effect2, 0);
    var transitions = effect2.nodes && effect2.nodes.t;
    if (transitions !== null) {
      for (const transition2 of transitions) {
        transition2.stop();
      }
    }
    execute_effect_teardown(effect2);
    effect2.f ^= DESTROYING;
    effect2.f |= DESTROYED;
    var parent = effect2.parent;
    if (parent !== null && parent.first !== null) {
      unlink_effect(effect2);
    }
    if (DEV) {
      effect2.component_function = null;
    }
    effect2.next = effect2.prev = effect2.teardown = effect2.ctx = effect2.deps = effect2.fn = effect2.nodes = effect2.ac = effect2.b = null;
  }
  function remove_effect_dom(node, end) {
    while (node !== null) {
      var next2 = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
      node.remove();
      node = next2;
    }
  }
  function unlink_effect(effect2) {
    var parent = effect2.parent;
    var prev = effect2.prev;
    var next2 = effect2.next;
    if (prev !== null) prev.next = next2;
    if (next2 !== null) next2.prev = prev;
    if (parent !== null) {
      if (parent.first === effect2) parent.first = next2;
      if (parent.last === effect2) parent.last = prev;
    }
  }
  function pause_effect(effect2, callback, destroy = true) {
    var transitions = [];
    pause_children(effect2, transitions, true);
    var fn = () => {
      if (destroy) destroy_effect(effect2);
      if (callback) callback();
    };
    var remaining = transitions.length;
    if (remaining > 0) {
      var check = () => --remaining || fn();
      for (var transition2 of transitions) {
        transition2.out(check);
      }
    } else {
      fn();
    }
  }
  function pause_children(effect2, transitions, local) {
    if ((effect2.f & INERT) !== 0) return;
    effect2.f ^= INERT;
    var t = effect2.nodes && effect2.nodes.t;
    if (t !== null) {
      for (const transition2 of t) {
        if (transition2.is_global || local) {
          transitions.push(transition2);
        }
      }
    }
    var child2 = effect2.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || // If this is a branch effect without a block effect parent,
      // it means the parent block effect was pruned. In that case,
      // transparency information was transferred to the branch effect.
      (child2.f & BRANCH_EFFECT) !== 0 && (effect2.f & BLOCK_EFFECT) !== 0;
      pause_children(child2, transitions, transparent ? local : false);
      child2 = sibling2;
    }
  }
  function resume_effect(effect2) {
    resume_children(effect2, true);
  }
  function resume_children(effect2, local) {
    if ((effect2.f & INERT) === 0) return;
    effect2.f ^= INERT;
    if ((effect2.f & CLEAN) === 0) {
      set_signal_status(effect2, DIRTY);
      Batch.ensure().schedule(effect2);
    }
    var child2 = effect2.first;
    while (child2 !== null) {
      var sibling2 = child2.next;
      var transparent = (child2.f & EFFECT_TRANSPARENT) !== 0 || (child2.f & BRANCH_EFFECT) !== 0;
      resume_children(child2, transparent ? local : false);
      child2 = sibling2;
    }
    var t = effect2.nodes && effect2.nodes.t;
    if (t !== null) {
      for (const transition2 of t) {
        if (transition2.is_global || local) {
          transition2.in();
        }
      }
    }
  }
  function aborted(effect2 = (
    /** @type {Effect} */
    active_effect
  )) {
    return (effect2.f & DESTROYED) !== 0;
  }
  function move_effect(effect2, fragment) {
    if (!effect2.nodes) return;
    var node = effect2.nodes.start;
    var end = effect2.nodes.end;
    while (node !== null) {
      var next2 = node === end ? null : /* @__PURE__ */ get_next_sibling(node);
      fragment.append(node);
      node = next2;
    }
  }
  let captured_signals = null;
  function capture_signals(fn) {
    var previous_captured_signals = captured_signals;
    try {
      captured_signals = /* @__PURE__ */ new Set();
      untrack(fn);
      if (previous_captured_signals !== null) {
        for (var signal of captured_signals) {
          previous_captured_signals.add(signal);
        }
      }
      return captured_signals;
    } finally {
      captured_signals = previous_captured_signals;
    }
  }
  function invalidate_inner_signals(fn) {
    for (var signal of capture_signals(fn)) {
      internal_set(signal, signal.v);
    }
  }
  let is_updating_effect = false;
  let is_destroying_effect = false;
  function set_is_destroying_effect(value) {
    is_destroying_effect = value;
  }
  let active_reaction = null;
  let untracking = false;
  function set_active_reaction(reaction) {
    active_reaction = reaction;
  }
  let active_effect = null;
  function set_active_effect(effect2) {
    active_effect = effect2;
  }
  let current_sources = null;
  function push_reaction_value(value) {
    if (active_reaction !== null && (!async_mode_flag || (active_reaction.f & DERIVED) !== 0)) {
      if (current_sources === null) {
        current_sources = [value];
      } else {
        current_sources.push(value);
      }
    }
  }
  let new_deps = null;
  let skipped_deps = 0;
  let untracked_writes = null;
  function set_untracked_writes(value) {
    untracked_writes = value;
  }
  let write_version = 1;
  let read_version = 0;
  let update_version = read_version;
  function set_update_version(value) {
    update_version = value;
  }
  function increment_write_version() {
    return ++write_version;
  }
  function is_dirty(reaction) {
    var flags2 = reaction.f;
    if ((flags2 & DIRTY) !== 0) {
      return true;
    }
    if (flags2 & DERIVED) {
      reaction.f &= ~WAS_MARKED;
    }
    if ((flags2 & MAYBE_DIRTY) !== 0) {
      var dependencies = (
        /** @type {Value[]} */
        reaction.deps
      );
      var length = dependencies.length;
      for (var i = 0; i < length; i++) {
        var dependency = dependencies[i];
        if (is_dirty(
          /** @type {Derived} */
          dependency
        )) {
          update_derived(
            /** @type {Derived} */
            dependency
          );
        }
        if (dependency.wv > reaction.wv) {
          return true;
        }
      }
      if ((flags2 & CONNECTED) !== 0 && // During time traveling we don't want to reset the status so that
      // traversal of the graph in the other batches still happens
      batch_values === null) {
        set_signal_status(reaction, CLEAN);
      }
    }
    return false;
  }
  function schedule_possible_effect_self_invalidation(signal, effect2, root2 = true) {
    var reactions = signal.reactions;
    if (reactions === null) return;
    if (!async_mode_flag && current_sources !== null && includes.call(current_sources, signal)) {
      return;
    }
    for (var i = 0; i < reactions.length; i++) {
      var reaction = reactions[i];
      if ((reaction.f & DERIVED) !== 0) {
        schedule_possible_effect_self_invalidation(
          /** @type {Derived} */
          reaction,
          effect2,
          false
        );
      } else if (effect2 === reaction) {
        if (root2) {
          set_signal_status(reaction, DIRTY);
        } else if ((reaction.f & CLEAN) !== 0) {
          set_signal_status(reaction, MAYBE_DIRTY);
        }
        schedule_effect(
          /** @type {Effect} */
          reaction
        );
      }
    }
  }
  function update_reaction(reaction) {
    var _a2;
    var previous_deps = new_deps;
    var previous_skipped_deps = skipped_deps;
    var previous_untracked_writes = untracked_writes;
    var previous_reaction = active_reaction;
    var previous_sources = current_sources;
    var previous_component_context = component_context;
    var previous_untracking = untracking;
    var previous_update_version = update_version;
    var flags2 = reaction.f;
    new_deps = /** @type {null | Value[]} */
    null;
    skipped_deps = 0;
    untracked_writes = null;
    active_reaction = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
    current_sources = null;
    set_component_context(reaction.ctx);
    untracking = false;
    update_version = ++read_version;
    if (reaction.ac !== null) {
      without_reactive_context(() => {
        reaction.ac.abort(STALE_REACTION);
      });
      reaction.ac = null;
    }
    try {
      reaction.f |= REACTION_IS_UPDATING;
      var fn = (
        /** @type {Function} */
        reaction.fn
      );
      var result = fn();
      reaction.f |= REACTION_RAN;
      var deps = reaction.deps;
      var is_fork = current_batch == null ? void 0 : current_batch.is_fork;
      if (new_deps !== null) {
        var i;
        if (!is_fork) {
          remove_reactions(reaction, skipped_deps);
        }
        if (deps !== null && skipped_deps > 0) {
          deps.length = skipped_deps + new_deps.length;
          for (i = 0; i < new_deps.length; i++) {
            deps[skipped_deps + i] = new_deps[i];
          }
        } else {
          reaction.deps = deps = new_deps;
        }
        if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
          for (i = skipped_deps; i < deps.length; i++) {
            ((_a2 = deps[i]).reactions ?? (_a2.reactions = [])).push(reaction);
          }
        }
      } else if (!is_fork && deps !== null && skipped_deps < deps.length) {
        remove_reactions(reaction, skipped_deps);
        deps.length = skipped_deps;
      }
      if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
        for (i = 0; i < /** @type {Source[]} */
        untracked_writes.length; i++) {
          schedule_possible_effect_self_invalidation(
            untracked_writes[i],
            /** @type {Effect} */
            reaction
          );
        }
      }
      if (previous_reaction !== null && previous_reaction !== reaction) {
        read_version++;
        if (previous_reaction.deps !== null) {
          for (let i2 = 0; i2 < previous_skipped_deps; i2 += 1) {
            previous_reaction.deps[i2].rv = read_version;
          }
        }
        if (previous_deps !== null) {
          for (const dep of previous_deps) {
            dep.rv = read_version;
          }
        }
        if (untracked_writes !== null) {
          if (previous_untracked_writes === null) {
            previous_untracked_writes = untracked_writes;
          } else {
            previous_untracked_writes.push(.../** @type {Source[]} */
            untracked_writes);
          }
        }
      }
      if ((reaction.f & ERROR_VALUE) !== 0) {
        reaction.f ^= ERROR_VALUE;
      }
      return result;
    } catch (error) {
      return handle_error(error);
    } finally {
      reaction.f ^= REACTION_IS_UPDATING;
      new_deps = previous_deps;
      skipped_deps = previous_skipped_deps;
      untracked_writes = previous_untracked_writes;
      active_reaction = previous_reaction;
      current_sources = previous_sources;
      set_component_context(previous_component_context);
      untracking = previous_untracking;
      update_version = previous_update_version;
    }
  }
  function remove_reaction(signal, dependency) {
    let reactions = dependency.reactions;
    if (reactions !== null) {
      var index2 = index_of.call(reactions, signal);
      if (index2 !== -1) {
        var new_length = reactions.length - 1;
        if (new_length === 0) {
          reactions = dependency.reactions = null;
        } else {
          reactions[index2] = reactions[new_length];
          reactions.pop();
        }
      }
    }
    if (reactions === null && (dependency.f & DERIVED) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
    // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
    // allows us to skip the expensive work of disconnecting and immediately reconnecting it
    (new_deps === null || !includes.call(new_deps, dependency))) {
      var derived2 = (
        /** @type {Derived} */
        dependency
      );
      if ((derived2.f & CONNECTED) !== 0) {
        derived2.f ^= CONNECTED;
        derived2.f &= ~WAS_MARKED;
      }
      if (derived2.v !== UNINITIALIZED) {
        update_derived_status(derived2);
      }
      freeze_derived_effects(derived2);
      remove_reactions(derived2, 0);
    }
  }
  function remove_reactions(signal, start_index) {
    var dependencies = signal.deps;
    if (dependencies === null) return;
    for (var i = start_index; i < dependencies.length; i++) {
      remove_reaction(signal, dependencies[i]);
    }
  }
  function update_effect(effect2) {
    var flags2 = effect2.f;
    if ((flags2 & DESTROYED) !== 0) {
      return;
    }
    set_signal_status(effect2, CLEAN);
    var previous_effect = active_effect;
    var was_updating_effect = is_updating_effect;
    active_effect = effect2;
    is_updating_effect = true;
    if (DEV) {
      var previous_component_fn = dev_current_component_function;
      set_dev_current_component_function(effect2.component_function);
      var previous_stack = (
        /** @type {any} */
        dev_stack
      );
      set_dev_stack(effect2.dev_stack ?? dev_stack);
    }
    try {
      if ((flags2 & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
        destroy_block_effect_children(effect2);
      } else {
        destroy_effect_children(effect2);
      }
      execute_effect_teardown(effect2);
      var teardown2 = update_reaction(effect2);
      effect2.teardown = typeof teardown2 === "function" ? teardown2 : null;
      effect2.wv = write_version;
      if (DEV && tracing_mode_flag && (effect2.f & DIRTY) !== 0 && effect2.deps !== null) {
        for (var dep of effect2.deps) {
          if (dep.set_during_effect) {
            dep.wv = increment_write_version();
            dep.set_during_effect = false;
          }
        }
      }
    } finally {
      is_updating_effect = was_updating_effect;
      active_effect = previous_effect;
      if (DEV) {
        set_dev_current_component_function(previous_component_fn);
        set_dev_stack(previous_stack);
      }
    }
  }
  async function tick() {
    if (async_mode_flag) {
      return new Promise((f) => {
        requestAnimationFrame(() => f());
        setTimeout(() => f());
      });
    }
    await Promise.resolve();
    flushSync();
  }
  function settled() {
    return Batch.ensure().settled();
  }
  function get(signal) {
    var flags2 = signal.f;
    var is_derived = (flags2 & DERIVED) !== 0;
    captured_signals == null ? void 0 : captured_signals.add(signal);
    if (active_reaction !== null && !untracking) {
      var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
      if (!destroyed && (current_sources === null || !includes.call(current_sources, signal))) {
        var deps = active_reaction.deps;
        if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
          if (signal.rv < read_version) {
            signal.rv = read_version;
            if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
              skipped_deps++;
            } else if (new_deps === null) {
              new_deps = [signal];
            } else {
              new_deps.push(signal);
            }
          }
        } else {
          (active_reaction.deps ?? (active_reaction.deps = [])).push(signal);
          var reactions = signal.reactions;
          if (reactions === null) {
            signal.reactions = [active_reaction];
          } else if (!includes.call(reactions, active_reaction)) {
            reactions.push(active_reaction);
          }
        }
      }
    }
    if (DEV) {
      if (!untracking && reactivity_loss_tracker && !reactivity_loss_tracker.warned && (reactivity_loss_tracker.effect.f & REACTION_IS_UPDATING) === 0 && !reactivity_loss_tracker.effect_deps.has(signal)) {
        reactivity_loss_tracker.warned = true;
        await_reactivity_loss(
          /** @type {string} */
          signal.label
        );
        var trace2 = get_error("traced at");
        if (trace2) console.warn(trace2);
      }
      recent_async_deriveds.delete(signal);
      if (tracing_mode_flag && !untracking && tracing_expressions !== null && active_reaction !== null && tracing_expressions.reaction === active_reaction) {
        if (signal.trace) {
          signal.trace();
        } else {
          trace2 = get_error("traced at");
          if (trace2) {
            var entry = tracing_expressions.entries.get(signal);
            if (entry === void 0) {
              entry = { traces: [] };
              tracing_expressions.entries.set(signal, entry);
            }
            var last = entry.traces[entry.traces.length - 1];
            if (trace2.stack !== (last == null ? void 0 : last.stack)) {
              entry.traces.push(trace2);
            }
          }
        }
      }
    }
    if (is_destroying_effect && old_values.has(signal)) {
      return old_values.get(signal);
    }
    if (is_derived) {
      var derived2 = (
        /** @type {Derived} */
        signal
      );
      if (is_destroying_effect) {
        var value = derived2.v;
        if ((derived2.f & CLEAN) === 0 && derived2.reactions !== null || depends_on_old_values(derived2)) {
          value = execute_derived(derived2);
        }
        old_values.set(derived2, value);
        return value;
      }
      var should_connect = (derived2.f & CONNECTED) === 0 && !untracking && active_reaction !== null && (is_updating_effect || (active_reaction.f & CONNECTED) !== 0);
      var is_new = (derived2.f & REACTION_RAN) === 0;
      if (is_dirty(derived2)) {
        if (should_connect) {
          derived2.f |= CONNECTED;
        }
        update_derived(derived2);
      }
      if (should_connect && !is_new) {
        unfreeze_derived_effects(derived2);
        reconnect(derived2);
      }
    }
    if (batch_values == null ? void 0 : batch_values.has(signal)) {
      return batch_values.get(signal);
    }
    if ((signal.f & ERROR_VALUE) !== 0) {
      throw signal.v;
    }
    return signal.v;
  }
  function reconnect(derived2) {
    derived2.f |= CONNECTED;
    if (derived2.deps === null) return;
    for (const dep of derived2.deps) {
      (dep.reactions ?? (dep.reactions = [])).push(derived2);
      if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
        unfreeze_derived_effects(
          /** @type {Derived} */
          dep
        );
        reconnect(
          /** @type {Derived} */
          dep
        );
      }
    }
  }
  function depends_on_old_values(derived2) {
    if (derived2.v === UNINITIALIZED) return true;
    if (derived2.deps === null) return false;
    for (const dep of derived2.deps) {
      if (old_values.has(dep)) {
        return true;
      }
      if ((dep.f & DERIVED) !== 0 && depends_on_old_values(
        /** @type {Derived} */
        dep
      )) {
        return true;
      }
    }
    return false;
  }
  function safe_get(signal) {
    return signal && get(signal);
  }
  function untrack(fn) {
    var previous_untracking = untracking;
    try {
      untracking = true;
      return fn();
    } finally {
      untracking = previous_untracking;
    }
  }
  function deep_read_state(value) {
    if (typeof value !== "object" || !value || value instanceof EventTarget) {
      return;
    }
    if (STATE_SYMBOL in value) {
      deep_read(value);
    } else if (!Array.isArray(value)) {
      for (let key2 in value) {
        const prop2 = value[key2];
        if (typeof prop2 === "object" && prop2 && STATE_SYMBOL in prop2) {
          deep_read(prop2);
        }
      }
    }
  }
  function deep_read(value, visited = /* @__PURE__ */ new Set()) {
    if (typeof value === "object" && value !== null && // We don't want to traverse DOM elements
    !(value instanceof EventTarget) && !visited.has(value)) {
      visited.add(value);
      if (value instanceof Date) {
        value.getTime();
      }
      for (let key2 in value) {
        try {
          deep_read(value[key2], visited);
        } catch (e) {
        }
      }
      const proto = get_prototype_of(value);
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== Map.prototype && proto !== Set.prototype && proto !== Date.prototype) {
        const descriptors = get_descriptors(proto);
        for (let key2 in descriptors) {
          const get2 = descriptors[key2].get;
          if (get2) {
            try {
              get2.call(value);
            } catch (e) {
            }
          }
        }
      }
    }
  }
  function createAttachmentKey() {
    return Symbol(ATTACHMENT_KEY);
  }
  function fromAction(action2, fn = (
    /** @type {() => T} */
    noop
  )) {
    return (element2) => {
      const { update: update2, destroy } = untrack(() => action2(element2, fn()) ?? {});
      if (update2) {
        var ran = false;
        render_effect(() => {
          const arg = fn();
          if (ran) update2(arg);
        });
        ran = true;
      }
      if (destroy) {
        teardown(destroy);
      }
    };
  }
  const regex_return_characters = /\r/g;
  function hash(str) {
    str = str.replace(regex_return_characters, "");
    let hash2 = 5381;
    let i = str.length;
    while (i--) hash2 = (hash2 << 5) - hash2 ^ str.charCodeAt(i);
    return (hash2 >>> 0).toString(36);
  }
  const VOID_ELEMENT_NAMES = [
    "area",
    "base",
    "br",
    "col",
    "command",
    "embed",
    "hr",
    "img",
    "input",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ];
  function is_void(name) {
    return VOID_ELEMENT_NAMES.includes(name) || name.toLowerCase() === "!doctype";
  }
  const RESERVED_WORDS = [
    "arguments",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield"
  ];
  function is_reserved(word) {
    return RESERVED_WORDS.includes(word);
  }
  function is_capture_event(name) {
    return name.endsWith("capture") && name !== "gotpointercapture" && name !== "lostpointercapture";
  }
  const DELEGATED_EVENTS = [
    "beforeinput",
    "click",
    "change",
    "dblclick",
    "contextmenu",
    "focusin",
    "focusout",
    "input",
    "keydown",
    "keyup",
    "mousedown",
    "mousemove",
    "mouseout",
    "mouseover",
    "mouseup",
    "pointerdown",
    "pointermove",
    "pointerout",
    "pointerover",
    "pointerup",
    "touchend",
    "touchmove",
    "touchstart"
  ];
  function can_delegate_event(event_name) {
    return DELEGATED_EVENTS.includes(event_name);
  }
  const DOM_BOOLEAN_ATTRIBUTES = [
    "allowfullscreen",
    "async",
    "autofocus",
    "autoplay",
    "checked",
    "controls",
    "default",
    "disabled",
    "formnovalidate",
    "indeterminate",
    "inert",
    "ismap",
    "loop",
    "multiple",
    "muted",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "readonly",
    "required",
    "reversed",
    "seamless",
    "selected",
    "webkitdirectory",
    "defer",
    "disablepictureinpicture",
    "disableremoteplayback"
  ];
  function is_boolean_attribute(name) {
    return DOM_BOOLEAN_ATTRIBUTES.includes(name);
  }
  const ATTRIBUTE_ALIASES = {
    // no `class: 'className'` because we handle that separately
    formnovalidate: "formNoValidate",
    ismap: "isMap",
    nomodule: "noModule",
    playsinline: "playsInline",
    readonly: "readOnly",
    defaultvalue: "defaultValue",
    defaultchecked: "defaultChecked",
    srcobject: "srcObject",
    novalidate: "noValidate",
    allowfullscreen: "allowFullscreen",
    disablepictureinpicture: "disablePictureInPicture",
    disableremoteplayback: "disableRemotePlayback"
  };
  function normalize_attribute(name) {
    name = name.toLowerCase();
    return ATTRIBUTE_ALIASES[name] ?? name;
  }
  const DOM_PROPERTIES = [
    ...DOM_BOOLEAN_ATTRIBUTES,
    "formNoValidate",
    "isMap",
    "noModule",
    "playsInline",
    "readOnly",
    "value",
    "volume",
    "defaultValue",
    "defaultChecked",
    "srcObject",
    "noValidate",
    "allowFullscreen",
    "disablePictureInPicture",
    "disableRemotePlayback"
  ];
  function is_dom_property(name) {
    return DOM_PROPERTIES.includes(name);
  }
  const NON_STATIC_PROPERTIES = ["autofocus", "muted", "defaultValue", "defaultChecked"];
  function cannot_be_set_statically(name) {
    return NON_STATIC_PROPERTIES.includes(name);
  }
  const PASSIVE_EVENTS = ["touchstart", "touchmove"];
  function is_passive_event(name) {
    return PASSIVE_EVENTS.includes(name);
  }
  const CONTENT_EDITABLE_BINDINGS = ["textContent", "innerHTML", "innerText"];
  function is_content_editable_binding(name) {
    return CONTENT_EDITABLE_BINDINGS.includes(name);
  }
  const LOAD_ERROR_ELEMENTS = [
    "body",
    "embed",
    "iframe",
    "img",
    "link",
    "object",
    "script",
    "style",
    "track"
  ];
  function is_load_error_element(name) {
    return LOAD_ERROR_ELEMENTS.includes(name);
  }
  const SVG_ELEMENTS = [
    "altGlyph",
    "altGlyphDef",
    "altGlyphItem",
    "animate",
    "animateColor",
    "animateMotion",
    "animateTransform",
    "circle",
    "clipPath",
    "color-profile",
    "cursor",
    "defs",
    "desc",
    "discard",
    "ellipse",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "filter",
    "font",
    "font-face",
    "font-face-format",
    "font-face-name",
    "font-face-src",
    "font-face-uri",
    "foreignObject",
    "g",
    "glyph",
    "glyphRef",
    "hatch",
    "hatchpath",
    "hkern",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "mesh",
    "meshgradient",
    "meshpatch",
    "meshrow",
    "metadata",
    "missing-glyph",
    "mpath",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "solidcolor",
    "stop",
    "svg",
    "switch",
    "symbol",
    "text",
    "textPath",
    "tref",
    "tspan",
    "unknown",
    "use",
    "view",
    "vkern"
  ];
  function is_svg(name) {
    return SVG_ELEMENTS.includes(name);
  }
  const MATHML_ELEMENTS = [
    "annotation",
    "annotation-xml",
    "maction",
    "math",
    "merror",
    "mfrac",
    "mi",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mprescripts",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "semantics"
  ];
  function is_mathml(name) {
    return MATHML_ELEMENTS.includes(name);
  }
  const STATE_CREATION_RUNES = (
    /** @type {const} */
    [
      "$state",
      "$state.raw",
      "$derived",
      "$derived.by"
    ]
  );
  const RUNES = (
    /** @type {const} */
    [
      ...STATE_CREATION_RUNES,
      "$state.eager",
      "$state.snapshot",
      "$props",
      "$props.id",
      "$bindable",
      "$effect",
      "$effect.pre",
      "$effect.tracking",
      "$effect.root",
      "$effect.pending",
      "$inspect",
      "$inspect().with",
      "$inspect.trace",
      "$host"
    ]
  );
  function is_rune(name) {
    return RUNES.includes(
      /** @type {RuneName} */
      name
    );
  }
  function is_state_creation_rune(name) {
    return STATE_CREATION_RUNES.includes(
      /** @type {StateCreationRuneName} */
      name
    );
  }
  const RAW_TEXT_ELEMENTS = (
    /** @type {const} */
    ["textarea", "script", "style", "title"]
  );
  function is_raw_text_element(name) {
    return RAW_TEXT_ELEMENTS.includes(
      /** @type {typeof RAW_TEXT_ELEMENTS[number]} */
      name
    );
  }
  const REGEX_VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9.\-_\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]+)*$/u;
  function sanitize_location(location2) {
    return (
      /** @type {T} */
      location2 == null ? void 0 : location2.replace(/\//g, "/​")
    );
  }
  function compare(a, b, property, location2) {
    if (a !== b && typeof b === "object" && STATE_SYMBOL in b) {
      assignment_value_stale(
        property,
        /** @type {string} */
        sanitize_location(location2)
      );
    }
    return a;
  }
  function assign(object, property, operator, rhs, location2) {
    return compare(
      operator === "=" ? object[property] = rhs : operator === "&&=" ? object[property] && (object[property] = rhs()) : operator === "||=" ? object[property] || (object[property] = rhs()) : operator === "??=" ? object[property] ?? (object[property] = rhs()) : null,
      untrack(() => object[property]),
      property,
      location2
    );
  }
  async function assign_async(object, property, operator, rhs, location2) {
    return compare(
      operator === "=" ? object[property] = await rhs : operator === "&&=" ? object[property] && (object[property] = await rhs()) : operator === "||=" ? object[property] || (object[property] = await rhs()) : operator === "??=" ? object[property] ?? (object[property] = await rhs()) : null,
      untrack(() => object[property]),
      property,
      location2
    );
  }
  var all_styles = /* @__PURE__ */ new Map();
  function register_style(hash2, style) {
    var styles = all_styles.get(hash2);
    if (!styles) {
      styles = /* @__PURE__ */ new Set();
      all_styles.set(hash2, styles);
    }
    styles.add(style);
  }
  function cleanup_styles(hash2) {
    var styles = all_styles.get(hash2);
    if (!styles) return;
    for (const style of styles) {
      style.remove();
    }
    all_styles.delete(hash2);
  }
  function add_locations(fn, filename, locations) {
    return (...args) => {
      const dom = fn(...args);
      var node = hydrating ? dom : dom.nodeType === DOCUMENT_FRAGMENT_NODE ? dom.firstChild : dom;
      assign_locations(node, filename, locations);
      return dom;
    };
  }
  function assign_location(element2, filename, location2) {
    element2.__svelte_meta = {
      parent: dev_stack,
      loc: { file: filename, line: location2[0], column: location2[1] }
    };
    if (location2[2]) {
      assign_locations(element2.firstChild, filename, location2[2]);
    }
  }
  function assign_locations(node, filename, locations) {
    var i = 0;
    var depth = 0;
    while (node && i < locations.length) {
      if (hydrating && node.nodeType === COMMENT_NODE) {
        var comment2 = (
          /** @type {Comment} */
          node
        );
        if (comment2.data[0] === HYDRATION_START) depth += 1;
        else if (comment2.data[0] === HYDRATION_END) depth -= 1;
      }
      if (depth === 0 && node.nodeType === ELEMENT_NODE) {
        assign_location(
          /** @type {Element} */
          node,
          filename,
          locations[i++]
        );
      }
      node = node.nextSibling;
    }
  }
  const event_symbol = Symbol("events");
  const all_registered_events = /* @__PURE__ */ new Set();
  const root_event_handles = /* @__PURE__ */ new Set();
  function replay_events(dom) {
    if (!hydrating) return;
    dom.removeAttribute("onload");
    dom.removeAttribute("onerror");
    const event2 = dom.__e;
    if (event2 !== void 0) {
      dom.__e = void 0;
      queueMicrotask(() => {
        if (dom.isConnected) {
          dom.dispatchEvent(event2);
        }
      });
    }
  }
  function create_event(event_name, dom, handler, options = {}) {
    function target_handler(event2) {
      if (!options.capture) {
        handle_event_propagation.call(dom, event2);
      }
      if (!event2.cancelBubble) {
        return without_reactive_context(() => {
          return handler == null ? void 0 : handler.call(this, event2);
        });
      }
    }
    if (event_name.startsWith("pointer") || event_name.startsWith("touch") || event_name === "wheel") {
      queue_micro_task(() => {
        dom.addEventListener(event_name, target_handler, options);
      });
    } else {
      dom.addEventListener(event_name, target_handler, options);
    }
    return target_handler;
  }
  function on(element2, type, handler, options = {}) {
    var target_handler = create_event(type, element2, handler, options);
    return () => {
      element2.removeEventListener(type, target_handler, options);
    };
  }
  function event(event_name, dom, handler, capture2, passive2) {
    var options = { capture: capture2, passive: passive2 };
    var target_handler = create_event(event_name, dom, handler, options);
    if (dom === document.body || // @ts-ignore
    dom === window || // @ts-ignore
    dom === document || // Firefox has quirky behavior, it can happen that we still get "canplay" events when the element is already removed
    dom instanceof HTMLMediaElement) {
      teardown(() => {
        dom.removeEventListener(event_name, target_handler, options);
      });
    }
  }
  function delegated(event_name, element2, handler) {
    (element2[event_symbol] ?? (element2[event_symbol] = {}))[event_name] = handler;
  }
  function delegate(events) {
    for (var i = 0; i < events.length; i++) {
      all_registered_events.add(events[i]);
    }
    for (var fn of root_event_handles) {
      fn(events);
    }
  }
  let last_propagated_event = null;
  function handle_event_propagation(event2) {
    var _a2, _b2;
    var handler_element = this;
    var owner_document = (
      /** @type {Node} */
      handler_element.ownerDocument
    );
    var event_name = event2.type;
    var path = ((_a2 = event2.composedPath) == null ? void 0 : _a2.call(event2)) || [];
    var current_target = (
      /** @type {null | Element} */
      path[0] || event2.target
    );
    last_propagated_event = event2;
    var path_idx = 0;
    var handled_at = last_propagated_event === event2 && event2[event_symbol];
    if (handled_at) {
      var at_idx = path.indexOf(handled_at);
      if (at_idx !== -1 && (handler_element === document || handler_element === /** @type {any} */
      window)) {
        event2[event_symbol] = handler_element;
        return;
      }
      var handler_idx = path.indexOf(handler_element);
      if (handler_idx === -1) {
        return;
      }
      if (at_idx <= handler_idx) {
        path_idx = at_idx;
      }
    }
    current_target = /** @type {Element} */
    path[path_idx] || event2.target;
    if (current_target === handler_element) return;
    define_property(event2, "currentTarget", {
      configurable: true,
      get() {
        return current_target || owner_document;
      }
    });
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(null);
    set_active_effect(null);
    try {
      var throw_error;
      var other_errors = [];
      while (current_target !== null) {
        var parent_element = current_target.assignedSlot || current_target.parentNode || /** @type {any} */
        current_target.host || null;
        try {
          var delegated2 = (_b2 = current_target[event_symbol]) == null ? void 0 : _b2[event_name];
          if (delegated2 != null && (!/** @type {any} */
          current_target.disabled || // DOM could've been updated already by the time this is reached, so we check this as well
          // -> the target could not have been disabled because it emits the event in the first place
          event2.target === current_target)) {
            delegated2.call(current_target, event2);
          }
        } catch (error) {
          if (throw_error) {
            other_errors.push(error);
          } else {
            throw_error = error;
          }
        }
        if (event2.cancelBubble || parent_element === handler_element || parent_element === null) {
          break;
        }
        current_target = parent_element;
      }
      if (throw_error) {
        for (let error of other_errors) {
          queueMicrotask(() => {
            throw error;
          });
        }
        throw throw_error;
      }
    } finally {
      event2[event_symbol] = handler_element;
      delete event2.currentTarget;
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
  }
  function apply(thunk, element2, args, component2, loc, has_side_effects = false, remove_parens = false) {
    var _a2, _b2;
    let handler;
    let error;
    try {
      handler = thunk();
    } catch (e) {
      error = e;
    }
    if (typeof handler !== "function" && (has_side_effects || handler != null || error)) {
      const filename = component2 == null ? void 0 : component2[FILENAME];
      const location2 = loc ? ` at ${filename}:${loc[0]}:${loc[1]}` : ` in ${filename}`;
      const phase = ((_a2 = args[0]) == null ? void 0 : _a2.eventPhase) < Event.BUBBLING_PHASE ? "capture" : "";
      const event_name = ((_b2 = args[0]) == null ? void 0 : _b2.type) + phase;
      const description = `\`${event_name}\` handler${location2}`;
      const suggestion = remove_parens ? "remove the trailing `()`" : "add a leading `() =>`";
      event_handler_invalid(description, suggestion);
      if (error) {
        throw error;
      }
    }
    handler == null ? void 0 : handler.apply(element2, args);
  }
  const policy = (
    // We gotta write it like this because after downleveling the pure comment may end up in the wrong location
    ((_b = globalThis == null ? void 0 : globalThis.window) == null ? void 0 : _b.trustedTypes) && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", {
      /** @param {string} html */
      createHTML: (html2) => {
        return html2;
      }
    })
  );
  function create_trusted_html(html2) {
    return (
      /** @type {string} */
      (policy == null ? void 0 : policy.createHTML(html2)) ?? html2
    );
  }
  function create_fragment_from_html(html2) {
    var elem = create_element("template");
    elem.innerHTML = create_trusted_html(html2.replaceAll("<!>", "<!---->"));
    return elem.content;
  }
  const TEMPLATE_TAG = IS_XHTML ? "template" : "TEMPLATE";
  const SCRIPT_TAG = IS_XHTML ? "script" : "SCRIPT";
  function assign_nodes(start, end) {
    var effect2 = (
      /** @type {Effect} */
      active_effect
    );
    if (effect2.nodes === null) {
      effect2.nodes = { start, end, a: null, t: null };
    }
  }
  // @__NO_SIDE_EFFECTS__
  function from_html(content, flags2) {
    var is_fragment = (flags2 & TEMPLATE_FRAGMENT) !== 0;
    var use_import_node = (flags2 & TEMPLATE_USE_IMPORT_NODE) !== 0;
    var node;
    var has_start = !content.startsWith("<!>");
    return () => {
      if (hydrating) {
        assign_nodes(hydrate_node, null);
        return hydrate_node;
      }
      if (node === void 0) {
        node = create_fragment_from_html(has_start ? content : "<!>" + content);
        if (!is_fragment) node = /** @type {TemplateNode} */
        /* @__PURE__ */ get_first_child(node);
      }
      var clone2 = (
        /** @type {TemplateNode} */
        use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
      );
      if (is_fragment) {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_first_child(clone2)
        );
        var end = (
          /** @type {TemplateNode} */
          clone2.lastChild
        );
        assign_nodes(start, end);
      } else {
        assign_nodes(clone2, clone2);
      }
      return clone2;
    };
  }
  // @__NO_SIDE_EFFECTS__
  function from_namespace(content, flags2, ns = "svg") {
    var has_start = !content.startsWith("<!>");
    var is_fragment = (flags2 & TEMPLATE_FRAGMENT) !== 0;
    var wrapped = `<${ns}>${has_start ? content : "<!>" + content}</${ns}>`;
    var node;
    return () => {
      if (hydrating) {
        assign_nodes(hydrate_node, null);
        return hydrate_node;
      }
      if (!node) {
        var fragment = (
          /** @type {DocumentFragment} */
          create_fragment_from_html(wrapped)
        );
        var root2 = (
          /** @type {Element} */
          /* @__PURE__ */ get_first_child(fragment)
        );
        if (is_fragment) {
          node = document.createDocumentFragment();
          while (/* @__PURE__ */ get_first_child(root2)) {
            node.appendChild(
              /** @type {TemplateNode} */
              /* @__PURE__ */ get_first_child(root2)
            );
          }
        } else {
          node = /** @type {Element} */
          /* @__PURE__ */ get_first_child(root2);
        }
      }
      var clone2 = (
        /** @type {TemplateNode} */
        node.cloneNode(true)
      );
      if (is_fragment) {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_first_child(clone2)
        );
        var end = (
          /** @type {TemplateNode} */
          clone2.lastChild
        );
        assign_nodes(start, end);
      } else {
        assign_nodes(clone2, clone2);
      }
      return clone2;
    };
  }
  // @__NO_SIDE_EFFECTS__
  function from_svg(content, flags2) {
    return /* @__PURE__ */ from_namespace(content, flags2, "svg");
  }
  // @__NO_SIDE_EFFECTS__
  function from_mathml(content, flags2) {
    return /* @__PURE__ */ from_namespace(content, flags2, "math");
  }
  function fragment_from_tree(structure, ns) {
    var fragment = create_fragment();
    for (var item of structure) {
      if (typeof item === "string") {
        fragment.append(create_text(item));
        continue;
      }
      if (item === void 0 || item[0][0] === "/") {
        fragment.append(create_comment(item ? item[0].slice(3) : ""));
        continue;
      }
      const [name, attributes, ...children] = item;
      const namespace = name === "svg" ? NAMESPACE_SVG : name === "math" ? NAMESPACE_MATHML : ns;
      var element2 = create_element(name, namespace, attributes == null ? void 0 : attributes.is);
      for (var key2 in attributes) {
        set_attribute$1(element2, key2, attributes[key2]);
      }
      if (children.length > 0) {
        var target = element2.nodeName === TEMPLATE_TAG ? (
          /** @type {HTMLTemplateElement} */
          element2.content
        ) : element2;
        target.append(
          fragment_from_tree(children, element2.nodeName === "foreignObject" ? void 0 : namespace)
        );
      }
      fragment.append(element2);
    }
    return fragment;
  }
  // @__NO_SIDE_EFFECTS__
  function from_tree(structure, flags2) {
    var is_fragment = (flags2 & TEMPLATE_FRAGMENT) !== 0;
    var use_import_node = (flags2 & TEMPLATE_USE_IMPORT_NODE) !== 0;
    var node;
    return () => {
      if (hydrating) {
        assign_nodes(hydrate_node, null);
        return hydrate_node;
      }
      if (node === void 0) {
        const ns = (flags2 & TEMPLATE_USE_SVG) !== 0 ? NAMESPACE_SVG : (flags2 & TEMPLATE_USE_MATHML) !== 0 ? NAMESPACE_MATHML : void 0;
        node = fragment_from_tree(structure, ns);
        if (!is_fragment) node = /** @type {TemplateNode} */
        /* @__PURE__ */ get_first_child(node);
      }
      var clone2 = (
        /** @type {TemplateNode} */
        use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
      );
      if (is_fragment) {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_first_child(clone2)
        );
        var end = (
          /** @type {TemplateNode} */
          clone2.lastChild
        );
        assign_nodes(start, end);
      } else {
        assign_nodes(clone2, clone2);
      }
      return clone2;
    };
  }
  function with_script(fn) {
    return () => run_scripts(fn());
  }
  function run_scripts(node) {
    if (hydrating) return node;
    const is_fragment = node.nodeType === DOCUMENT_FRAGMENT_NODE;
    const scripts = (
      /** @type {HTMLElement} */
      node.nodeName === SCRIPT_TAG ? [
        /** @type {HTMLScriptElement} */
        node
      ] : node.querySelectorAll("script")
    );
    const effect2 = (
      /** @type {Effect & { nodes: EffectNodes }} */
      active_effect
    );
    for (const script of scripts) {
      const clone2 = create_element("script");
      for (var attribute of script.attributes) {
        clone2.setAttribute(attribute.name, attribute.value);
      }
      clone2.textContent = script.textContent;
      if (is_fragment ? node.firstChild === script : node === script) {
        effect2.nodes.start = clone2;
      }
      if (is_fragment ? node.lastChild === script : node === script) {
        effect2.nodes.end = clone2;
      }
      script.replaceWith(clone2);
    }
    return node;
  }
  function text(value = "") {
    if (!hydrating) {
      var t = create_text(value + "");
      assign_nodes(t, t);
      return t;
    }
    var node = hydrate_node;
    if (node.nodeType !== TEXT_NODE) {
      node.before(node = create_text());
      set_hydrate_node(node);
    } else {
      merge_text_nodes(
        /** @type {Text} */
        node
      );
    }
    assign_nodes(node, node);
    return node;
  }
  function comment() {
    if (hydrating) {
      assign_nodes(hydrate_node, null);
      return hydrate_node;
    }
    var frag = document.createDocumentFragment();
    var start = document.createComment("");
    var anchor = create_text();
    frag.append(start, anchor);
    assign_nodes(start, anchor);
    return frag;
  }
  function append(anchor, dom) {
    if (hydrating) {
      var effect2 = (
        /** @type {Effect & { nodes: EffectNodes }} */
        active_effect
      );
      if ((effect2.f & REACTION_RAN) === 0 || effect2.nodes.end === null) {
        effect2.nodes.end = hydrate_node;
      }
      hydrate_next();
      return;
    }
    if (anchor === null) {
      return;
    }
    anchor.before(
      /** @type {Node} */
      dom
    );
  }
  function props_id() {
    var _a2, _b2;
    if (hydrating && hydrate_node && hydrate_node.nodeType === COMMENT_NODE && ((_a2 = hydrate_node.textContent) == null ? void 0 : _a2.startsWith(`$`))) {
      const id = hydrate_node.textContent.substring(1);
      hydrate_next();
      return id;
    }
    (_b2 = window.__svelte ?? (window.__svelte = {})).uid ?? (_b2.uid = 1);
    return `c${window.__svelte.uid++}`;
  }
  let should_intro = true;
  function set_should_intro(value) {
    should_intro = value;
  }
  function set_text(text2, value) {
    var str = value == null ? "" : typeof value === "object" ? `${value}` : value;
    if (str !== (text2.__t ?? (text2.__t = text2.nodeValue))) {
      text2.__t = str;
      text2.nodeValue = `${str}`;
    }
  }
  function mount(component2, options) {
    return _mount(component2, options);
  }
  function hydrate(component2, options) {
    init_operations();
    options.intro = options.intro ?? false;
    const target = options.target;
    const was_hydrating = hydrating;
    const previous_hydrate_node = hydrate_node;
    try {
      var anchor = /* @__PURE__ */ get_first_child(target);
      while (anchor && (anchor.nodeType !== COMMENT_NODE || /** @type {Comment} */
      anchor.data !== HYDRATION_START)) {
        anchor = /* @__PURE__ */ get_next_sibling(anchor);
      }
      if (!anchor) {
        throw HYDRATION_ERROR;
      }
      set_hydrating(true);
      set_hydrate_node(
        /** @type {Comment} */
        anchor
      );
      const instance = _mount(component2, { ...options, anchor });
      set_hydrating(false);
      return (
        /**  @type {Exports} */
        instance
      );
    } catch (error) {
      if (error instanceof Error && error.message.split("\n").some((line) => line.startsWith("https://svelte.dev/e/"))) {
        throw error;
      }
      if (error !== HYDRATION_ERROR) {
        console.warn("Failed to hydrate: ", error);
      }
      if (options.recover === false) {
        hydration_failed();
      }
      init_operations();
      clear_text_content(target);
      set_hydrating(false);
      return mount(component2, options);
    } finally {
      set_hydrating(was_hydrating);
      set_hydrate_node(previous_hydrate_node);
    }
  }
  const listeners = /* @__PURE__ */ new Map();
  function _mount(Component, { target, anchor, props = {}, events, context, intro = true, transformError }) {
    init_operations();
    var component2 = void 0;
    var unmount2 = component_root(() => {
      var anchor_node = anchor ?? target.appendChild(create_text());
      boundary(
        /** @type {TemplateNode} */
        anchor_node,
        {
          pending: () => {
          }
        },
        (anchor_node2) => {
          push({});
          var ctx = (
            /** @type {ComponentContext} */
            component_context
          );
          if (context) ctx.c = context;
          if (events) {
            props.$$events = events;
          }
          if (hydrating) {
            assign_nodes(
              /** @type {TemplateNode} */
              anchor_node2,
              null
            );
          }
          should_intro = intro;
          component2 = Component(anchor_node2, props) || {};
          should_intro = true;
          if (hydrating) {
            active_effect.nodes.end = hydrate_node;
            if (hydrate_node === null || hydrate_node.nodeType !== COMMENT_NODE || /** @type {Comment} */
            hydrate_node.data !== HYDRATION_END) {
              hydration_mismatch();
              throw HYDRATION_ERROR;
            }
          }
          pop();
        },
        transformError
      );
      var registered_events = /* @__PURE__ */ new Set();
      var event_handle = (events2) => {
        for (var i = 0; i < events2.length; i++) {
          var event_name = events2[i];
          if (registered_events.has(event_name)) continue;
          registered_events.add(event_name);
          var passive2 = is_passive_event(event_name);
          for (const node of [target, document]) {
            var counts = listeners.get(node);
            if (counts === void 0) {
              counts = /* @__PURE__ */ new Map();
              listeners.set(node, counts);
            }
            var count = counts.get(event_name);
            if (count === void 0) {
              node.addEventListener(event_name, handle_event_propagation, { passive: passive2 });
              counts.set(event_name, 1);
            } else {
              counts.set(event_name, count + 1);
            }
          }
        }
      };
      event_handle(array_from(all_registered_events));
      root_event_handles.add(event_handle);
      return () => {
        var _a2;
        for (var event_name of registered_events) {
          for (const node of [target, document]) {
            var counts = (
              /** @type {Map<string, number>} */
              listeners.get(node)
            );
            var count = (
              /** @type {number} */
              counts.get(event_name)
            );
            if (--count == 0) {
              node.removeEventListener(event_name, handle_event_propagation);
              counts.delete(event_name);
              if (counts.size === 0) {
                listeners.delete(node);
              }
            } else {
              counts.set(event_name, count);
            }
          }
        }
        root_event_handles.delete(event_handle);
        if (anchor_node !== anchor) {
          (_a2 = anchor_node.parentNode) == null ? void 0 : _a2.removeChild(anchor_node);
        }
      };
    });
    mounted_components.set(component2, unmount2);
    return component2;
  }
  let mounted_components = /* @__PURE__ */ new WeakMap();
  function unmount(component2, options) {
    const fn = mounted_components.get(component2);
    if (fn) {
      mounted_components.delete(component2);
      return fn(options);
    }
    if (DEV) {
      if (STATE_SYMBOL in component2) {
        state_proxy_unmount();
      } else {
        lifecycle_double_unmount();
      }
    }
    return Promise.resolve();
  }
  function hmr(fn) {
    const current = source(fn);
    function wrapper(initial_anchor, props) {
      let component2 = {};
      let instance = {};
      let effect2;
      let ran = false;
      let anchor = initial_anchor;
      block(() => {
        if (component2 === (component2 = get(current))) {
          return;
        }
        if (effect2) {
          for (var k in instance) delete instance[k];
          destroy_effect(effect2);
        }
        effect2 = branch(() => {
          anchor = /** @type {any} */
          anchor[HMR_ANCHOR] ?? anchor;
          if (ran) set_should_intro(false);
          var result = (
            // @ts-expect-error
            new.target ? new component2(anchor, props) : component2(anchor, props)
          );
          if (result) {
            Object.defineProperties(instance, Object.getOwnPropertyDescriptors(result));
          }
          if (ran) set_should_intro(true);
        });
        active_effect.nodes = effect2.nodes;
      }, EFFECT_TRANSPARENT);
      ran = true;
      if (hydrating) {
        anchor = hydrate_node;
      }
      return instance;
    }
    wrapper[FILENAME] = fn[FILENAME];
    wrapper[HMR] = {
      fn,
      current,
      update: (incoming) => {
        set(wrapper[HMR].current, incoming[HMR].fn);
        incoming[HMR].current = wrapper[HMR].current;
      }
    };
    return wrapper;
  }
  function create_ownership_validator(props) {
    var _a2;
    const component2 = component_context == null ? void 0 : component_context.function;
    const parent = (_a2 = component_context == null ? void 0 : component_context.p) == null ? void 0 : _a2.function;
    return {
      /**
       * @param {string} prop
       * @param {any[]} path
       * @param {any} result
       * @param {number} line
       * @param {number} column
       */
      mutation: (prop2, path, result, line, column) => {
        const name = path[0];
        if (is_bound_or_unset(props, name) || !parent) {
          return result;
        }
        let value = props;
        for (let i = 0; i < path.length - 1; i++) {
          value = value[path[i]];
          if (!(value == null ? void 0 : value[STATE_SYMBOL])) {
            return result;
          }
        }
        const location2 = sanitize_location(`${component2[FILENAME]}:${line}:${column}`);
        ownership_invalid_mutation(name, location2, prop2, parent[FILENAME]);
        return result;
      },
      /**
       * @param {any} key
       * @param {any} child_component
       * @param {() => any} value
       */
      binding: (key2, child_component, value) => {
        var _a3;
        if (!is_bound_or_unset(props, key2) && parent && ((_a3 = value()) == null ? void 0 : _a3[STATE_SYMBOL])) {
          ownership_invalid_binding(
            component2[FILENAME],
            key2,
            child_component[FILENAME],
            parent[FILENAME]
          );
        }
      }
    };
  }
  function is_bound_or_unset(props, prop_name) {
    var _a2;
    const is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;
    return !!((_a2 = get_descriptor(props, prop_name)) == null ? void 0 : _a2.set) || is_entry_props && prop_name in props || !(prop_name in props);
  }
  function check_target(target) {
    if (target) {
      component_api_invalid_new(target[FILENAME] ?? "a component", target.name);
    }
  }
  function legacy_api() {
    const component2 = component_context == null ? void 0 : component_context.function;
    function error(method) {
      component_api_changed(method, component2[FILENAME]);
    }
    return {
      $destroy: () => error("$destroy()"),
      $on: () => error("$on(...)"),
      $set: () => error("$set(...)")
    };
  }
  function inspect(get_value, inspector, show_stack = false) {
    validate_effect("$inspect");
    let initial = true;
    let error = (
      /** @type {any} */
      UNINITIALIZED
    );
    eager_effect(() => {
      try {
        var value = get_value();
      } catch (e) {
        error = e;
        return;
      }
      var snap = snapshot(value, true, true);
      untrack(() => {
        if (show_stack) {
          inspector(...snap);
          if (!initial) {
            const stack2 = get_error("$inspect(...)");
            if (stack2) {
              console.groupCollapsed("stack trace");
              console.log(stack2);
              console.groupEnd();
            }
          }
        } else {
          inspector(initial ? "init" : "update", ...snap);
        }
      });
      initial = false;
    });
    render_effect(() => {
      try {
        get_value();
      } catch {
      }
      if (error !== UNINITIALIZED) {
        console.error(error);
        error = UNINITIALIZED;
      }
    });
  }
  function async(node, blockers = [], expressions = [], fn) {
    var was_hydrating = hydrating;
    var end = null;
    if (was_hydrating) {
      hydrate_next();
      end = skip_nodes(false);
    }
    if (expressions.length === 0 && blockers.every((b) => b.settled)) {
      fn(node);
      if (was_hydrating) {
        set_hydrate_node(end);
      }
      return;
    }
    const decrement_pending = increment_pending();
    if (was_hydrating) {
      var previous_hydrate_node = hydrate_node;
      set_hydrate_node(end);
    }
    flatten(blockers, [], expressions, (values) => {
      if (was_hydrating) {
        set_hydrating(true);
        set_hydrate_node(previous_hydrate_node);
      }
      try {
        for (const d of values) get(d);
        fn(node, ...values);
      } finally {
        if (was_hydrating) {
          set_hydrating(false);
        }
        decrement_pending();
      }
    });
  }
  function validate_snippet_args(anchor, ...args) {
    if (typeof anchor !== "object" || !(anchor instanceof Node)) {
      invalid_snippet_arguments();
    }
    for (let arg of args) {
      if (typeof arg !== "function") {
        invalid_snippet_arguments();
      }
    }
  }
  class BranchManager {
    /**
     * @param {TemplateNode} anchor
     * @param {boolean} transition
     */
    constructor(anchor, transition2 = true) {
      /** @type {TemplateNode} */
      __publicField(this, "anchor");
      /** @type {Map<Batch, Key>} */
      __privateAdd(this, _batches, /* @__PURE__ */ new Map());
      /**
       * Map of keys to effects that are currently rendered in the DOM.
       * These effects are visible and actively part of the document tree.
       * Example:
       * ```
       * {#if condition}
       * 	foo
       * {:else}
       * 	bar
       * {/if}
       * ```
       * Can result in the entries `true->Effect` and `false->Effect`
       * @type {Map<Key, Effect>}
       */
      __privateAdd(this, _onscreen, /* @__PURE__ */ new Map());
      /**
       * Similar to #onscreen with respect to the keys, but contains branches that are not yet
       * in the DOM, because their insertion is deferred.
       * @type {Map<Key, Branch>}
       */
      __privateAdd(this, _offscreen, /* @__PURE__ */ new Map());
      /**
       * Keys of effects that are currently outroing
       * @type {Set<Key>}
       */
      __privateAdd(this, _outroing, /* @__PURE__ */ new Set());
      /**
       * Whether to pause (i.e. outro) on change, or destroy immediately.
       * This is necessary for `<svelte:element>`
       */
      __privateAdd(this, _transition, true);
      /**
       * @param {Batch} batch
       */
      __privateAdd(this, _commit, (batch) => {
        if (!__privateGet(this, _batches).has(batch)) return;
        var key2 = (
          /** @type {Key} */
          __privateGet(this, _batches).get(batch)
        );
        var onscreen = __privateGet(this, _onscreen).get(key2);
        if (onscreen) {
          resume_effect(onscreen);
          __privateGet(this, _outroing).delete(key2);
        } else {
          var offscreen = __privateGet(this, _offscreen).get(key2);
          if (offscreen) {
            __privateGet(this, _onscreen).set(key2, offscreen.effect);
            __privateGet(this, _offscreen).delete(key2);
            if (DEV) {
              offscreen.fragment.lastChild[HMR_ANCHOR] = this.anchor;
            }
            offscreen.fragment.lastChild.remove();
            this.anchor.before(offscreen.fragment);
            onscreen = offscreen.effect;
          }
        }
        for (const [b, k] of __privateGet(this, _batches)) {
          __privateGet(this, _batches).delete(b);
          if (b === batch) {
            break;
          }
          const offscreen2 = __privateGet(this, _offscreen).get(k);
          if (offscreen2) {
            destroy_effect(offscreen2.effect);
            __privateGet(this, _offscreen).delete(k);
          }
        }
        for (const [k, effect2] of __privateGet(this, _onscreen)) {
          if (k === key2 || __privateGet(this, _outroing).has(k)) continue;
          const on_destroy = () => {
            const keys = Array.from(__privateGet(this, _batches).values());
            if (keys.includes(k)) {
              var fragment = document.createDocumentFragment();
              move_effect(effect2, fragment);
              fragment.append(create_text());
              __privateGet(this, _offscreen).set(k, { effect: effect2, fragment });
            } else {
              destroy_effect(effect2);
            }
            __privateGet(this, _outroing).delete(k);
            __privateGet(this, _onscreen).delete(k);
          };
          if (__privateGet(this, _transition) || !onscreen) {
            __privateGet(this, _outroing).add(k);
            pause_effect(effect2, on_destroy, false);
          } else {
            on_destroy();
          }
        }
      });
      /**
       * @param {Batch} batch
       */
      __privateAdd(this, _discard, (batch) => {
        __privateGet(this, _batches).delete(batch);
        const keys = Array.from(__privateGet(this, _batches).values());
        for (const [k, branch2] of __privateGet(this, _offscreen)) {
          if (!keys.includes(k)) {
            destroy_effect(branch2.effect);
            __privateGet(this, _offscreen).delete(k);
          }
        }
      });
      this.anchor = anchor;
      __privateSet(this, _transition, transition2);
    }
    /**
     *
     * @param {any} key
     * @param {null | ((target: TemplateNode) => void)} fn
     */
    ensure(key2, fn) {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var defer = should_defer_append();
      if (fn && !__privateGet(this, _onscreen).has(key2) && !__privateGet(this, _offscreen).has(key2)) {
        if (defer) {
          var fragment = document.createDocumentFragment();
          var target = create_text();
          fragment.append(target);
          __privateGet(this, _offscreen).set(key2, {
            effect: branch(() => fn(target)),
            fragment
          });
        } else {
          __privateGet(this, _onscreen).set(
            key2,
            branch(() => fn(this.anchor))
          );
        }
      }
      __privateGet(this, _batches).set(batch, key2);
      if (defer) {
        for (const [k, effect2] of __privateGet(this, _onscreen)) {
          if (k === key2) {
            batch.unskip_effect(effect2);
          } else {
            batch.skip_effect(effect2);
          }
        }
        for (const [k, branch2] of __privateGet(this, _offscreen)) {
          if (k === key2) {
            batch.unskip_effect(branch2.effect);
          } else {
            batch.skip_effect(branch2.effect);
          }
        }
        batch.oncommit(__privateGet(this, _commit));
        batch.ondiscard(__privateGet(this, _discard));
      } else {
        if (hydrating) {
          this.anchor = hydrate_node;
        }
        __privateGet(this, _commit).call(this, batch);
      }
    }
  }
  _batches = new WeakMap();
  _onscreen = new WeakMap();
  _offscreen = new WeakMap();
  _outroing = new WeakMap();
  _transition = new WeakMap();
  _commit = new WeakMap();
  _discard = new WeakMap();
  const PENDING = 0;
  const THEN = 1;
  const CATCH = 2;
  function await_block(node, get_input, pending_fn, then_fn, catch_fn) {
    if (hydrating) {
      hydrate_next();
    }
    var runes = is_runes();
    var v = (
      /** @type {V} */
      UNINITIALIZED
    );
    var value = runes ? source(v) : /* @__PURE__ */ mutable_source(v, false, false);
    var error = runes ? source(v) : /* @__PURE__ */ mutable_source(v, false, false);
    var branches = new BranchManager(node);
    block(() => {
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      batch.deactivate();
      var input = get_input();
      batch.activate();
      var destroyed = false;
      let mismatch = hydrating && is_promise(input) === (node.data === HYDRATION_START_ELSE);
      if (mismatch) {
        set_hydrate_node(skip_nodes());
        set_hydrating(false);
      }
      if (is_promise(input)) {
        var restore = capture();
        var resolved = false;
        const resolve = (fn) => {
          if (destroyed) return;
          resolved = true;
          restore(false);
          Batch.ensure();
          if (hydrating) {
            set_hydrating(false);
          }
          try {
            fn();
          } finally {
            unset_context(false);
            if (!is_flushing_sync) flushSync();
          }
        };
        input.then(
          (v2) => {
            resolve(() => {
              internal_set(value, v2);
              branches.ensure(THEN, then_fn && ((target) => then_fn(target, value)));
            });
          },
          (e) => {
            resolve(() => {
              internal_set(error, e);
              branches.ensure(CATCH, catch_fn && ((target) => catch_fn(target, error)));
              if (!catch_fn) {
                throw error.v;
              }
            });
          }
        );
        if (hydrating) {
          branches.ensure(PENDING, pending_fn);
        } else {
          queue_micro_task(() => {
            if (!resolved) {
              resolve(() => {
                branches.ensure(PENDING, pending_fn);
              });
            }
          });
        }
      } else {
        internal_set(value, input);
        branches.ensure(THEN, then_fn && ((target) => then_fn(target, value)));
      }
      if (mismatch) {
        set_hydrating(true);
      }
      return () => {
        destroyed = true;
      };
    });
  }
  function if_block(node, fn, elseif = false) {
    var marker;
    if (hydrating) {
      marker = hydrate_node;
      hydrate_next();
    }
    var branches = new BranchManager(node);
    var flags2 = elseif ? EFFECT_TRANSPARENT : 0;
    function update_branch(key2, fn2) {
      if (hydrating) {
        var data = read_hydration_instruction(
          /** @type {TemplateNode} */
          marker
        );
        if (key2 !== parseInt(data.substring(1))) {
          var anchor = skip_nodes();
          set_hydrate_node(anchor);
          branches.anchor = anchor;
          set_hydrating(false);
          branches.ensure(key2, fn2);
          set_hydrating(true);
          return;
        }
      }
      branches.ensure(key2, fn2);
    }
    block(() => {
      var has_branch = false;
      fn((fn2, key2 = 0) => {
        has_branch = true;
        update_branch(key2, fn2);
      });
      if (!has_branch) {
        update_branch(-1, null);
      }
    }, flags2);
  }
  const NAN = Symbol("NaN");
  function key(node, get_key, render_fn2) {
    if (hydrating) {
      hydrate_next();
    }
    var branches = new BranchManager(node);
    var legacy = !is_runes();
    block(() => {
      var key2 = get_key();
      if (key2 !== key2) {
        key2 = /** @type {any} */
        NAN;
      }
      if (legacy && key2 !== null && typeof key2 === "object") {
        key2 = /** @type {V} */
        {};
      }
      branches.ensure(key2, render_fn2);
    });
  }
  function css_props(element2, get_styles) {
    if (hydrating) {
      set_hydrate_node(/* @__PURE__ */ get_first_child(element2));
    }
    render_effect(() => {
      var styles = get_styles();
      for (var key2 in styles) {
        var value = styles[key2];
        if (value) {
          element2.style.setProperty(key2, value);
        } else {
          element2.style.removeProperty(key2);
        }
      }
    });
  }
  function index(_, i) {
    return i;
  }
  function pause_effects(state2, to_destroy, controlled_anchor) {
    var transitions = [];
    var length = to_destroy.length;
    var group;
    var remaining = to_destroy.length;
    for (var i = 0; i < length; i++) {
      let effect2 = to_destroy[i];
      pause_effect(
        effect2,
        () => {
          if (group) {
            group.pending.delete(effect2);
            group.done.add(effect2);
            if (group.pending.size === 0) {
              var groups = (
                /** @type {Set<EachOutroGroup>} */
                state2.outrogroups
              );
              destroy_effects(state2, array_from(group.done));
              groups.delete(group);
              if (groups.size === 0) {
                state2.outrogroups = null;
              }
            }
          } else {
            remaining -= 1;
          }
        },
        false
      );
    }
    if (remaining === 0) {
      var fast_path = transitions.length === 0 && controlled_anchor !== null;
      if (fast_path) {
        var anchor = (
          /** @type {Element} */
          controlled_anchor
        );
        var parent_node = (
          /** @type {Element} */
          anchor.parentNode
        );
        clear_text_content(parent_node);
        parent_node.append(anchor);
        state2.items.clear();
      }
      destroy_effects(state2, to_destroy, !fast_path);
    } else {
      group = {
        pending: new Set(to_destroy),
        done: /* @__PURE__ */ new Set()
      };
      (state2.outrogroups ?? (state2.outrogroups = /* @__PURE__ */ new Set())).add(group);
    }
  }
  function destroy_effects(state2, to_destroy, remove_dom = true) {
    var preserved_effects;
    if (state2.pending.size > 0) {
      preserved_effects = /* @__PURE__ */ new Set();
      for (const keys of state2.pending.values()) {
        for (const key2 of keys) {
          preserved_effects.add(
            /** @type {EachItem} */
            state2.items.get(key2).e
          );
        }
      }
    }
    for (var i = 0; i < to_destroy.length; i++) {
      var e = to_destroy[i];
      if (preserved_effects == null ? void 0 : preserved_effects.has(e)) {
        e.f |= EFFECT_OFFSCREEN;
        const fragment = document.createDocumentFragment();
        move_effect(e, fragment);
      } else {
        destroy_effect(to_destroy[i], remove_dom);
      }
    }
  }
  var offscreen_anchor;
  function each(node, flags2, get_collection, get_key, render_fn2, fallback_fn = null) {
    var anchor = node;
    var items = /* @__PURE__ */ new Map();
    var is_controlled = (flags2 & EACH_IS_CONTROLLED) !== 0;
    if (is_controlled) {
      var parent_node = (
        /** @type {Element} */
        node
      );
      anchor = hydrating ? set_hydrate_node(/* @__PURE__ */ get_first_child(parent_node)) : parent_node.appendChild(create_text());
    }
    if (hydrating) {
      hydrate_next();
    }
    var fallback2 = null;
    var each_array = /* @__PURE__ */ derived_safe_equal(() => {
      var collection = get_collection();
      return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
    });
    if (DEV) {
      tag(each_array, "{#each ...}");
    }
    var array;
    var pending2 = /* @__PURE__ */ new Map();
    var first_run = true;
    function commit(batch) {
      if ((state2.effect.f & DESTROYED) !== 0) {
        return;
      }
      state2.pending.delete(batch);
      state2.fallback = fallback2;
      reconcile(state2, array, anchor, flags2, get_key);
      if (fallback2 !== null) {
        if (array.length === 0) {
          if ((fallback2.f & EFFECT_OFFSCREEN) === 0) {
            resume_effect(fallback2);
          } else {
            fallback2.f ^= EFFECT_OFFSCREEN;
            move(fallback2, null, anchor);
          }
        } else {
          pause_effect(fallback2, () => {
            fallback2 = null;
          });
        }
      }
    }
    function discard(batch) {
      state2.pending.delete(batch);
    }
    var effect2 = block(() => {
      array = /** @type {V[]} */
      get(each_array);
      var length = array.length;
      let mismatch = false;
      if (hydrating) {
        var is_else = read_hydration_instruction(anchor) === HYDRATION_START_ELSE;
        if (is_else !== (length === 0)) {
          anchor = skip_nodes();
          set_hydrate_node(anchor);
          set_hydrating(false);
          mismatch = true;
        }
      }
      var keys = /* @__PURE__ */ new Set();
      var batch = (
        /** @type {Batch} */
        current_batch
      );
      var defer = should_defer_append();
      for (var index2 = 0; index2 < length; index2 += 1) {
        if (hydrating && hydrate_node.nodeType === COMMENT_NODE && /** @type {Comment} */
        hydrate_node.data === HYDRATION_END) {
          anchor = /** @type {Comment} */
          hydrate_node;
          mismatch = true;
          set_hydrating(false);
        }
        var value = array[index2];
        var key2 = get_key(value, index2);
        if (DEV) {
          var key_again = get_key(value, index2);
          if (key2 !== key_again) {
            each_key_volatile(String(index2), String(key2), String(key_again));
          }
        }
        var item = first_run ? null : items.get(key2);
        if (item) {
          if (item.v) internal_set(item.v, value);
          if (item.i) internal_set(item.i, index2);
          if (defer) {
            batch.unskip_effect(item.e);
          }
        } else {
          item = create_item(
            items,
            first_run ? anchor : offscreen_anchor ?? (offscreen_anchor = create_text()),
            value,
            key2,
            index2,
            render_fn2,
            flags2,
            get_collection
          );
          if (!first_run) {
            item.e.f |= EFFECT_OFFSCREEN;
          }
          items.set(key2, item);
        }
        keys.add(key2);
      }
      if (length === 0 && fallback_fn && !fallback2) {
        if (first_run) {
          fallback2 = branch(() => fallback_fn(anchor));
        } else {
          fallback2 = branch(() => fallback_fn(offscreen_anchor ?? (offscreen_anchor = create_text())));
          fallback2.f |= EFFECT_OFFSCREEN;
        }
      }
      if (length > keys.size) {
        if (DEV) {
          validate_each_keys(array, get_key);
        } else {
          each_key_duplicate("", "", "");
        }
      }
      if (hydrating && length > 0) {
        set_hydrate_node(skip_nodes());
      }
      if (!first_run) {
        pending2.set(batch, keys);
        if (defer) {
          for (const [key3, item2] of items) {
            if (!keys.has(key3)) {
              batch.skip_effect(item2.e);
            }
          }
          batch.oncommit(commit);
          batch.ondiscard(discard);
        } else {
          commit(batch);
        }
      }
      if (mismatch) {
        set_hydrating(true);
      }
      get(each_array);
    });
    var state2 = { effect: effect2, flags: flags2, items, pending: pending2, outrogroups: null, fallback: fallback2 };
    first_run = false;
    if (hydrating) {
      anchor = hydrate_node;
    }
  }
  function skip_to_branch(effect2) {
    while (effect2 !== null && (effect2.f & BRANCH_EFFECT) === 0) {
      effect2 = effect2.next;
    }
    return effect2;
  }
  function reconcile(state2, array, anchor, flags2, get_key) {
    var _a2, _b2, _c2, _d, _e, _f, _g, _h, _i;
    var is_animated = (flags2 & EACH_IS_ANIMATED) !== 0;
    var length = array.length;
    var items = state2.items;
    var current = skip_to_branch(state2.effect.first);
    var seen;
    var prev = null;
    var to_animate;
    var matched = [];
    var stashed = [];
    var value;
    var key2;
    var effect2;
    var i;
    if (is_animated) {
      for (i = 0; i < length; i += 1) {
        value = array[i];
        key2 = get_key(value, i);
        effect2 = /** @type {EachItem} */
        items.get(key2).e;
        if ((effect2.f & EFFECT_OFFSCREEN) === 0) {
          (_b2 = (_a2 = effect2.nodes) == null ? void 0 : _a2.a) == null ? void 0 : _b2.measure();
          (to_animate ?? (to_animate = /* @__PURE__ */ new Set())).add(effect2);
        }
      }
    }
    for (i = 0; i < length; i += 1) {
      value = array[i];
      key2 = get_key(value, i);
      effect2 = /** @type {EachItem} */
      items.get(key2).e;
      if (state2.outrogroups !== null) {
        for (const group of state2.outrogroups) {
          group.pending.delete(effect2);
          group.done.delete(effect2);
        }
      }
      if ((effect2.f & INERT) !== 0) {
        resume_effect(effect2);
        if (is_animated) {
          (_d = (_c2 = effect2.nodes) == null ? void 0 : _c2.a) == null ? void 0 : _d.unfix();
          (to_animate ?? (to_animate = /* @__PURE__ */ new Set())).delete(effect2);
        }
      }
      if ((effect2.f & EFFECT_OFFSCREEN) !== 0) {
        effect2.f ^= EFFECT_OFFSCREEN;
        if (effect2 === current) {
          move(effect2, null, anchor);
        } else {
          var next2 = prev ? prev.next : current;
          if (effect2 === state2.effect.last) {
            state2.effect.last = effect2.prev;
          }
          if (effect2.prev) effect2.prev.next = effect2.next;
          if (effect2.next) effect2.next.prev = effect2.prev;
          link(state2, prev, effect2);
          link(state2, effect2, next2);
          move(effect2, next2, anchor);
          prev = effect2;
          matched = [];
          stashed = [];
          current = skip_to_branch(prev.next);
          continue;
        }
      }
      if (effect2 !== current) {
        if (seen !== void 0 && seen.has(effect2)) {
          if (matched.length < stashed.length) {
            var start = stashed[0];
            var j;
            prev = start.prev;
            var a = matched[0];
            var b = matched[matched.length - 1];
            for (j = 0; j < matched.length; j += 1) {
              move(matched[j], start, anchor);
            }
            for (j = 0; j < stashed.length; j += 1) {
              seen.delete(stashed[j]);
            }
            link(state2, a.prev, b.next);
            link(state2, prev, a);
            link(state2, b, start);
            current = start;
            prev = b;
            i -= 1;
            matched = [];
            stashed = [];
          } else {
            seen.delete(effect2);
            move(effect2, current, anchor);
            link(state2, effect2.prev, effect2.next);
            link(state2, effect2, prev === null ? state2.effect.first : prev.next);
            link(state2, prev, effect2);
            prev = effect2;
          }
          continue;
        }
        matched = [];
        stashed = [];
        while (current !== null && current !== effect2) {
          (seen ?? (seen = /* @__PURE__ */ new Set())).add(current);
          stashed.push(current);
          current = skip_to_branch(current.next);
        }
        if (current === null) {
          continue;
        }
      }
      if ((effect2.f & EFFECT_OFFSCREEN) === 0) {
        matched.push(effect2);
      }
      prev = effect2;
      current = skip_to_branch(effect2.next);
    }
    if (state2.outrogroups !== null) {
      for (const group of state2.outrogroups) {
        if (group.pending.size === 0) {
          destroy_effects(state2, array_from(group.done));
          (_e = state2.outrogroups) == null ? void 0 : _e.delete(group);
        }
      }
      if (state2.outrogroups.size === 0) {
        state2.outrogroups = null;
      }
    }
    if (current !== null || seen !== void 0) {
      var to_destroy = [];
      if (seen !== void 0) {
        for (effect2 of seen) {
          if ((effect2.f & INERT) === 0) {
            to_destroy.push(effect2);
          }
        }
      }
      while (current !== null) {
        if ((current.f & INERT) === 0 && current !== state2.fallback) {
          to_destroy.push(current);
        }
        current = skip_to_branch(current.next);
      }
      var destroy_length = to_destroy.length;
      if (destroy_length > 0) {
        var controlled_anchor = (flags2 & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;
        if (is_animated) {
          for (i = 0; i < destroy_length; i += 1) {
            (_g = (_f = to_destroy[i].nodes) == null ? void 0 : _f.a) == null ? void 0 : _g.measure();
          }
          for (i = 0; i < destroy_length; i += 1) {
            (_i = (_h = to_destroy[i].nodes) == null ? void 0 : _h.a) == null ? void 0 : _i.fix();
          }
        }
        pause_effects(state2, to_destroy, controlled_anchor);
      }
    }
    if (is_animated) {
      queue_micro_task(() => {
        var _a3, _b3;
        if (to_animate === void 0) return;
        for (effect2 of to_animate) {
          (_b3 = (_a3 = effect2.nodes) == null ? void 0 : _a3.a) == null ? void 0 : _b3.apply();
        }
      });
    }
  }
  function create_item(items, anchor, value, key2, index2, render_fn2, flags2, get_collection) {
    var v = (flags2 & EACH_ITEM_REACTIVE) !== 0 ? (flags2 & EACH_ITEM_IMMUTABLE) === 0 ? /* @__PURE__ */ mutable_source(value, false, false) : source(value) : null;
    var i = (flags2 & EACH_INDEX_REACTIVE) !== 0 ? source(index2) : null;
    if (DEV && v) {
      v.trace = () => {
        get_collection()[(i == null ? void 0 : i.v) ?? index2];
      };
    }
    return {
      v,
      i,
      e: branch(() => {
        render_fn2(anchor, v ?? value, i ?? index2, get_collection);
        return () => {
          items.delete(key2);
        };
      })
    };
  }
  function move(effect2, next2, anchor) {
    if (!effect2.nodes) return;
    var node = effect2.nodes.start;
    var end = effect2.nodes.end;
    var dest = next2 && (next2.f & EFFECT_OFFSCREEN) === 0 ? (
      /** @type {EffectNodes} */
      next2.nodes.start
    ) : anchor;
    while (node !== null) {
      var next_node = (
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_next_sibling(node)
      );
      dest.before(node);
      if (node === end) {
        return;
      }
      node = next_node;
    }
  }
  function link(state2, prev, next2) {
    if (prev === null) {
      state2.effect.first = next2;
    } else {
      prev.next = next2;
    }
    if (next2 === null) {
      state2.effect.last = prev;
    } else {
      next2.prev = prev;
    }
  }
  function validate_each_keys(array, key_fn) {
    const keys = /* @__PURE__ */ new Map();
    const length = array.length;
    for (let i = 0; i < length; i++) {
      const key2 = key_fn(array[i], i);
      if (keys.has(key2)) {
        const a = String(keys.get(key2));
        const b = String(i);
        let k = String(key2);
        if (k.startsWith("[object ")) k = null;
        each_key_duplicate(a, b, k);
      }
      keys.set(key2, i);
    }
  }
  function check_hash(element2, server_hash, value) {
    var _a2;
    if (!server_hash || server_hash === hash(String(value ?? ""))) return;
    let location2;
    const loc = (_a2 = element2.__svelte_meta) == null ? void 0 : _a2.loc;
    if (loc) {
      location2 = `near ${loc.file}:${loc.line}:${loc.column}`;
    } else if (dev_current_component_function == null ? void 0 : dev_current_component_function[FILENAME]) {
      location2 = `in ${dev_current_component_function[FILENAME]}`;
    }
    hydration_html_changed(sanitize_location(location2));
  }
  function html(node, get_value, is_controlled = false, svg = false, mathml = false, skip_warning = false) {
    var anchor = node;
    var value = "";
    if (is_controlled) {
      var parent_node = (
        /** @type {Element} */
        node
      );
      if (hydrating) {
        anchor = set_hydrate_node(/* @__PURE__ */ get_first_child(parent_node));
      }
    }
    template_effect(() => {
      var effect2 = (
        /** @type {Effect} */
        active_effect
      );
      if (value === (value = get_value() ?? "")) {
        if (hydrating) hydrate_next();
        return;
      }
      if (is_controlled && !hydrating) {
        effect2.nodes = null;
        parent_node.innerHTML = /** @type {string} */
        value;
        if (value !== "") {
          assign_nodes(
            /** @type {TemplateNode} */
            /* @__PURE__ */ get_first_child(parent_node),
            /** @type {TemplateNode} */
            parent_node.lastChild
          );
        }
        return;
      }
      if (effect2.nodes !== null) {
        remove_effect_dom(
          effect2.nodes.start,
          /** @type {TemplateNode} */
          effect2.nodes.end
        );
        effect2.nodes = null;
      }
      if (value === "") return;
      if (hydrating) {
        var hash2 = (
          /** @type {Comment} */
          hydrate_node.data
        );
        var next2 = hydrate_next();
        var last = next2;
        while (next2 !== null && (next2.nodeType !== COMMENT_NODE || /** @type {Comment} */
        next2.data !== "")) {
          last = next2;
          next2 = /* @__PURE__ */ get_next_sibling(next2);
        }
        if (next2 === null) {
          hydration_mismatch();
          throw HYDRATION_ERROR;
        }
        if (DEV && !skip_warning) {
          check_hash(
            /** @type {Element} */
            next2.parentNode,
            hash2,
            value
          );
        }
        assign_nodes(hydrate_node, last);
        anchor = set_hydrate_node(next2);
        return;
      }
      var ns = svg ? NAMESPACE_SVG : mathml ? NAMESPACE_MATHML : void 0;
      var wrapper = (
        /** @type {HTMLTemplateElement | SVGElement | MathMLElement} */
        create_element(svg ? "svg" : mathml ? "math" : "template", ns)
      );
      wrapper.innerHTML = /** @type {any} */
      value;
      var node2 = svg || mathml ? wrapper : (
        /** @type {HTMLTemplateElement} */
        wrapper.content
      );
      assign_nodes(
        /** @type {TemplateNode} */
        /* @__PURE__ */ get_first_child(node2),
        /** @type {TemplateNode} */
        node2.lastChild
      );
      if (svg || mathml) {
        while (/* @__PURE__ */ get_first_child(node2)) {
          anchor.before(
            /** @type {TemplateNode} */
            /* @__PURE__ */ get_first_child(node2)
          );
        }
      } else {
        anchor.before(node2);
      }
    });
  }
  function slot(anchor, $$props, name, slot_props, fallback_fn) {
    var _a2;
    if (hydrating) {
      hydrate_next();
    }
    var slot_fn = (_a2 = $$props.$$slots) == null ? void 0 : _a2[name];
    var is_interop = false;
    if (slot_fn === true) {
      slot_fn = $$props[name === "default" ? "children" : name];
      is_interop = true;
    }
    if (slot_fn === void 0) {
      if (fallback_fn !== null) {
        fallback_fn(anchor);
      }
    } else {
      slot_fn(anchor, is_interop ? () => slot_props : slot_props);
    }
  }
  function sanitize_slots(props) {
    const sanitized = {};
    if (props.children) sanitized.default = true;
    for (const key2 in props.$$slots) {
      sanitized[key2] = true;
    }
    return sanitized;
  }
  function validate_void_dynamic_element(tag_fn) {
    const tag2 = tag_fn();
    if (tag2 && is_void(tag2)) {
      dynamic_void_element_content(tag2);
    }
  }
  function validate_dynamic_element_tag(tag_fn) {
    const tag2 = tag_fn();
    const is_string = typeof tag2 === "string";
    if (tag2 && !is_string) {
      svelte_element_invalid_this_value();
    }
  }
  function validate_store(store, name) {
    if (store != null && typeof store.subscribe !== "function") {
      store_invalid_shape(name);
    }
  }
  function prevent_snippet_stringification(fn) {
    fn.toString = () => {
      snippet_without_render_tag();
      return "";
    };
    return fn;
  }
  function snippet(node, get_snippet, ...args) {
    var branches = new BranchManager(node);
    block(() => {
      const snippet2 = get_snippet() ?? null;
      if (DEV && snippet2 == null) {
        invalid_snippet();
      }
      branches.ensure(snippet2, snippet2 && ((anchor) => snippet2(anchor, ...args)));
    }, EFFECT_TRANSPARENT);
  }
  function wrap_snippet(component2, fn) {
    const snippet2 = (node, ...args) => {
      var previous_component_function = dev_current_component_function;
      set_dev_current_component_function(component2);
      try {
        return fn(node, ...args);
      } finally {
        set_dev_current_component_function(previous_component_function);
      }
    };
    prevent_snippet_stringification(snippet2);
    return snippet2;
  }
  function createRawSnippet(fn) {
    return (anchor, ...params) => {
      var _a2;
      var snippet2 = fn(...params);
      var element2;
      if (hydrating) {
        element2 = /** @type {Element} */
        hydrate_node;
        hydrate_next();
      } else {
        var html2 = snippet2.render().trim();
        var fragment = create_fragment_from_html(html2);
        element2 = /** @type {Element} */
        /* @__PURE__ */ get_first_child(fragment);
        if (DEV && (/* @__PURE__ */ get_next_sibling(element2) !== null || element2.nodeType !== ELEMENT_NODE)) {
          invalid_raw_snippet_render();
        }
        anchor.before(element2);
      }
      const result = (_a2 = snippet2.setup) == null ? void 0 : _a2.call(snippet2, element2);
      assign_nodes(element2, element2);
      if (typeof result === "function") {
        teardown(result);
      }
    };
  }
  function component(node, get_component, render_fn2) {
    var hydration_start_node;
    if (hydrating) {
      hydration_start_node = hydrate_node;
      hydrate_next();
    }
    var branches = new BranchManager(node);
    block(() => {
      var component2 = get_component() ?? null;
      if (hydrating) {
        var data = read_hydration_instruction(
          /** @type {TemplateNode} */
          hydration_start_node
        );
        var server_had_component = data === HYDRATION_START;
        var client_has_component = component2 !== null;
        if (server_had_component !== client_has_component) {
          var anchor = skip_nodes();
          set_hydrate_node(anchor);
          branches.anchor = anchor;
          set_hydrating(false);
          branches.ensure(component2, component2 && ((target) => render_fn2(target, component2)));
          set_hydrating(true);
          return;
        }
      }
      branches.ensure(component2, component2 && ((target) => render_fn2(target, component2)));
    }, EFFECT_TRANSPARENT);
  }
  const now = BROWSER ? () => performance.now() : () => Date.now();
  const raf = {
    // don't access requestAnimationFrame eagerly outside method
    // this allows basic testing of user code without JSDOM
    // bunder will eval and remove ternary when the user's app is built
    tick: (
      /** @param {any} _ */
      (_) => (BROWSER ? requestAnimationFrame : noop)(_)
    ),
    now: () => now(),
    tasks: /* @__PURE__ */ new Set()
  };
  function run_tasks() {
    const now2 = raf.now();
    raf.tasks.forEach((task) => {
      if (!task.c(now2)) {
        raf.tasks.delete(task);
        task.f();
      }
    });
    if (raf.tasks.size !== 0) {
      raf.tick(run_tasks);
    }
  }
  function loop(callback) {
    let task;
    if (raf.tasks.size === 0) {
      raf.tick(run_tasks);
    }
    return {
      promise: new Promise((fulfill) => {
        raf.tasks.add(task = { c: callback, f: fulfill });
      }),
      abort() {
        raf.tasks.delete(task);
      }
    };
  }
  function dispatch_event(element2, type) {
    without_reactive_context(() => {
      element2.dispatchEvent(new CustomEvent(type));
    });
  }
  function css_property_to_camelcase(style) {
    if (style === "float") return "cssFloat";
    if (style === "offset") return "cssOffset";
    if (style.startsWith("--")) return style;
    const parts = style.split("-");
    if (parts.length === 1) return parts[0];
    return parts[0] + parts.slice(1).map(
      /** @param {any} word */
      (word) => word[0].toUpperCase() + word.slice(1)
    ).join("");
  }
  function css_to_keyframe(css) {
    const keyframe = {};
    const parts = css.split(";");
    for (const part of parts) {
      const [property, value] = part.split(":");
      if (!property || value === void 0) break;
      const formatted_property = css_property_to_camelcase(property.trim());
      keyframe[formatted_property] = value.trim();
    }
    return keyframe;
  }
  const linear = (t) => t;
  let animation_effect_override = null;
  function set_animation_effect_override(v) {
    animation_effect_override = v;
  }
  function animation(element2, get_fn, get_params) {
    var effect2 = animation_effect_override ?? /** @type {Effect} */
    active_effect;
    var nodes = (
      /** @type {EffectNodes} */
      effect2.nodes
    );
    var from;
    var to;
    var animation2;
    var original_styles = null;
    nodes.a ?? (nodes.a = {
      element: element2,
      measure() {
        from = this.element.getBoundingClientRect();
      },
      apply() {
        animation2 == null ? void 0 : animation2.abort();
        to = this.element.getBoundingClientRect();
        if (from.left !== to.left || from.right !== to.right || from.top !== to.top || from.bottom !== to.bottom) {
          const options = get_fn()(this.element, { from, to }, get_params == null ? void 0 : get_params());
          animation2 = animate(this.element, options, void 0, 1, () => {
            animation2 == null ? void 0 : animation2.abort();
            animation2 = void 0;
          });
        }
      },
      fix() {
        if (element2.getAnimations().length) return;
        var { position, width, height } = getComputedStyle(element2);
        if (position !== "absolute" && position !== "fixed") {
          var style = (
            /** @type {HTMLElement | SVGElement} */
            element2.style
          );
          original_styles = {
            position: style.position,
            width: style.width,
            height: style.height,
            transform: style.transform
          };
          style.position = "absolute";
          style.width = width;
          style.height = height;
          var to2 = element2.getBoundingClientRect();
          if (from.left !== to2.left || from.top !== to2.top) {
            var transform = `translate(${from.left - to2.left}px, ${from.top - to2.top}px)`;
            style.transform = style.transform ? `${style.transform} ${transform}` : transform;
          }
        }
      },
      unfix() {
        if (original_styles) {
          var style = (
            /** @type {HTMLElement | SVGElement} */
            element2.style
          );
          style.position = original_styles.position;
          style.width = original_styles.width;
          style.height = original_styles.height;
          style.transform = original_styles.transform;
        }
      }
    });
    nodes.a.element = element2;
  }
  function transition(flags2, element2, get_fn, get_params) {
    var _a2;
    var is_intro = (flags2 & TRANSITION_IN) !== 0;
    var is_outro = (flags2 & TRANSITION_OUT) !== 0;
    var is_both = is_intro && is_outro;
    var is_global = (flags2 & TRANSITION_GLOBAL) !== 0;
    var direction = is_both ? "both" : is_intro ? "in" : "out";
    var current_options;
    var inert = element2.inert;
    var overflow = element2.style.overflow;
    var intro;
    var outro;
    function get_options() {
      return without_reactive_context(() => {
        return current_options ?? (current_options = get_fn()(element2, (get_params == null ? void 0 : get_params()) ?? /** @type {P} */
        {}, {
          direction
        }));
      });
    }
    var transition2 = {
      is_global,
      in() {
        var _a3;
        element2.inert = inert;
        if (!is_intro) {
          outro == null ? void 0 : outro.abort();
          (_a3 = outro == null ? void 0 : outro.reset) == null ? void 0 : _a3.call(outro);
          return;
        }
        if (!is_outro) {
          intro == null ? void 0 : intro.abort();
        }
        intro = animate(element2, get_options(), outro, 1, () => {
          dispatch_event(element2, "introend");
          intro == null ? void 0 : intro.abort();
          intro = current_options = void 0;
          element2.style.overflow = overflow;
        });
      },
      out(fn) {
        if (!is_outro) {
          fn == null ? void 0 : fn();
          current_options = void 0;
          return;
        }
        element2.inert = true;
        outro = animate(element2, get_options(), intro, 0, () => {
          dispatch_event(element2, "outroend");
          fn == null ? void 0 : fn();
        });
      },
      stop: () => {
        intro == null ? void 0 : intro.abort();
        outro == null ? void 0 : outro.abort();
      }
    };
    var e = (
      /** @type {Effect & { nodes: EffectNodes }} */
      active_effect
    );
    ((_a2 = e.nodes).t ?? (_a2.t = [])).push(transition2);
    if (is_intro && should_intro) {
      var run2 = is_global;
      if (!run2) {
        var block2 = (
          /** @type {Effect | null} */
          e.parent
        );
        while (block2 && (block2.f & EFFECT_TRANSPARENT) !== 0) {
          while (block2 = block2.parent) {
            if ((block2.f & BLOCK_EFFECT) !== 0) break;
          }
        }
        run2 = !block2 || (block2.f & REACTION_RAN) !== 0;
      }
      if (run2) {
        effect(() => {
          untrack(() => transition2.in());
        });
      }
    }
  }
  function animate(element2, options, counterpart, t2, on_finish) {
    var is_intro = t2 === 1;
    if (is_function(options)) {
      var a;
      var aborted2 = false;
      queue_micro_task(() => {
        if (aborted2) return;
        var o = options({ direction: is_intro ? "in" : "out" });
        a = animate(element2, o, counterpart, t2, on_finish);
      });
      return {
        abort: () => {
          aborted2 = true;
          a == null ? void 0 : a.abort();
        },
        deactivate: () => a.deactivate(),
        reset: () => a.reset(),
        t: () => a.t()
      };
    }
    counterpart == null ? void 0 : counterpart.deactivate();
    if (!(options == null ? void 0 : options.duration) && !(options == null ? void 0 : options.delay)) {
      dispatch_event(element2, is_intro ? "introstart" : "outrostart");
      on_finish();
      return {
        abort: noop,
        deactivate: noop,
        reset: noop,
        t: () => t2
      };
    }
    const { delay = 0, css, tick: tick2, easing = linear } = options;
    var keyframes = [];
    if (is_intro && counterpart === void 0) {
      if (tick2) {
        tick2(0, 1);
      }
      if (css) {
        var styles = css_to_keyframe(css(0, 1));
        keyframes.push(styles, styles);
      }
    }
    var get_t = () => 1 - t2;
    var animation2 = element2.animate(keyframes, { duration: delay, fill: "forwards" });
    animation2.onfinish = () => {
      animation2.cancel();
      dispatch_event(element2, is_intro ? "introstart" : "outrostart");
      var t1 = (counterpart == null ? void 0 : counterpart.t()) ?? 1 - t2;
      counterpart == null ? void 0 : counterpart.abort();
      var delta = t2 - t1;
      var duration = (
        /** @type {number} */
        options.duration * Math.abs(delta)
      );
      var keyframes2 = [];
      if (duration > 0) {
        var needs_overflow_hidden = false;
        if (css) {
          var n = Math.ceil(duration / (1e3 / 60));
          for (var i = 0; i <= n; i += 1) {
            var t = t1 + delta * easing(i / n);
            var styles2 = css_to_keyframe(css(t, 1 - t));
            keyframes2.push(styles2);
            needs_overflow_hidden || (needs_overflow_hidden = styles2.overflow === "hidden");
          }
        }
        if (needs_overflow_hidden) {
          element2.style.overflow = "hidden";
        }
        get_t = () => {
          var time = (
            /** @type {number} */
            /** @type {globalThis.Animation} */
            animation2.currentTime
          );
          return t1 + delta * easing(time / duration);
        };
        if (tick2) {
          loop(() => {
            if (animation2.playState !== "running") return false;
            var t3 = get_t();
            tick2(t3, 1 - t3);
            return true;
          });
        }
      }
      animation2 = element2.animate(keyframes2, { duration, fill: "forwards" });
      animation2.onfinish = () => {
        get_t = () => t2;
        tick2 == null ? void 0 : tick2(t2, 1 - t2);
        on_finish();
      };
    };
    return {
      abort: () => {
        if (animation2) {
          animation2.cancel();
          animation2.effect = null;
          animation2.onfinish = noop;
        }
      },
      deactivate: () => {
        on_finish = noop;
      },
      reset: () => {
        if (t2 === 0) {
          tick2 == null ? void 0 : tick2(1, 0);
        }
      },
      t: () => get_t()
    };
  }
  function element(node, get_tag, is_svg2, render_fn2, get_namespace, location2) {
    let was_hydrating = hydrating;
    if (hydrating) {
      hydrate_next();
    }
    var filename = DEV && location2 && (component_context == null ? void 0 : component_context.function[FILENAME]);
    var element2 = null;
    if (hydrating && hydrate_node.nodeType === ELEMENT_NODE) {
      element2 = /** @type {Element} */
      hydrate_node;
      hydrate_next();
    }
    var anchor = (
      /** @type {TemplateNode} */
      hydrating ? hydrate_node : node
    );
    var parent_effect = (
      /** @type {Effect} */
      active_effect
    );
    var branches = new BranchManager(anchor, false);
    block(() => {
      const next_tag = get_tag() || null;
      var ns = get_namespace ? get_namespace() : is_svg2 || next_tag === "svg" ? NAMESPACE_SVG : void 0;
      if (next_tag === null) {
        branches.ensure(null, null);
        set_should_intro(true);
        return;
      }
      branches.ensure(next_tag, (anchor2) => {
        if (next_tag) {
          element2 = hydrating ? (
            /** @type {Element} */
            element2
          ) : create_element(next_tag, ns);
          if (DEV && location2) {
            element2.__svelte_meta = {
              parent: dev_stack,
              loc: {
                file: filename,
                line: location2[0],
                column: location2[1]
              }
            };
          }
          assign_nodes(element2, element2);
          if (render_fn2) {
            if (hydrating && is_raw_text_element(next_tag)) {
              element2.append(document.createComment(""));
            }
            var child_anchor = hydrating ? /* @__PURE__ */ get_first_child(element2) : element2.appendChild(create_text());
            if (hydrating) {
              if (child_anchor === null) {
                set_hydrating(false);
              } else {
                set_hydrate_node(child_anchor);
              }
            }
            set_animation_effect_override(parent_effect);
            render_fn2(element2, child_anchor);
            set_animation_effect_override(null);
          }
          active_effect.nodes.end = element2;
          anchor2.before(element2);
        }
        if (hydrating) {
          set_hydrate_node(anchor2);
        }
      });
      set_should_intro(true);
      return () => {
        if (next_tag) {
          set_should_intro(false);
        }
      };
    }, EFFECT_TRANSPARENT);
    teardown(() => {
      set_should_intro(true);
    });
    if (was_hydrating) {
      set_hydrating(true);
      set_hydrate_node(anchor);
    }
  }
  function head(hash2, render_fn2) {
    let previous_hydrate_node = null;
    let was_hydrating = hydrating;
    var anchor;
    if (hydrating) {
      previous_hydrate_node = hydrate_node;
      var head_anchor = /* @__PURE__ */ get_first_child(document.head);
      while (head_anchor !== null && (head_anchor.nodeType !== COMMENT_NODE || /** @type {Comment} */
      head_anchor.data !== hash2)) {
        head_anchor = /* @__PURE__ */ get_next_sibling(head_anchor);
      }
      if (head_anchor === null) {
        set_hydrating(false);
      } else {
        var start = (
          /** @type {TemplateNode} */
          /* @__PURE__ */ get_next_sibling(head_anchor)
        );
        head_anchor.remove();
        set_hydrate_node(start);
      }
    }
    if (!hydrating) {
      anchor = document.head.appendChild(create_text());
    }
    try {
      block(() => render_fn2(anchor), HEAD_EFFECT | EFFECT_PRESERVED);
    } finally {
      if (was_hydrating) {
        set_hydrating(true);
        set_hydrate_node(
          /** @type {TemplateNode} */
          previous_hydrate_node
        );
      }
    }
  }
  function append_styles$1(anchor, css) {
    effect(() => {
      var root2 = anchor.getRootNode();
      var target = (
        /** @type {ShadowRoot} */
        root2.host ? (
          /** @type {ShadowRoot} */
          root2
        ) : (
          /** @type {Document} */
          root2.head ?? /** @type {Document} */
          root2.ownerDocument.head
        )
      );
      if (!target.querySelector("#" + css.hash)) {
        const style = create_element("style");
        style.id = css.hash;
        style.textContent = css.code;
        target.appendChild(style);
        if (DEV) {
          register_style(css.hash, style);
        }
      }
    });
  }
  function action(dom, action2, get_value) {
    effect(() => {
      var payload = untrack(() => action2(dom, get_value == null ? void 0 : get_value()) || {});
      if (get_value && (payload == null ? void 0 : payload.update)) {
        var inited = false;
        var prev = (
          /** @type {any} */
          {}
        );
        render_effect(() => {
          var value = get_value();
          deep_read_state(value);
          if (inited && safe_not_equal(prev, value)) {
            prev = value;
            payload.update(value);
          }
        });
        inited = true;
      }
      if (payload == null ? void 0 : payload.destroy) {
        return () => (
          /** @type {Function} */
          payload.destroy()
        );
      }
    });
  }
  function attach(node, get_fn) {
    var fn = void 0;
    var e;
    managed(() => {
      if (fn !== (fn = get_fn())) {
        if (e) {
          destroy_effect(e);
          e = null;
        }
        if (fn) {
          e = branch(() => {
            effect(() => (
              /** @type {(node: Element) => void} */
              fn(node)
            ));
          });
        }
      }
    });
  }
  const ATTR_REGEX = /[&"<]/g;
  const CONTENT_REGEX = /[&<]/g;
  function escape_html(value, is_attr) {
    const str = String(value ?? "");
    const pattern = is_attr ? ATTR_REGEX : CONTENT_REGEX;
    pattern.lastIndex = 0;
    let escaped = "";
    let last = 0;
    while (pattern.test(str)) {
      const i = pattern.lastIndex - 1;
      const ch = str[i];
      escaped += str.substring(last, i) + (ch === "&" ? "&amp;" : ch === '"' ? "&quot;" : "&lt;");
      last = i + 1;
    }
    return escaped + str.substring(last);
  }
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx$1() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }
  const replacements = {
    translate: /* @__PURE__ */ new Map([
      [true, "yes"],
      [false, "no"]
    ])
  };
  function attr(name, value, is_boolean = false) {
    if (name === "hidden" && value !== "until-found") {
      is_boolean = true;
    }
    if (value == null || !value && is_boolean) return "";
    const normalized = has_own_property.call(replacements, name) && replacements[name].get(value) || value;
    const assignment = is_boolean ? `=""` : `="${escape_html(normalized, true)}"`;
    return ` ${name}${assignment}`;
  }
  function clsx(value) {
    if (typeof value === "object") {
      return clsx$1(value);
    } else {
      return value ?? "";
    }
  }
  const whitespace = [..." 	\n\r\f \v\uFEFF"];
  function to_class(value, hash2, directives) {
    var classname = value == null ? "" : "" + value;
    if (hash2) {
      classname = classname ? classname + " " + hash2 : hash2;
    }
    if (directives) {
      for (var key2 of Object.keys(directives)) {
        if (directives[key2]) {
          classname = classname ? classname + " " + key2 : key2;
        } else if (classname.length) {
          var len = key2.length;
          var a = 0;
          while ((a = classname.indexOf(key2, a)) >= 0) {
            var b = a + len;
            if ((a === 0 || whitespace.includes(classname[a - 1])) && (b === classname.length || whitespace.includes(classname[b]))) {
              classname = (a === 0 ? "" : classname.substring(0, a)) + classname.substring(b + 1);
            } else {
              a = b;
            }
          }
        }
      }
    }
    return classname === "" ? null : classname;
  }
  function append_styles(styles, important = false) {
    var separator = important ? " !important;" : ";";
    var css = "";
    for (var key2 of Object.keys(styles)) {
      var value = styles[key2];
      if (value != null && value !== "") {
        css += " " + key2 + ": " + value + separator;
      }
    }
    return css;
  }
  function to_css_name(name) {
    if (name[0] !== "-" || name[1] !== "-") {
      return name.toLowerCase();
    }
    return name;
  }
  function to_style(value, styles) {
    if (styles) {
      var new_style = "";
      var normal_styles;
      var important_styles;
      if (Array.isArray(styles)) {
        normal_styles = styles[0];
        important_styles = styles[1];
      } else {
        normal_styles = styles;
      }
      if (value) {
        value = String(value).replaceAll(/\s*\/\*.*?\*\/\s*/g, "").trim();
        var in_str = false;
        var in_apo = 0;
        var in_comment = false;
        var reserved_names = [];
        if (normal_styles) {
          reserved_names.push(...Object.keys(normal_styles).map(to_css_name));
        }
        if (important_styles) {
          reserved_names.push(...Object.keys(important_styles).map(to_css_name));
        }
        var start_index = 0;
        var name_index = -1;
        const len = value.length;
        for (var i = 0; i < len; i++) {
          var c = value[i];
          if (in_comment) {
            if (c === "/" && value[i - 1] === "*") {
              in_comment = false;
            }
          } else if (in_str) {
            if (in_str === c) {
              in_str = false;
            }
          } else if (c === "/" && value[i + 1] === "*") {
            in_comment = true;
          } else if (c === '"' || c === "'") {
            in_str = c;
          } else if (c === "(") {
            in_apo++;
          } else if (c === ")") {
            in_apo--;
          }
          if (!in_comment && in_str === false && in_apo === 0) {
            if (c === ":" && name_index === -1) {
              name_index = i;
            } else if (c === ";" || i === len - 1) {
              if (name_index !== -1) {
                var name = to_css_name(value.substring(start_index, name_index).trim());
                if (!reserved_names.includes(name)) {
                  if (c !== ";") {
                    i++;
                  }
                  var property = value.substring(start_index, i).trim();
                  new_style += " " + property + ";";
                }
              }
              start_index = i + 1;
              name_index = -1;
            }
          }
        }
      }
      if (normal_styles) {
        new_style += append_styles(normal_styles);
      }
      if (important_styles) {
        new_style += append_styles(important_styles, true);
      }
      new_style = new_style.trim();
      return new_style === "" ? null : new_style;
    }
    return value == null ? null : String(value);
  }
  function set_class(dom, is_html, value, hash2, prev_classes, next_classes) {
    var prev = dom.__className;
    if (hydrating || prev !== value || prev === void 0) {
      var next_class_name = to_class(value, hash2, next_classes);
      if (!hydrating || next_class_name !== dom.getAttribute("class")) {
        if (next_class_name == null) {
          dom.removeAttribute("class");
        } else if (is_html) {
          dom.className = next_class_name;
        } else {
          dom.setAttribute("class", next_class_name);
        }
      }
      dom.__className = value;
    } else if (next_classes && prev_classes !== next_classes) {
      for (var key2 in next_classes) {
        var is_present = !!next_classes[key2];
        if (prev_classes == null || is_present !== !!prev_classes[key2]) {
          dom.classList.toggle(key2, is_present);
        }
      }
    }
    return next_classes;
  }
  function update_styles(dom, prev = {}, next2, priority) {
    for (var key2 in next2) {
      var value = next2[key2];
      if (prev[key2] !== value) {
        if (next2[key2] == null) {
          dom.style.removeProperty(key2);
        } else {
          dom.style.setProperty(key2, value, priority);
        }
      }
    }
  }
  function set_style(dom, value, prev_styles, next_styles) {
    var prev = dom.__style;
    if (hydrating || prev !== value) {
      var next_style_attr = to_style(value, next_styles);
      if (!hydrating || next_style_attr !== dom.getAttribute("style")) {
        if (next_style_attr == null) {
          dom.removeAttribute("style");
        } else {
          dom.style.cssText = next_style_attr;
        }
      }
      dom.__style = value;
    } else if (next_styles) {
      if (Array.isArray(next_styles)) {
        update_styles(dom, prev_styles == null ? void 0 : prev_styles[0], next_styles[0]);
        update_styles(dom, prev_styles == null ? void 0 : prev_styles[1], next_styles[1], "important");
      } else {
        update_styles(dom, prev_styles, next_styles);
      }
    }
    return next_styles;
  }
  function select_option(select, value, mounting = false) {
    if (select.multiple) {
      if (value == void 0) {
        return;
      }
      if (!is_array(value)) {
        return select_multiple_invalid_value();
      }
      for (var option of select.options) {
        option.selected = value.includes(get_option_value(option));
      }
      return;
    }
    for (option of select.options) {
      var option_value = get_option_value(option);
      if (is(option_value, value)) {
        option.selected = true;
        return;
      }
    }
    if (!mounting || value !== void 0) {
      select.selectedIndex = -1;
    }
  }
  function init_select(select) {
    var observer = new MutationObserver(() => {
      select_option(select, select.__value);
    });
    observer.observe(select, {
      // Listen to option element changes
      childList: true,
      subtree: true,
      // because of <optgroup>
      // Listen to option element value attribute changes
      // (doesn't get notified of select value changes,
      // because that property is not reflected as an attribute)
      attributes: true,
      attributeFilter: ["value"]
    });
    teardown(() => {
      observer.disconnect();
    });
  }
  function bind_select_value(select, get2, set2 = get2) {
    var batches2 = /* @__PURE__ */ new WeakSet();
    var mounting = true;
    listen_to_event_and_reset_event(select, "change", (is_reset) => {
      var query = is_reset ? "[selected]" : ":checked";
      var value;
      if (select.multiple) {
        value = [].map.call(select.querySelectorAll(query), get_option_value);
      } else {
        var selected_option = select.querySelector(query) ?? // will fall back to first non-disabled option if no option is selected
        select.querySelector("option:not([disabled])");
        value = selected_option && get_option_value(selected_option);
      }
      set2(value);
      select.__value = value;
      if (current_batch !== null) {
        batches2.add(current_batch);
      }
    });
    effect(() => {
      var value = get2();
      if (select === document.activeElement) {
        var batch = (
          /** @type {Batch} */
          async_mode_flag ? previous_batch : current_batch
        );
        if (batches2.has(batch)) {
          return;
        }
      }
      select_option(select, value, mounting);
      if (mounting && value === void 0) {
        var selected_option = select.querySelector(":checked");
        if (selected_option !== null) {
          value = get_option_value(selected_option);
          set2(value);
        }
      }
      select.__value = value;
      mounting = false;
    });
    init_select(select);
  }
  function get_option_value(option) {
    if ("__value" in option) {
      return option.__value;
    } else {
      return option.value;
    }
  }
  const CLASS = Symbol("class");
  const STYLE = Symbol("style");
  const IS_CUSTOM_ELEMENT = Symbol("is custom element");
  const IS_HTML = Symbol("is html");
  const LINK_TAG = IS_XHTML ? "link" : "LINK";
  const INPUT_TAG = IS_XHTML ? "input" : "INPUT";
  const OPTION_TAG = IS_XHTML ? "option" : "OPTION";
  const SELECT_TAG = IS_XHTML ? "select" : "SELECT";
  const PROGRESS_TAG = IS_XHTML ? "progress" : "PROGRESS";
  function remove_input_defaults(input) {
    if (!hydrating) return;
    var already_removed = false;
    var remove_defaults = () => {
      if (already_removed) return;
      already_removed = true;
      if (input.hasAttribute("value")) {
        var value = input.value;
        set_attribute(input, "value", null);
        input.value = value;
      }
      if (input.hasAttribute("checked")) {
        var checked = input.checked;
        set_attribute(input, "checked", null);
        input.checked = checked;
      }
    };
    input.__on_r = remove_defaults;
    queue_micro_task(remove_defaults);
    add_form_reset_listener();
  }
  function set_value(element2, value) {
    var attributes = get_attributes(element2);
    if (attributes.value === (attributes.value = // treat null and undefined the same for the initial value
    value ?? void 0) || // @ts-expect-error
    // `progress` elements always need their value set when it's `0`
    element2.value === value && (value !== 0 || element2.nodeName !== PROGRESS_TAG)) {
      return;
    }
    element2.value = value ?? "";
  }
  function set_checked(element2, checked) {
    var attributes = get_attributes(element2);
    if (attributes.checked === (attributes.checked = // treat null and undefined the same for the initial value
    checked ?? void 0)) {
      return;
    }
    element2.checked = checked;
  }
  function set_selected(element2, selected) {
    if (selected) {
      if (!element2.hasAttribute("selected")) {
        element2.setAttribute("selected", "");
      }
    } else {
      element2.removeAttribute("selected");
    }
  }
  function set_default_checked(element2, checked) {
    const existing_value = element2.checked;
    element2.defaultChecked = checked;
    element2.checked = existing_value;
  }
  function set_default_value(element2, value) {
    const existing_value = element2.value;
    element2.defaultValue = value;
    element2.value = existing_value;
  }
  function set_attribute(element2, attribute, value, skip_warning) {
    var attributes = get_attributes(element2);
    if (hydrating) {
      attributes[attribute] = element2.getAttribute(attribute);
      if (attribute === "src" || attribute === "srcset" || attribute === "href" && element2.nodeName === LINK_TAG) {
        if (!skip_warning) {
          check_src_in_dev_hydration(element2, attribute, value ?? "");
        }
        return;
      }
    }
    if (attributes[attribute] === (attributes[attribute] = value)) return;
    if (attribute === "loading") {
      element2[LOADING_ATTR_SYMBOL] = value;
    }
    if (value == null) {
      element2.removeAttribute(attribute);
    } else if (typeof value !== "string" && get_setters(element2).includes(attribute)) {
      element2[attribute] = value;
    } else {
      element2.setAttribute(attribute, value);
    }
  }
  function set_xlink_attribute(dom, attribute, value) {
    dom.setAttributeNS("http://www.w3.org/1999/xlink", attribute, value);
  }
  function set_custom_element_data(node, prop2, value) {
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    let was_hydrating = hydrating;
    if (hydrating) {
      set_hydrating(false);
    }
    set_active_reaction(null);
    set_active_effect(null);
    try {
      if (
        // `style` should use `set_attribute` rather than the setter
        prop2 !== "style" && // Don't compute setters for custom elements while they aren't registered yet,
        // because during their upgrade/instantiation they might add more setters.
        // Instead, fall back to a simple "an object, then set as property" heuristic.
        (setters_cache.has(node.getAttribute("is") || node.nodeName) || // customElements may not be available in browser extension contexts
        !customElements || customElements.get(node.getAttribute("is") || node.nodeName.toLowerCase()) ? get_setters(node).includes(prop2) : value && typeof value === "object")
      ) {
        node[prop2] = value;
      } else {
        set_attribute(node, prop2, value == null ? value : String(value));
      }
    } finally {
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
      if (was_hydrating) {
        set_hydrating(true);
      }
    }
  }
  function set_attributes(element2, prev, next2, css_hash, should_remove_defaults = false, skip_warning = false) {
    if (hydrating && should_remove_defaults && element2.nodeName === INPUT_TAG) {
      var input = (
        /** @type {HTMLInputElement} */
        element2
      );
      var attribute = input.type === "checkbox" ? "defaultChecked" : "defaultValue";
      if (!(attribute in next2)) {
        remove_input_defaults(input);
      }
    }
    var attributes = get_attributes(element2);
    var is_custom_element = attributes[IS_CUSTOM_ELEMENT];
    var preserve_attribute_case = !attributes[IS_HTML];
    let is_hydrating_custom_element = hydrating && is_custom_element;
    if (is_hydrating_custom_element) {
      set_hydrating(false);
    }
    var current = prev || {};
    var is_option_element = element2.nodeName === OPTION_TAG;
    for (var key2 in prev) {
      if (!(key2 in next2)) {
        next2[key2] = null;
      }
    }
    if (next2.class) {
      next2.class = clsx(next2.class);
    } else if (css_hash || next2[CLASS]) {
      next2.class = null;
    }
    if (next2[STYLE]) {
      next2.style ?? (next2.style = null);
    }
    var setters = get_setters(element2);
    for (const key3 in next2) {
      let value = next2[key3];
      if (is_option_element && key3 === "value" && value == null) {
        element2.value = element2.__value = "";
        current[key3] = value;
        continue;
      }
      if (key3 === "class") {
        var is_html = element2.namespaceURI === "http://www.w3.org/1999/xhtml";
        set_class(element2, is_html, value, css_hash, prev == null ? void 0 : prev[CLASS], next2[CLASS]);
        current[key3] = value;
        current[CLASS] = next2[CLASS];
        continue;
      }
      if (key3 === "style") {
        set_style(element2, value, prev == null ? void 0 : prev[STYLE], next2[STYLE]);
        current[key3] = value;
        current[STYLE] = next2[STYLE];
        continue;
      }
      var prev_value = current[key3];
      if (value === prev_value && !(value === void 0 && element2.hasAttribute(key3))) {
        continue;
      }
      current[key3] = value;
      var prefix = key3[0] + key3[1];
      if (prefix === "$$") continue;
      if (prefix === "on") {
        const opts = {};
        const event_handle_key = "$$" + key3;
        let event_name = key3.slice(2);
        var is_delegated = can_delegate_event(event_name);
        if (is_capture_event(event_name)) {
          event_name = event_name.slice(0, -7);
          opts.capture = true;
        }
        if (!is_delegated && prev_value) {
          if (value != null) continue;
          element2.removeEventListener(event_name, current[event_handle_key], opts);
          current[event_handle_key] = null;
        }
        if (is_delegated) {
          delegated(event_name, element2, value);
          delegate([event_name]);
        } else if (value != null) {
          let handle = function(evt) {
            current[key3].call(this, evt);
          };
          current[event_handle_key] = create_event(event_name, element2, handle, opts);
        }
      } else if (key3 === "style") {
        set_attribute(element2, key3, value);
      } else if (key3 === "autofocus") {
        autofocus(
          /** @type {HTMLElement} */
          element2,
          Boolean(value)
        );
      } else if (!is_custom_element && (key3 === "__value" || key3 === "value" && value != null)) {
        element2.value = element2.__value = value;
      } else if (key3 === "selected" && is_option_element) {
        set_selected(
          /** @type {HTMLOptionElement} */
          element2,
          value
        );
      } else {
        var name = key3;
        if (!preserve_attribute_case) {
          name = normalize_attribute(name);
        }
        var is_default = name === "defaultValue" || name === "defaultChecked";
        if (value == null && !is_custom_element && !is_default) {
          attributes[key3] = null;
          if (name === "value" || name === "checked") {
            let input2 = (
              /** @type {HTMLInputElement} */
              element2
            );
            const use_default = prev === void 0;
            if (name === "value") {
              let previous = input2.defaultValue;
              input2.removeAttribute(name);
              input2.defaultValue = previous;
              input2.value = input2.__value = use_default ? previous : null;
            } else {
              let previous = input2.defaultChecked;
              input2.removeAttribute(name);
              input2.defaultChecked = previous;
              input2.checked = use_default ? previous : false;
            }
          } else {
            element2.removeAttribute(key3);
          }
        } else if (is_default || setters.includes(name) && (is_custom_element || typeof value !== "string")) {
          element2[name] = value;
          if (name in attributes) attributes[name] = UNINITIALIZED;
        } else if (typeof value !== "function") {
          set_attribute(element2, name, value, skip_warning);
        }
      }
    }
    if (is_hydrating_custom_element) {
      set_hydrating(true);
    }
    return current;
  }
  function attribute_effect(element2, fn, sync = [], async2 = [], blockers = [], css_hash, should_remove_defaults = false, skip_warning = false) {
    flatten(blockers, sync, async2, (values) => {
      var prev = void 0;
      var effects = {};
      var is_select = element2.nodeName === SELECT_TAG;
      var inited = false;
      managed(() => {
        var next2 = fn(...values.map(get));
        var current = set_attributes(
          element2,
          prev,
          next2,
          css_hash,
          should_remove_defaults,
          skip_warning
        );
        if (inited && is_select && "value" in next2) {
          select_option(
            /** @type {HTMLSelectElement} */
            element2,
            next2.value
          );
        }
        for (let symbol of Object.getOwnPropertySymbols(effects)) {
          if (!next2[symbol]) destroy_effect(effects[symbol]);
        }
        for (let symbol of Object.getOwnPropertySymbols(next2)) {
          var n = next2[symbol];
          if (symbol.description === ATTACHMENT_KEY && (!prev || n !== prev[symbol])) {
            if (effects[symbol]) destroy_effect(effects[symbol]);
            effects[symbol] = branch(() => attach(element2, () => n));
          }
          current[symbol] = n;
        }
        prev = current;
      });
      if (is_select) {
        var select = (
          /** @type {HTMLSelectElement} */
          element2
        );
        effect(() => {
          select_option(
            select,
            /** @type {Record<string | symbol, any>} */
            prev.value,
            true
          );
          init_select(select);
        });
      }
      inited = true;
    });
  }
  function get_attributes(element2) {
    return (
      /** @type {Record<string | symbol, unknown>} **/
      // @ts-expect-error
      element2.__attributes ?? (element2.__attributes = {
        [IS_CUSTOM_ELEMENT]: element2.nodeName.includes("-"),
        [IS_HTML]: element2.namespaceURI === NAMESPACE_HTML
      })
    );
  }
  var setters_cache = /* @__PURE__ */ new Map();
  function get_setters(element2) {
    var cache_key = element2.getAttribute("is") || element2.nodeName;
    var setters = setters_cache.get(cache_key);
    if (setters) return setters;
    setters_cache.set(cache_key, setters = []);
    var descriptors;
    var proto = element2;
    var element_proto = Element.prototype;
    while (element_proto !== proto) {
      descriptors = get_descriptors(proto);
      for (var key2 in descriptors) {
        if (descriptors[key2].set) {
          setters.push(key2);
        }
      }
      proto = get_prototype_of(proto);
    }
    return setters;
  }
  function check_src_in_dev_hydration(element2, attribute, value) {
    if (!DEV) return;
    if (attribute === "srcset" && srcset_url_equal(element2, value)) return;
    if (src_url_equal(element2.getAttribute(attribute) ?? "", value)) return;
    hydration_attribute_changed(
      attribute,
      element2.outerHTML.replace(element2.innerHTML, element2.innerHTML && "..."),
      String(value)
    );
  }
  function src_url_equal(element_src, url) {
    if (element_src === url) return true;
    return new URL(element_src, document.baseURI).href === new URL(url, document.baseURI).href;
  }
  function split_srcset(srcset) {
    return srcset.split(",").map((src) => src.trim().split(" ").filter(Boolean));
  }
  function srcset_url_equal(element2, srcset) {
    var element_urls = split_srcset(element2.srcset);
    var urls = split_srcset(srcset);
    return urls.length === element_urls.length && urls.every(
      ([url, width], i) => width === element_urls[i][1] && // We need to test both ways because Vite will create an a full URL with
      // `new URL(asset, import.meta.url).href` for the client when `base: './'`, and the
      // relative URLs inside srcset are not automatically resolved to absolute URLs by
      // browsers (in contrast to img.src). This means both SSR and DOM code could
      // contain relative or absolute URLs.
      (src_url_equal(element_urls[i][0], url) || src_url_equal(url, element_urls[i][0]))
    );
  }
  let supported = null;
  function is_supported() {
    var _a2, _b2;
    if (supported === null) {
      var select = create_element("select");
      select.innerHTML = create_trusted_html("<option><span>t</span></option>");
      supported = /** @type {Element} */
      ((_b2 = (_a2 = select.firstChild) == null ? void 0 : _a2.firstChild) == null ? void 0 : _b2.nodeType) === 1;
    }
    return supported;
  }
  function selectedcontent(element2, update_element) {
    if (!is_supported()) return;
    attach(element2, () => () => {
      const select = element2.closest("select");
      if (!select) return;
      const observer = new MutationObserver((entries) => {
        var _a2, _b2;
        var selected = false;
        for (const entry of entries) {
          if (entry.target === element2) {
            return;
          }
          selected || (selected = !!((_b2 = (_a2 = entry.target.parentElement) == null ? void 0 : _a2.closest("option")) == null ? void 0 : _b2.selected));
        }
        if (selected) {
          element2.replaceWith(element2 = /** @type {HTMLElement} */
          element2.cloneNode(true));
          update_element(element2);
        }
      });
      observer.observe(select, {
        childList: true,
        characterData: true,
        subtree: true
      });
      return () => {
        observer.disconnect();
      };
    });
  }
  function customizable_select(element2, rich_fn) {
    var was_hydrating = hydrating;
    if (!is_supported()) {
      set_hydrating(false);
      element2.textContent = "";
      element2.append(create_comment(""));
    }
    try {
      rich_fn();
    } finally {
      if (was_hydrating) {
        if (hydrating) {
          reset(element2);
        } else {
          set_hydrating(true);
          set_hydrate_node(element2);
        }
      }
    }
  }
  function bind_active_element(update2) {
    listen(document, ["focusin", "focusout"], (event2) => {
      if (event2 && event2.type === "focusout" && /** @type {FocusEvent} */
      event2.relatedTarget) {
        return;
      }
      update2(document.activeElement);
    });
  }
  function bind_value(input, get2, set2 = get2) {
    var batches2 = /* @__PURE__ */ new WeakSet();
    listen_to_event_and_reset_event(input, "input", async (is_reset) => {
      if (DEV && input.type === "checkbox") {
        bind_invalid_checkbox_value();
      }
      var value = is_reset ? input.defaultValue : input.value;
      value = is_numberlike_input(input) ? to_number(value) : value;
      set2(value);
      if (current_batch !== null) {
        batches2.add(current_batch);
      }
      await tick();
      if (value !== (value = get2())) {
        var start = input.selectionStart;
        var end = input.selectionEnd;
        var length = input.value.length;
        input.value = value ?? "";
        if (end !== null) {
          var new_length = input.value.length;
          if (start === end && end === length && new_length > length) {
            input.selectionStart = new_length;
            input.selectionEnd = new_length;
          } else {
            input.selectionStart = start;
            input.selectionEnd = Math.min(end, new_length);
          }
        }
      }
    });
    if (
      // If we are hydrating and the value has since changed,
      // then use the updated value from the input instead.
      hydrating && input.defaultValue !== input.value || // If defaultValue is set, then value == defaultValue
      // TODO Svelte 6: remove input.value check and set to empty string?
      untrack(get2) == null && input.value
    ) {
      set2(is_numberlike_input(input) ? to_number(input.value) : input.value);
      if (current_batch !== null) {
        batches2.add(current_batch);
      }
    }
    render_effect(() => {
      if (DEV && input.type === "checkbox") {
        bind_invalid_checkbox_value();
      }
      var value = get2();
      if (input === document.activeElement) {
        var batch = (
          /** @type {Batch} */
          async_mode_flag ? previous_batch : current_batch
        );
        if (batches2.has(batch)) {
          return;
        }
      }
      if (is_numberlike_input(input) && value === to_number(input.value)) {
        return;
      }
      if (input.type === "date" && !value && !input.value) {
        return;
      }
      if (value !== input.value) {
        input.value = value ?? "";
      }
    });
  }
  const pending = /* @__PURE__ */ new Set();
  function bind_group(inputs, group_index, input, get2, set2 = get2) {
    var is_checkbox = input.getAttribute("type") === "checkbox";
    var binding_group = inputs;
    let hydration_mismatch2 = false;
    if (group_index !== null) {
      for (var index2 of group_index) {
        binding_group = binding_group[index2] ?? (binding_group[index2] = []);
      }
    }
    binding_group.push(input);
    listen_to_event_and_reset_event(
      input,
      "change",
      () => {
        var value = input.__value;
        if (is_checkbox) {
          value = get_binding_group_value(binding_group, value, input.checked);
        }
        set2(value);
      },
      // TODO better default value handling
      () => set2(is_checkbox ? [] : null)
    );
    render_effect(() => {
      var value = get2();
      if (hydrating && input.defaultChecked !== input.checked) {
        hydration_mismatch2 = true;
        return;
      }
      if (is_checkbox) {
        value = value || [];
        input.checked = value.includes(input.__value);
      } else {
        input.checked = is(input.__value, value);
      }
    });
    teardown(() => {
      var index3 = binding_group.indexOf(input);
      if (index3 !== -1) {
        binding_group.splice(index3, 1);
      }
    });
    if (!pending.has(binding_group)) {
      pending.add(binding_group);
      queue_micro_task(() => {
        binding_group.sort((a, b) => a.compareDocumentPosition(b) === 4 ? -1 : 1);
        pending.delete(binding_group);
      });
    }
    queue_micro_task(() => {
      if (hydration_mismatch2) {
        var value;
        if (is_checkbox) {
          value = get_binding_group_value(binding_group, value, input.checked);
        } else {
          var hydration_input = binding_group.find((input2) => input2.checked);
          value = hydration_input == null ? void 0 : hydration_input.__value;
        }
        set2(value);
      }
    });
  }
  function bind_checked(input, get2, set2 = get2) {
    listen_to_event_and_reset_event(input, "change", (is_reset) => {
      var value = is_reset ? input.defaultChecked : input.checked;
      set2(value);
    });
    if (
      // If we are hydrating and the value has since changed,
      // then use the update value from the input instead.
      hydrating && input.defaultChecked !== input.checked || // If defaultChecked is set, then checked == defaultChecked
      untrack(get2) == null
    ) {
      set2(input.checked);
    }
    render_effect(() => {
      var value = get2();
      input.checked = Boolean(value);
    });
  }
  function get_binding_group_value(group, __value, checked) {
    var value = /* @__PURE__ */ new Set();
    for (var i = 0; i < group.length; i += 1) {
      if (group[i].checked) {
        value.add(group[i].__value);
      }
    }
    if (!checked) {
      value.delete(__value);
    }
    return Array.from(value);
  }
  function is_numberlike_input(input) {
    var type = input.type;
    return type === "number" || type === "range";
  }
  function to_number(value) {
    return value === "" ? null : +value;
  }
  function bind_files(input, get2, set2 = get2) {
    listen_to_event_and_reset_event(input, "change", () => {
      set2(input.files);
    });
    if (
      // If we are hydrating and the value has since changed,
      // then use the updated value from the input instead.
      hydrating && input.files
    ) {
      set2(input.files);
    }
    render_effect(() => {
      input.files = get2();
    });
  }
  function time_ranges_to_array(ranges) {
    var array = [];
    for (var i = 0; i < ranges.length; i += 1) {
      array.push({ start: ranges.start(i), end: ranges.end(i) });
    }
    return array;
  }
  function bind_current_time(media, get2, set2 = get2) {
    var raf_id;
    var value;
    var callback = () => {
      cancelAnimationFrame(raf_id);
      if (!media.paused) {
        raf_id = requestAnimationFrame(callback);
      }
      var next_value = media.currentTime;
      if (value !== next_value) {
        set2(value = next_value);
      }
    };
    raf_id = requestAnimationFrame(callback);
    media.addEventListener("timeupdate", callback);
    render_effect(() => {
      var next_value = Number(get2());
      if (value !== next_value && !isNaN(
        /** @type {any} */
        next_value
      )) {
        media.currentTime = value = next_value;
      }
    });
    teardown(() => {
      cancelAnimationFrame(raf_id);
      media.removeEventListener("timeupdate", callback);
    });
  }
  function bind_buffered(media, set2) {
    var current;
    listen(media, ["loadedmetadata", "progress", "timeupdate", "seeking"], () => {
      var ranges = media.buffered;
      if (!current || current.length !== ranges.length || current.some((range, i) => ranges.start(i) !== range.start || ranges.end(i) !== range.end)) {
        current = time_ranges_to_array(ranges);
        set2(current);
      }
    });
  }
  function bind_seekable(media, set2) {
    listen(media, ["loadedmetadata"], () => set2(time_ranges_to_array(media.seekable)));
  }
  function bind_played(media, set2) {
    listen(media, ["timeupdate"], () => set2(time_ranges_to_array(media.played)));
  }
  function bind_seeking(media, set2) {
    listen(media, ["seeking", "seeked"], () => set2(media.seeking));
  }
  function bind_ended(media, set2) {
    listen(media, ["timeupdate", "ended"], () => set2(media.ended));
  }
  function bind_ready_state(media, set2) {
    listen(
      media,
      ["loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "emptied"],
      () => set2(media.readyState)
    );
  }
  function bind_playback_rate(media, get2, set2 = get2) {
    effect(() => {
      var value = Number(get2());
      if (value !== media.playbackRate && !isNaN(value)) {
        media.playbackRate = value;
      }
    });
    effect(() => {
      listen(media, ["ratechange"], () => {
        set2(media.playbackRate);
      });
    });
  }
  function bind_paused(media, get2, set2 = get2) {
    var paused = get2();
    var update2 = () => {
      if (paused !== media.paused) {
        set2(paused = media.paused);
      }
    };
    listen(media, ["play", "pause", "canplay"], update2, paused == null);
    effect(() => {
      if ((paused = !!get2()) !== media.paused) {
        if (paused) {
          media.pause();
        } else {
          media.play().catch((error) => {
            set2(paused = true);
            throw error;
          });
        }
      }
    });
  }
  function bind_volume(media, get2, set2 = get2) {
    var callback = () => {
      set2(media.volume);
    };
    if (get2() == null) {
      callback();
    }
    listen(media, ["volumechange"], callback, false);
    render_effect(() => {
      var value = Number(get2());
      if (value !== media.volume && !isNaN(value)) {
        media.volume = value;
      }
    });
  }
  function bind_muted(media, get2, set2 = get2) {
    var callback = () => {
      set2(media.muted);
    };
    if (get2() == null) {
      callback();
    }
    listen(media, ["volumechange"], callback, false);
    render_effect(() => {
      var value = !!get2();
      if (media.muted !== value) media.muted = value;
    });
  }
  function bind_online(update2) {
    listen(window, ["online", "offline"], () => {
      update2(navigator.onLine);
    });
  }
  function bind_prop(props, prop2, value) {
    var desc = get_descriptor(props, prop2);
    if (desc && desc.set) {
      props[prop2] = value;
      teardown(() => {
        props[prop2] = null;
      });
    }
  }
  const _ResizeObserverSingleton = class _ResizeObserverSingleton {
    /** @param {ResizeObserverOptions} options */
    constructor(options) {
      __privateAdd(this, _ResizeObserverSingleton_instances);
      /** */
      __privateAdd(this, _listeners, /* @__PURE__ */ new WeakMap());
      /** @type {ResizeObserver | undefined} */
      __privateAdd(this, _observer);
      /** @type {ResizeObserverOptions} */
      __privateAdd(this, _options);
      __privateSet(this, _options, options);
    }
    /**
     * @param {Element} element
     * @param {(entry: ResizeObserverEntry) => any} listener
     */
    observe(element2, listener) {
      var listeners2 = __privateGet(this, _listeners).get(element2) || /* @__PURE__ */ new Set();
      listeners2.add(listener);
      __privateGet(this, _listeners).set(element2, listeners2);
      __privateMethod(this, _ResizeObserverSingleton_instances, getObserver_fn).call(this).observe(element2, __privateGet(this, _options));
      return () => {
        var listeners3 = __privateGet(this, _listeners).get(element2);
        listeners3.delete(listener);
        if (listeners3.size === 0) {
          __privateGet(this, _listeners).delete(element2);
          __privateGet(this, _observer).unobserve(element2);
        }
      };
    }
  };
  _listeners = new WeakMap();
  _observer = new WeakMap();
  _options = new WeakMap();
  _ResizeObserverSingleton_instances = new WeakSet();
  getObserver_fn = function() {
    return __privateGet(this, _observer) ?? __privateSet(this, _observer, new ResizeObserver(
      /** @param {any} entries */
      (entries) => {
        for (var entry of entries) {
          _ResizeObserverSingleton.entries.set(entry.target, entry);
          for (var listener of __privateGet(this, _listeners).get(entry.target) || []) {
            listener(entry);
          }
        }
      }
    ));
  };
  /** @static */
  __publicField(_ResizeObserverSingleton, "entries", /* @__PURE__ */ new WeakMap());
  let ResizeObserverSingleton = _ResizeObserverSingleton;
  var resize_observer_content_box = /* @__PURE__ */ new ResizeObserverSingleton({
    box: "content-box"
  });
  var resize_observer_border_box = /* @__PURE__ */ new ResizeObserverSingleton({
    box: "border-box"
  });
  var resize_observer_device_pixel_content_box = /* @__PURE__ */ new ResizeObserverSingleton({
    box: "device-pixel-content-box"
  });
  function bind_resize_observer(element2, type, set2) {
    var observer = type === "contentRect" || type === "contentBoxSize" ? resize_observer_content_box : type === "borderBoxSize" ? resize_observer_border_box : resize_observer_device_pixel_content_box;
    var unsub = observer.observe(
      element2,
      /** @param {any} entry */
      (entry) => set2(entry[type])
    );
    teardown(unsub);
  }
  function bind_element_size(element2, type, set2) {
    var unsub = resize_observer_border_box.observe(element2, () => set2(element2[type]));
    effect(() => {
      untrack(() => set2(element2[type]));
      return unsub;
    });
  }
  function is_bound_this(bound_value, element_or_component) {
    return bound_value === element_or_component || (bound_value == null ? void 0 : bound_value[STATE_SYMBOL]) === element_or_component;
  }
  function bind_this(element_or_component = {}, update2, get_value, get_parts) {
    var component_effect = (
      /** @type {ComponentContext} */
      component_context.r
    );
    var parent = (
      /** @type {Effect} */
      active_effect
    );
    effect(() => {
      var old_parts;
      var parts;
      render_effect(() => {
        old_parts = parts;
        parts = (get_parts == null ? void 0 : get_parts()) || [];
        untrack(() => {
          if (element_or_component !== get_value(...parts)) {
            update2(element_or_component, ...parts);
            if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) {
              update2(null, ...old_parts);
            }
          }
        });
      });
      return () => {
        let p = parent;
        while (p !== component_effect && p.parent !== null && p.parent.f & DESTROYING) {
          p = p.parent;
        }
        const teardown2 = () => {
          if (parts && is_bound_this(get_value(...parts), element_or_component)) {
            update2(null, ...parts);
          }
        };
        const original_teardown = p.teardown;
        p.teardown = () => {
          teardown2();
          original_teardown == null ? void 0 : original_teardown();
        };
      };
    });
    return element_or_component;
  }
  function bind_content_editable(property, element2, get2, set2 = get2) {
    element2.addEventListener("input", () => {
      set2(element2[property]);
    });
    render_effect(() => {
      var value = get2();
      if (element2[property] !== value) {
        if (value == null) {
          var non_null_value = element2[property];
          set2(non_null_value);
        } else {
          element2[property] = value + "";
        }
      }
    });
  }
  function bind_property(property, event_name, element2, set2, get2) {
    var handler = () => {
      set2(element2[property]);
    };
    element2.addEventListener(event_name, handler);
    if (get2) {
      render_effect(() => {
        element2[property] = get2();
      });
    } else {
      handler();
    }
    if (element2 === document.body || element2 === window || element2 === document) {
      teardown(() => {
        element2.removeEventListener(event_name, handler);
      });
    }
  }
  function bind_focused(element2, set2) {
    listen(element2, ["focus", "blur"], () => {
      set2(element2 === document.activeElement);
    });
  }
  function bind_window_scroll(type, get2, set2 = get2) {
    var is_scrolling_x = type === "x";
    var target_handler = () => without_reactive_context(() => {
      scrolling = true;
      clearTimeout(timeout);
      timeout = setTimeout(clear2, 100);
      set2(window[is_scrolling_x ? "scrollX" : "scrollY"]);
    });
    addEventListener("scroll", target_handler, {
      passive: true
    });
    var scrolling = false;
    var timeout;
    var clear2 = () => {
      scrolling = false;
    };
    var first = true;
    render_effect(() => {
      var latest_value = get2();
      if (first) {
        first = false;
      } else if (!scrolling && latest_value != null) {
        scrolling = true;
        clearTimeout(timeout);
        if (is_scrolling_x) {
          scrollTo(latest_value, window.scrollY);
        } else {
          scrollTo(window.scrollX, latest_value);
        }
        timeout = setTimeout(clear2, 100);
      }
    });
    effect(target_handler);
    teardown(() => {
      removeEventListener("scroll", target_handler);
    });
  }
  function bind_window_size(type, set2) {
    listen(window, ["resize"], () => without_reactive_context(() => set2(window[type])));
  }
  function trusted(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      if (event2.isTrusted) {
        fn == null ? void 0 : fn.apply(this, args);
      }
    };
  }
  function self(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      if (event2.target === this) {
        fn == null ? void 0 : fn.apply(this, args);
      }
    };
  }
  function stopPropagation(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      event2.stopPropagation();
      return fn == null ? void 0 : fn.apply(this, args);
    };
  }
  function once(fn) {
    var ran = false;
    return function(...args) {
      if (ran) return;
      ran = true;
      return fn == null ? void 0 : fn.apply(this, args);
    };
  }
  function stopImmediatePropagation(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      event2.stopImmediatePropagation();
      return fn == null ? void 0 : fn.apply(this, args);
    };
  }
  function preventDefault(fn) {
    return function(...args) {
      var event2 = (
        /** @type {Event} */
        args[0]
      );
      event2.preventDefault();
      return fn == null ? void 0 : fn.apply(this, args);
    };
  }
  function passive(node, [event2, handler]) {
    user_pre_effect(() => {
      return on(node, event2, handler() ?? noop, {
        passive: true
      });
    });
  }
  function nonpassive(node, [event2, handler]) {
    user_pre_effect(() => {
      return on(node, event2, handler() ?? noop, {
        passive: false
      });
    });
  }
  function init$1(immutable = false) {
    const context = (
      /** @type {ComponentContextLegacy} */
      component_context
    );
    const callbacks = context.l.u;
    if (!callbacks) return;
    let props = () => deep_read_state(context.s);
    if (immutable) {
      let version = 0;
      let prev = (
        /** @type {Record<string, any>} */
        {}
      );
      const d = /* @__PURE__ */ derived(() => {
        let changed = false;
        const props2 = context.s;
        for (const key2 in props2) {
          if (props2[key2] !== prev[key2]) {
            prev[key2] = props2[key2];
            changed = true;
          }
        }
        if (changed) version++;
        return version;
      });
      props = () => get(d);
    }
    if (callbacks.b.length) {
      user_pre_effect(() => {
        observe_all(context, props);
        run_all(callbacks.b);
      });
    }
    user_effect(() => {
      const fns = untrack(() => callbacks.m.map(run$2));
      return () => {
        for (const fn of fns) {
          if (typeof fn === "function") {
            fn();
          }
        }
      };
    });
    if (callbacks.a.length) {
      user_effect(() => {
        observe_all(context, props);
        run_all(callbacks.a);
      });
    }
  }
  function observe_all(context, props) {
    if (context.l.s) {
      for (const signal of context.l.s) get(signal);
    }
    props();
  }
  function reactive_import(fn) {
    var s = source(0);
    return function() {
      if (arguments.length === 1) {
        set(s, get(s) + 1);
        return arguments[0];
      } else {
        get(s);
        return fn();
      }
    };
  }
  function bubble_event($$props, event2) {
    var _a2;
    var events = (
      /** @type {Record<string, Function[] | Function>} */
      (_a2 = $$props.$$events) == null ? void 0 : _a2[event2.type]
    );
    var callbacks = is_array(events) ? events.slice() : events == null ? [] : [events];
    for (var fn of callbacks) {
      fn.call(this, event2);
    }
  }
  function add_legacy_event_listener($$props, event_name, event_callback) {
    var _a2;
    $$props.$$events || ($$props.$$events = {});
    (_a2 = $$props.$$events)[event_name] || (_a2[event_name] = []);
    $$props.$$events[event_name].push(event_callback);
  }
  function update_legacy_props($$new_props) {
    for (var key2 in $$new_props) {
      if (key2 in this) {
        this[key2] = $$new_props[key2];
      }
    }
  }
  function update_prop(fn, d = 1) {
    const value = fn();
    fn(value + d);
    return value;
  }
  function update_pre_prop(fn, d = 1) {
    const value = fn() + d;
    fn(value);
    return value;
  }
  const rest_props_handler = {
    get(target, key2) {
      if (target.exclude.includes(key2)) return;
      return target.props[key2];
    },
    set(target, key2) {
      if (DEV) {
        props_rest_readonly(`${target.name}.${String(key2)}`);
      }
      return false;
    },
    getOwnPropertyDescriptor(target, key2) {
      if (target.exclude.includes(key2)) return;
      if (key2 in target.props) {
        return {
          enumerable: true,
          configurable: true,
          value: target.props[key2]
        };
      }
    },
    has(target, key2) {
      if (target.exclude.includes(key2)) return false;
      return key2 in target.props;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target.props).filter((key2) => !target.exclude.includes(key2));
    }
  };
  // @__NO_SIDE_EFFECTS__
  function rest_props(props, exclude, name) {
    return new Proxy(
      DEV ? { props, exclude, name, other: {}, to_proxy: [] } : { props, exclude },
      rest_props_handler
    );
  }
  const legacy_rest_props_handler = {
    get(target, key2) {
      if (target.exclude.includes(key2)) return;
      get(target.version);
      return key2 in target.special ? target.special[key2]() : target.props[key2];
    },
    set(target, key2, value) {
      if (!(key2 in target.special)) {
        var previous_effect = active_effect;
        try {
          set_active_effect(target.parent_effect);
          target.special[key2] = prop(
            {
              get [key2]() {
                return target.props[key2];
              }
            },
            /** @type {string} */
            key2,
            PROPS_IS_UPDATED
          );
        } finally {
          set_active_effect(previous_effect);
        }
      }
      target.special[key2](value);
      update(target.version);
      return true;
    },
    getOwnPropertyDescriptor(target, key2) {
      if (target.exclude.includes(key2)) return;
      if (key2 in target.props) {
        return {
          enumerable: true,
          configurable: true,
          value: target.props[key2]
        };
      }
    },
    deleteProperty(target, key2) {
      if (target.exclude.includes(key2)) return true;
      target.exclude.push(key2);
      update(target.version);
      return true;
    },
    has(target, key2) {
      if (target.exclude.includes(key2)) return false;
      return key2 in target.props;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target.props).filter((key2) => !target.exclude.includes(key2));
    }
  };
  function legacy_rest_props(props, exclude) {
    return new Proxy(
      {
        props,
        exclude,
        special: {},
        version: source(0),
        // TODO this is only necessary because we need to track component
        // destruction inside `prop`, because of `bind:this`, but it
        // seems likely that we can simplify `bind:this` instead
        parent_effect: (
          /** @type {Effect} */
          active_effect
        )
      },
      legacy_rest_props_handler
    );
  }
  const spread_props_handler = {
    get(target, key2) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        if (typeof p === "object" && p !== null && key2 in p) return p[key2];
      }
    },
    set(target, key2, value) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        const desc = get_descriptor(p, key2);
        if (desc && desc.set) {
          desc.set(value);
          return true;
        }
      }
      return false;
    },
    getOwnPropertyDescriptor(target, key2) {
      let i = target.props.length;
      while (i--) {
        let p = target.props[i];
        if (is_function(p)) p = p();
        if (typeof p === "object" && p !== null && key2 in p) {
          const descriptor = get_descriptor(p, key2);
          if (descriptor && !descriptor.configurable) {
            descriptor.configurable = true;
          }
          return descriptor;
        }
      }
    },
    has(target, key2) {
      if (key2 === STATE_SYMBOL || key2 === LEGACY_PROPS) return false;
      for (let p of target.props) {
        if (is_function(p)) p = p();
        if (p != null && key2 in p) return true;
      }
      return false;
    },
    ownKeys(target) {
      const keys = [];
      for (let p of target.props) {
        if (is_function(p)) p = p();
        if (!p) continue;
        for (const key2 in p) {
          if (!keys.includes(key2)) keys.push(key2);
        }
        for (const key2 of Object.getOwnPropertySymbols(p)) {
          if (!keys.includes(key2)) keys.push(key2);
        }
      }
      return keys;
    }
  };
  function spread_props(...props) {
    return new Proxy({ props }, spread_props_handler);
  }
  function prop(props, key2, flags2, fallback2) {
    var _a2;
    var runes = !legacy_mode_flag || (flags2 & PROPS_IS_RUNES) !== 0;
    var bindable = (flags2 & PROPS_IS_BINDABLE) !== 0;
    var lazy = (flags2 & PROPS_IS_LAZY_INITIAL) !== 0;
    var fallback_value = (
      /** @type {V} */
      fallback2
    );
    var fallback_dirty = true;
    var get_fallback = () => {
      if (fallback_dirty) {
        fallback_dirty = false;
        fallback_value = lazy ? untrack(
          /** @type {() => V} */
          fallback2
        ) : (
          /** @type {V} */
          fallback2
        );
      }
      return fallback_value;
    };
    let setter;
    if (bindable) {
      var is_entry_props = STATE_SYMBOL in props || LEGACY_PROPS in props;
      setter = ((_a2 = get_descriptor(props, key2)) == null ? void 0 : _a2.set) ?? (is_entry_props && key2 in props ? (v) => props[key2] = v : void 0);
    }
    var initial_value;
    var is_store_sub = false;
    if (bindable) {
      [initial_value, is_store_sub] = capture_store_binding(() => (
        /** @type {V} */
        props[key2]
      ));
    } else {
      initial_value = /** @type {V} */
      props[key2];
    }
    if (initial_value === void 0 && fallback2 !== void 0) {
      initial_value = get_fallback();
      if (setter) {
        if (runes) props_invalid_value(key2);
        setter(initial_value);
      }
    }
    var getter;
    if (runes) {
      getter = () => {
        var value = (
          /** @type {V} */
          props[key2]
        );
        if (value === void 0) return get_fallback();
        fallback_dirty = true;
        return value;
      };
    } else {
      getter = () => {
        var value = (
          /** @type {V} */
          props[key2]
        );
        if (value !== void 0) {
          fallback_value = /** @type {V} */
          void 0;
        }
        return value === void 0 ? fallback_value : value;
      };
    }
    if (runes && (flags2 & PROPS_IS_UPDATED) === 0) {
      return getter;
    }
    if (setter) {
      var legacy_parent = props.$$legacy;
      return (
        /** @type {() => V} */
        (function(value, mutation) {
          if (arguments.length > 0) {
            if (!runes || !mutation || legacy_parent || is_store_sub) {
              setter(mutation ? getter() : value);
            }
            return value;
          }
          return getter();
        })
      );
    }
    var overridden = false;
    var d = ((flags2 & PROPS_IS_IMMUTABLE) !== 0 ? derived : derived_safe_equal)(() => {
      overridden = false;
      return getter();
    });
    if (DEV) {
      d.label = key2;
    }
    if (bindable) get(d);
    var parent_effect = (
      /** @type {Effect} */
      active_effect
    );
    return (
      /** @type {() => V} */
      (function(value, mutation) {
        if (arguments.length > 0) {
          const new_value = mutation ? get(d) : runes && bindable ? proxy(value) : value;
          set(d, new_value);
          overridden = true;
          if (fallback_value !== void 0) {
            fallback_value = new_value;
          }
          return value;
        }
        if (is_destroying_effect && overridden || (parent_effect.f & DESTROYED) !== 0) {
          return d.v;
        }
        return get(d);
      })
    );
  }
  function validate_binding(binding, blockers, get_object, get_property, line, column) {
    run_after_blockers(blockers, () => {
      var warned = false;
      var filename = dev_current_component_function == null ? void 0 : dev_current_component_function[FILENAME];
      render_effect(() => {
        if (warned) return;
        var [object, is_store_sub] = capture_store_binding(get_object);
        if (is_store_sub) return;
        var property = get_property();
        var ran = false;
        var effect2 = render_effect(() => {
          if (ran) return;
          object[property];
        });
        ran = true;
        if (effect2.deps === null) {
          var location2 = `${filename}:${line}:${column}`;
          binding_property_non_reactive(binding, location2);
          warned = true;
        }
      });
    });
  }
  function createClassComponent(options) {
    return new Svelte4Component(options);
  }
  function asClassComponent(component2) {
    return class extends Svelte4Component {
      /** @param {any} options */
      constructor(options) {
        super({
          component: component2,
          ...options
        });
      }
    };
  }
  class Svelte4Component {
    /**
     * @param {ComponentConstructorOptions & {
     *  component: any;
     * }} options
     */
    constructor(options) {
      /** @type {any} */
      __privateAdd(this, _events);
      /** @type {Record<string, any>} */
      __privateAdd(this, _instance);
      var _a2;
      var sources = /* @__PURE__ */ new Map();
      var add_source = (key2, value) => {
        var s = /* @__PURE__ */ mutable_source(value, false, false);
        sources.set(key2, s);
        return s;
      };
      const props = new Proxy(
        { ...options.props || {}, $$events: {} },
        {
          get(target, prop2) {
            return get(sources.get(prop2) ?? add_source(prop2, Reflect.get(target, prop2)));
          },
          has(target, prop2) {
            if (prop2 === LEGACY_PROPS) return true;
            get(sources.get(prop2) ?? add_source(prop2, Reflect.get(target, prop2)));
            return Reflect.has(target, prop2);
          },
          set(target, prop2, value) {
            set(sources.get(prop2) ?? add_source(prop2, value), value);
            return Reflect.set(target, prop2, value);
          }
        }
      );
      __privateSet(this, _instance, (options.hydrate ? hydrate : mount)(options.component, {
        target: options.target,
        anchor: options.anchor,
        props,
        context: options.context,
        intro: options.intro ?? false,
        recover: options.recover,
        transformError: options.transformError
      }));
      if (!async_mode_flag && (!((_a2 = options == null ? void 0 : options.props) == null ? void 0 : _a2.$$host) || options.sync === false)) {
        flushSync();
      }
      __privateSet(this, _events, props.$$events);
      for (const key2 of Object.keys(__privateGet(this, _instance))) {
        if (key2 === "$set" || key2 === "$destroy" || key2 === "$on") continue;
        define_property(this, key2, {
          get() {
            return __privateGet(this, _instance)[key2];
          },
          /** @param {any} value */
          set(value) {
            __privateGet(this, _instance)[key2] = value;
          },
          enumerable: true
        });
      }
      __privateGet(this, _instance).$set = /** @param {Record<string, any>} next */
      (next2) => {
        Object.assign(props, next2);
      };
      __privateGet(this, _instance).$destroy = () => {
        unmount(__privateGet(this, _instance));
      };
    }
    /** @param {Record<string, any>} props */
    $set(props) {
      __privateGet(this, _instance).$set(props);
    }
    /**
     * @param {string} event
     * @param {(...args: any[]) => any} callback
     * @returns {any}
     */
    $on(event2, callback) {
      __privateGet(this, _events)[event2] = __privateGet(this, _events)[event2] || [];
      const cb = (...args) => callback.call(this, ...args);
      __privateGet(this, _events)[event2].push(cb);
      return () => {
        __privateGet(this, _events)[event2] = __privateGet(this, _events)[event2].filter(
          /** @param {any} fn */
          (fn) => fn !== cb
        );
      };
    }
    $destroy() {
      __privateGet(this, _instance).$destroy();
    }
  }
  _events = new WeakMap();
  _instance = new WeakMap();
  function run(fn) {
    user_pre_effect(() => {
      fn();
      var effect2 = (
        /** @type {import('#client').Effect} */
        active_effect
      );
      if ((effect2.f & DIRTY) !== 0) {
        let filename = "a file (we can't know which one)";
        if (DEV) {
          filename = (dev_current_component_function == null ? void 0 : dev_current_component_function[FILENAME]) ?? filename;
        }
        legacy_recursive_reactive_block(filename);
        set_signal_status(effect2, MAYBE_DIRTY);
      }
    });
  }
  function handlers(...handlers2) {
    return function(event2) {
      const { stopImmediatePropagation: stopImmediatePropagation2 } = event2;
      let stopped = false;
      event2.stopImmediatePropagation = () => {
        stopped = true;
        stopImmediatePropagation2.call(event2);
      };
      const errors = [];
      for (const handler of handlers2) {
        try {
          handler == null ? void 0 : handler.call(this, event2);
        } catch (e) {
          errors.push(e);
        }
        if (stopped) {
          break;
        }
      }
      for (let error of errors) {
        queueMicrotask(() => {
          throw error;
        });
      }
    };
  }
  function createBubbler() {
    const active_component_context = component_context;
    if (active_component_context === null) {
      lifecycle_outside_component("createBubbler");
    }
    return (type) => (event2) => {
      var _a2;
      const events = (
        /** @type {Record<string, Function | Function[]>} */
        (_a2 = active_component_context.s.$$events) == null ? void 0 : _a2[
          /** @type {any} */
          type
        ]
      );
      if (events) {
        const callbacks = is_array(events) ? events.slice() : [events];
        for (const fn of callbacks) {
          fn.call(active_component_context.x, event2);
        }
        return !event2.defaultPrevented;
      }
      return true;
    };
  }
  let SvelteElement;
  if (typeof HTMLElement === "function") {
    SvelteElement = class extends HTMLElement {
      /**
       * @param {*} $$componentCtor
       * @param {*} $$slots
       * @param {ShadowRootInit | undefined} shadow_root_init
       */
      constructor($$componentCtor, $$slots, shadow_root_init) {
        super();
        /** The Svelte component constructor */
        __publicField(this, "$$ctor");
        /** Slots */
        __publicField(this, "$$s");
        /** @type {any} The Svelte component instance */
        __publicField(this, "$$c");
        /** Whether or not the custom element is connected */
        __publicField(this, "$$cn", false);
        /** @type {Record<string, any>} Component props data */
        __publicField(this, "$$d", {});
        /** `true` if currently in the process of reflecting component props back to attributes */
        __publicField(this, "$$r", false);
        /** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
        __publicField(this, "$$p_d", {});
        /** @type {Record<string, EventListenerOrEventListenerObject[]>} Event listeners */
        __publicField(this, "$$l", {});
        /** @type {Map<EventListenerOrEventListenerObject, Function>} Event listener unsubscribe functions */
        __publicField(this, "$$l_u", /* @__PURE__ */ new Map());
        /** @type {any} The managed render effect for reflecting attributes */
        __publicField(this, "$$me");
        /** @type {ShadowRoot | null} The ShadowRoot of the custom element */
        __publicField(this, "$$shadowRoot", null);
        this.$$ctor = $$componentCtor;
        this.$$s = $$slots;
        if (shadow_root_init) {
          this.$$shadowRoot = this.attachShadow(shadow_root_init);
        }
      }
      /**
       * @param {string} type
       * @param {EventListenerOrEventListenerObject} listener
       * @param {boolean | AddEventListenerOptions} [options]
       */
      addEventListener(type, listener, options) {
        this.$$l[type] = this.$$l[type] || [];
        this.$$l[type].push(listener);
        if (this.$$c) {
          const unsub = this.$$c.$on(type, listener);
          this.$$l_u.set(listener, unsub);
        }
        super.addEventListener(type, listener, options);
      }
      /**
       * @param {string} type
       * @param {EventListenerOrEventListenerObject} listener
       * @param {boolean | AddEventListenerOptions} [options]
       */
      removeEventListener(type, listener, options) {
        super.removeEventListener(type, listener, options);
        if (this.$$c) {
          const unsub = this.$$l_u.get(listener);
          if (unsub) {
            unsub();
            this.$$l_u.delete(listener);
          }
        }
      }
      async connectedCallback() {
        this.$$cn = true;
        if (!this.$$c) {
          let create_slot = function(name) {
            return (anchor) => {
              const slot2 = create_element("slot");
              if (name !== "default") slot2.name = name;
              append(anchor, slot2);
            };
          };
          await Promise.resolve();
          if (!this.$$cn || this.$$c) {
            return;
          }
          const $$slots = {};
          const existing_slots = get_custom_elements_slots(this);
          for (const name of this.$$s) {
            if (name in existing_slots) {
              if (name === "default" && !this.$$d.children) {
                this.$$d.children = create_slot(name);
                $$slots.default = true;
              } else {
                $$slots[name] = create_slot(name);
              }
            }
          }
          for (const attribute of this.attributes) {
            const name = this.$$g_p(attribute.name);
            if (!(name in this.$$d)) {
              this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, "toProp");
            }
          }
          for (const key2 in this.$$p_d) {
            if (!(key2 in this.$$d) && this[key2] !== void 0) {
              this.$$d[key2] = this[key2];
              delete this[key2];
            }
          }
          this.$$c = createClassComponent({
            component: this.$$ctor,
            target: this.$$shadowRoot || this,
            props: {
              ...this.$$d,
              $$slots,
              $$host: this
            }
          });
          this.$$me = effect_root(() => {
            render_effect(() => {
              var _a2;
              this.$$r = true;
              for (const key2 of object_keys(this.$$c)) {
                if (!((_a2 = this.$$p_d[key2]) == null ? void 0 : _a2.reflect)) continue;
                this.$$d[key2] = this.$$c[key2];
                const attribute_value = get_custom_element_value(
                  key2,
                  this.$$d[key2],
                  this.$$p_d,
                  "toAttribute"
                );
                if (attribute_value == null) {
                  this.removeAttribute(this.$$p_d[key2].attribute || key2);
                } else {
                  this.setAttribute(this.$$p_d[key2].attribute || key2, attribute_value);
                }
              }
              this.$$r = false;
            });
          });
          for (const type in this.$$l) {
            for (const listener of this.$$l[type]) {
              const unsub = this.$$c.$on(type, listener);
              this.$$l_u.set(listener, unsub);
            }
          }
          this.$$l = {};
        }
      }
      // We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
      // and setting attributes through setAttribute etc, this is helpful
      /**
       * @param {string} attr
       * @param {string} _oldValue
       * @param {string} newValue
       */
      attributeChangedCallback(attr2, _oldValue, newValue) {
        var _a2;
        if (this.$$r) return;
        attr2 = this.$$g_p(attr2);
        this.$$d[attr2] = get_custom_element_value(attr2, newValue, this.$$p_d, "toProp");
        (_a2 = this.$$c) == null ? void 0 : _a2.$set({ [attr2]: this.$$d[attr2] });
      }
      disconnectedCallback() {
        this.$$cn = false;
        Promise.resolve().then(() => {
          if (!this.$$cn && this.$$c) {
            this.$$c.$destroy();
            this.$$me();
            this.$$c = void 0;
          }
        });
      }
      /**
       * @param {string} attribute_name
       */
      $$g_p(attribute_name) {
        return object_keys(this.$$p_d).find(
          (key2) => this.$$p_d[key2].attribute === attribute_name || !this.$$p_d[key2].attribute && key2.toLowerCase() === attribute_name
        ) || attribute_name;
      }
    };
  }
  function get_custom_element_value(prop2, value, props_definition, transform) {
    var _a2;
    const type = (_a2 = props_definition[prop2]) == null ? void 0 : _a2.type;
    value = type === "Boolean" && typeof value !== "boolean" ? value != null : value;
    if (!transform || !props_definition[prop2]) {
      return value;
    } else if (transform === "toAttribute") {
      switch (type) {
        case "Object":
        case "Array":
          return value == null ? null : JSON.stringify(value);
        case "Boolean":
          return value ? "" : null;
        case "Number":
          return value == null ? null : value;
        default:
          return value;
      }
    } else {
      switch (type) {
        case "Object":
        case "Array":
          return value && JSON.parse(value);
        case "Boolean":
          return value;
        // conversion already handled above
        case "Number":
          return value != null ? +value : value;
        default:
          return value;
      }
    }
  }
  function get_custom_elements_slots(element2) {
    const result = {};
    element2.childNodes.forEach((node) => {
      result[
        /** @type {Element} node */
        node.slot || "default"
      ] = true;
    });
    return result;
  }
  function create_custom_element(Component, props_definition, slots, exports$1, shadow_root_init, extend) {
    let Class = class extends SvelteElement {
      constructor() {
        super(Component, slots, shadow_root_init);
        this.$$p_d = props_definition;
      }
      static get observedAttributes() {
        return object_keys(props_definition).map(
          (key2) => (props_definition[key2].attribute || key2).toLowerCase()
        );
      }
    };
    object_keys(props_definition).forEach((prop2) => {
      define_property(Class.prototype, prop2, {
        get() {
          return this.$$c && prop2 in this.$$c ? this.$$c[prop2] : this.$$d[prop2];
        },
        set(value) {
          var _a2;
          value = get_custom_element_value(prop2, value, props_definition);
          this.$$d[prop2] = value;
          var component2 = this.$$c;
          if (component2) {
            var setter = (_a2 = get_descriptor(component2, prop2)) == null ? void 0 : _a2.get;
            if (setter) {
              component2[prop2] = value;
            } else {
              component2.$set({ [prop2]: value });
            }
          }
        }
      });
    });
    exports$1.forEach((property) => {
      define_property(Class.prototype, property, {
        get() {
          var _a2;
          return (_a2 = this.$$c) == null ? void 0 : _a2[property];
        }
      });
    });
    if (extend) {
      Class = extend(Class);
    }
    Component.element = /** @type {any} */
    Class;
    return Class;
  }
  function log_if_contains_state(method, ...objects) {
    untrack(() => {
      try {
        let has_state = false;
        const transformed = [];
        for (const obj of objects) {
          if (obj && typeof obj === "object" && STATE_SYMBOL in obj) {
            transformed.push(snapshot(obj, true));
            has_state = true;
          } else {
            transformed.push(obj);
          }
        }
        if (has_state) {
          console_log_state(method);
          console.log("%c[snapshot]", "color: grey", ...transformed);
        }
      } catch {
      }
    });
    return objects;
  }
  function hydratable(key2, fn) {
    var _a2;
    if (!async_mode_flag) {
      experimental_async_required("hydratable");
    }
    if (hydrating) {
      const store = (_a2 = window.__svelte) == null ? void 0 : _a2.h;
      if (store == null ? void 0 : store.has(key2)) {
        return (
          /** @type {T} */
          store.get(key2)
        );
      }
      if (DEV) {
        hydratable_missing_but_required(key2);
      } else {
        hydratable_missing_but_expected(key2);
      }
    }
    return fn();
  }
  if (DEV) {
    let throw_rune_error = function(rune) {
      if (!(rune in globalThis)) {
        let value;
        Object.defineProperty(globalThis, rune, {
          configurable: true,
          // eslint-disable-next-line getter-return
          get: () => {
            if (value !== void 0) {
              return value;
            }
            rune_outside_svelte(rune);
          },
          set: (v) => {
            value = v;
          }
        });
      }
    };
    throw_rune_error("$state");
    throw_rune_error("$effect");
    throw_rune_error("$derived");
    throw_rune_error("$inspect");
    throw_rune_error("$props");
    throw_rune_error("$bindable");
  }
  function getAbortSignal() {
    if (active_reaction === null) {
      get_abort_signal_outside_reaction();
    }
    return (active_reaction.ac ?? (active_reaction.ac = new AbortController())).signal;
  }
  function onMount(fn) {
    if (component_context === null) {
      lifecycle_outside_component("onMount");
    }
    if (legacy_mode_flag && component_context.l !== null) {
      init_update_callbacks(component_context).m.push(fn);
    } else {
      user_effect(() => {
        const cleanup = untrack(fn);
        if (typeof cleanup === "function") return (
          /** @type {() => void} */
          cleanup
        );
      });
    }
  }
  function onDestroy(fn) {
    if (component_context === null) {
      lifecycle_outside_component("onDestroy");
    }
    onMount(() => () => untrack(fn));
  }
  function create_custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    return new CustomEvent(type, { detail, bubbles, cancelable });
  }
  function createEventDispatcher() {
    const active_component_context = component_context;
    if (active_component_context === null) {
      lifecycle_outside_component("createEventDispatcher");
    }
    return (type, detail, options) => {
      var _a2;
      const events = (
        /** @type {Record<string, Function | Function[]>} */
        (_a2 = active_component_context.s.$$events) == null ? void 0 : _a2[
          /** @type {string} */
          type
        ]
      );
      if (events) {
        const callbacks = is_array(events) ? events.slice() : [events];
        const event2 = create_custom_event(
          /** @type {string} */
          type,
          detail,
          options
        );
        for (const fn of callbacks) {
          fn.call(active_component_context.x, event2);
        }
        return !event2.defaultPrevented;
      }
      return true;
    };
  }
  function beforeUpdate(fn) {
    if (component_context === null) {
      lifecycle_outside_component("beforeUpdate");
    }
    if (component_context.l === null) {
      lifecycle_legacy_only("beforeUpdate");
    }
    init_update_callbacks(component_context).b.push(fn);
  }
  function afterUpdate(fn) {
    if (component_context === null) {
      lifecycle_outside_component("afterUpdate");
    }
    if (component_context.l === null) {
      lifecycle_legacy_only("afterUpdate");
    }
    init_update_callbacks(component_context).a.push(fn);
  }
  function init_update_callbacks(context) {
    var l = (
      /** @type {ComponentContextLegacy} */
      context.l
    );
    return l.u ?? (l.u = { a: [], b: [], m: [] });
  }
  const VERSION = "5.55.3";
  const PUBLIC_VERSION = "5";
  if (typeof window !== "undefined") {
    ((_c = window.__svelte ?? (window.__svelte = {})).v ?? (_c.v = /* @__PURE__ */ new Set())).add(PUBLIC_VERSION);
  }
  var root$6 = /* @__PURE__ */ from_html(`<label class="bds-label" for="bds-system-prompt">Hidden System Prompt</label> <textarea id="bds-system-prompt" spellcheck="false"></textarea> <label class="bds-check"><input id="bds-auto-files" type="checkbox"/> Auto download create_file outputs</label> <label class="bds-check"><input id="bds-auto-zip" type="checkbox"/> Auto download LONG_WORK zip</label> <label class="bds-check"><input id="bds-auto-latex" type="checkbox"/> Auto download LATEX PDF outputs</label> <button id="bds-save-settings" type="button">Save Settings</button>`, 1);
  function SettingsPanel($$anchor, $$props) {
    push($$props, true);
    let systemPrompt = /* @__PURE__ */ state(proxy(state$1.settings.systemPrompt || ""));
    let autoFiles = /* @__PURE__ */ state(proxy(Boolean(state$1.settings.autoDownloadFiles)));
    let autoZip = /* @__PURE__ */ state(proxy(Boolean(state$1.settings.autoDownloadLongWorkZip)));
    let autoLatex = /* @__PURE__ */ state(proxy(Boolean(state$1.settings.autoDownloadLatexPdf)));
    function refresh() {
      set(systemPrompt, state$1.settings.systemPrompt || "", true);
      set(autoFiles, Boolean(state$1.settings.autoDownloadFiles), true);
      set(autoZip, Boolean(state$1.settings.autoDownloadLongWorkZip), true);
      set(autoLatex, Boolean(state$1.settings.autoDownloadLatexPdf), true);
    }
    async function save2() {
      state$1.settings.systemPrompt = get(systemPrompt).trim();
      state$1.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
      state$1.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
      state$1.settings.autoDownloadFiles = get(autoFiles);
      state$1.settings.autoDownloadLongWorkZip = get(autoZip);
      state$1.settings.autoDownloadLatexPdf = get(autoLatex);
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state$1.settings });
      pushConfigToPage();
      if (state$1.ui) {
        state$1.ui.showToast("Settings saved.");
      }
    }
    var $$exports = { refresh };
    var fragment = root$6();
    var textarea = sibling(first_child(fragment), 2);
    remove_textarea_child(textarea);
    var label2 = sibling(textarea, 2);
    var input = child(label2);
    remove_input_defaults(input);
    next();
    reset(label2);
    var label_1 = sibling(label2, 2);
    var input_1 = child(label_1);
    remove_input_defaults(input_1);
    next();
    reset(label_1);
    var label_2 = sibling(label_1, 2);
    var input_2 = child(label_2);
    remove_input_defaults(input_2);
    next();
    reset(label_2);
    var button = sibling(label_2, 2);
    bind_value(textarea, () => get(systemPrompt), ($$value) => set(systemPrompt, $$value));
    bind_checked(input, () => get(autoFiles), ($$value) => set(autoFiles, $$value));
    bind_checked(input_1, () => get(autoZip), ($$value) => set(autoZip, $$value));
    bind_checked(input_2, () => get(autoLatex), ($$value) => set(autoLatex, $$value));
    delegated("click", button, save2);
    append($$anchor, fragment);
    return pop($$exports);
  }
  delegate(["click"]);
  var root_1$2 = /* @__PURE__ */ from_html(`<p class="bds-empty">No skills loaded.</p>`);
  var root_3$1 = /* @__PURE__ */ from_html(`<div class="bds-skill-item"><label><input type="checkbox"/> <span> </span></label> <button type="button">Delete</button></div>`);
  var root$5 = /* @__PURE__ */ from_html(`<label class="bds-label" for="bds-skill-upload">Upload Skill (.md)</label> <input id="bds-skill-upload" type="file" accept=".md,text/markdown"/> <div id="bds-skill-list" class="bds-list"><!></div>`, 1);
  function SkillList($$anchor, $$props) {
    push($$props, true);
    let skills = /* @__PURE__ */ state(proxy([...state$1.skills]));
    function refresh() {
      set(skills, [...state$1.skills], true);
    }
    async function handleUpload(event2) {
      const file = event2.target.files && event2.target.files[0];
      if (!file) return;
      const content = await file.text();
      const name = file.name.replace(/\.md$/i, "") || `skill-${state$1.skills.length + 1}`;
      state$1.skills.push({ id: makeId(), name, content, active: true });
      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state$1.skills });
      set(skills, [...state$1.skills], true);
      pushConfigToPage();
      if (state$1.ui) {
        state$1.ui.showToast(`Skill loaded: ${name}`);
      }
      event2.target.value = "";
    }
    async function toggleSkill(skillId, checked) {
      const skill = state$1.skills.find((s) => s.id === skillId);
      if (!skill) return;
      skill.active = checked;
      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state$1.skills });
      set(skills, [...state$1.skills], true);
      pushConfigToPage();
    }
    async function deleteSkill(skillId) {
      const before = state$1.skills.length;
      state$1.skills = state$1.skills.filter((s) => s.id !== skillId);
      if (state$1.skills.length === before) return;
      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state$1.skills });
      set(skills, [...state$1.skills], true);
      pushConfigToPage();
      if (state$1.ui) {
        state$1.ui.showToast("Skill removed.");
      }
    }
    var $$exports = { refresh };
    var fragment = root$5();
    var input = sibling(first_child(fragment), 2);
    var div = sibling(input, 2);
    var node = child(div);
    {
      var consequent = ($$anchor2) => {
        var p = root_1$2();
        append($$anchor2, p);
      };
      var alternate = ($$anchor2) => {
        var fragment_1 = comment();
        var node_1 = first_child(fragment_1);
        each(node_1, 17, () => get(skills), (skill) => skill.id, ($$anchor3, skill) => {
          var div_1 = root_3$1();
          var label2 = child(div_1);
          var input_1 = child(label2);
          remove_input_defaults(input_1);
          var span = sibling(input_1, 2);
          var text2 = child(span, true);
          reset(span);
          reset(label2);
          var button = sibling(label2, 2);
          reset(div_1);
          template_effect(() => {
            set_checked(input_1, get(skill).active);
            set_text(text2, get(skill).name);
          });
          delegated("change", input_1, (e) => toggleSkill(get(skill).id, e.target.checked));
          delegated("click", button, () => deleteSkill(get(skill).id));
          append($$anchor3, div_1);
        });
        append($$anchor2, fragment_1);
      };
      if_block(node, ($$render) => {
        if (get(skills).length === 0) $$render(consequent);
        else $$render(alternate, -1);
      });
    }
    reset(div);
    delegated("change", input, handleUpload);
    append($$anchor, fragment);
    return pop($$exports);
  }
  delegate(["change", "click"]);
  var root_1$1 = /* @__PURE__ */ from_html(`<p class="bds-empty">No memory entries yet.</p>`);
  var root_3 = /* @__PURE__ */ from_html(`<div class="bds-memory-item"><strong> </strong> <span> </span> <em> </em></div>`);
  var root$4 = /* @__PURE__ */ from_html(`<h3 class="bds-subtitle">Stored Memory</h3> <div id="bds-memory-list" class="bds-list"><!></div>`, 1);
  function MemoryList($$anchor, $$props) {
    push($$props, true);
    let entries = /* @__PURE__ */ state(proxy(Object.entries(state$1.memories).sort((a, b) => a[0].localeCompare(b[0]))));
    function refresh() {
      set(entries, Object.entries(state$1.memories).sort((a, b) => a[0].localeCompare(b[0])), true);
    }
    var $$exports = { refresh };
    var fragment = root$4();
    var div = sibling(first_child(fragment), 2);
    var node = child(div);
    {
      var consequent = ($$anchor2) => {
        var p = root_1$1();
        append($$anchor2, p);
      };
      var alternate = ($$anchor2) => {
        var fragment_1 = comment();
        var node_1 = first_child(fragment_1);
        each(node_1, 17, () => get(entries), ([key2, item]) => key2, ($$anchor3, $$item) => {
          var $$array = /* @__PURE__ */ user_derived(() => to_array(get($$item), 2));
          let key2 = () => get($$array)[0];
          let item = () => get($$array)[1];
          var div_1 = root_3();
          var strong = child(div_1);
          var text2 = child(strong, true);
          reset(strong);
          var span = sibling(strong, 2);
          var text_1 = child(span, true);
          reset(span);
          var em = sibling(span, 2);
          var text_2 = child(em, true);
          reset(em);
          reset(div_1);
          template_effect(() => {
            set_text(text2, key2());
            set_text(text_1, item().value);
            set_text(text_2, item().importance);
          });
          append($$anchor3, div_1);
        });
        append($$anchor2, fragment_1);
      };
      if_block(node, ($$render) => {
        if (get(entries).length === 0) $$render(consequent);
        else $$render(alternate, -1);
      });
    }
    reset(div);
    append($$anchor, fragment);
    return pop($$exports);
  }
  var root$3 = /* @__PURE__ */ from_html(`<aside id="bds-drawer"><div class="bds-drawer-header"><h2>Better DeepSeek</h2> <button id="bds-close" type="button">Close</button></div> <!> <hr/> <!> <hr/> <!></aside>`);
  function Drawer($$anchor, $$props) {
    push($$props, true);
    let open = prop($$props, "open", 3, false);
    let settingsRef = /* @__PURE__ */ state(null);
    let skillsRef = /* @__PURE__ */ state(null);
    let memoryRef = /* @__PURE__ */ state(null);
    function refreshSettings() {
      if (get(settingsRef)) get(settingsRef).refresh();
    }
    function refreshSkills() {
      if (get(skillsRef)) get(skillsRef).refresh();
    }
    function refreshMemories() {
      if (get(memoryRef)) get(memoryRef).refresh();
    }
    var $$exports = { refreshSettings, refreshSkills, refreshMemories };
    var aside = root$3();
    var div = child(aside);
    var button = sibling(child(div), 2);
    reset(div);
    var node = sibling(div, 2);
    bind_this(SettingsPanel(node, {}), ($$value) => set(settingsRef, $$value, true), () => get(settingsRef));
    var node_1 = sibling(node, 4);
    bind_this(SkillList(node_1, {}), ($$value) => set(skillsRef, $$value, true), () => get(skillsRef));
    var node_2 = sibling(node_1, 4);
    bind_this(MemoryList(node_2, {}), ($$value) => set(memoryRef, $$value, true), () => get(memoryRef));
    reset(aside);
    template_effect(() => set_class(aside, 1, clsx(open() ? "bds-open" : "bds-closed")));
    delegated("click", button, function(...$$args) {
      var _a2;
      (_a2 = $$props.onclose) == null ? void 0 : _a2.apply(this, $$args);
    });
    append($$anchor, aside);
    return pop($$exports);
  }
  delegate(["click"]);
  var root$2 = /* @__PURE__ */ from_html(`<div id="bds-long-work-overlay"><div class="bds-loader-card"><strong>Working...</strong> <p>Thinking and building your output</p> <div class="bds-dots"><span></span><span></span><span></span></div></div></div>`);
  function LongWorkOverlay($$anchor, $$props) {
    let visible = prop($$props, "visible", 3, false);
    var div = root$2();
    template_effect(() => set_class(div, 1, clsx(visible() ? "bds-visible" : "bds-hidden")));
    append($$anchor, div);
  }
  var root_1 = /* @__PURE__ */ from_html(`<div class="bds-toast"> </div>`);
  var root$1 = /* @__PURE__ */ from_html(`<div id="bds-toast-stack"></div>`);
  function ToastStack($$anchor, $$props) {
    let toasts = prop($$props, "toasts", 19, () => []);
    var div = root$1();
    each(div, 21, toasts, (toast) => toast.id, ($$anchor2, toast) => {
      var div_1 = root_1();
      var text2 = child(div_1, true);
      reset(div_1);
      template_effect(() => set_text(text2, get(toast).message));
      append($$anchor2, div_1);
    });
    reset(div);
    append($$anchor, div);
  }
  var root = /* @__PURE__ */ from_html(`<button id="bds-toggle" type="button">BDS</button> <!> <!> <!>`, 1);
  function App($$anchor, $$props) {
    push($$props, true);
    let drawerOpen = /* @__PURE__ */ state(false);
    let overlayVisible = /* @__PURE__ */ state(false);
    let toasts = /* @__PURE__ */ state(proxy([]));
    let toastId = 0;
    function showLongWorkOverlay(show) {
      set(overlayVisible, show, true);
    }
    function showToast(message) {
      const id = ++toastId;
      set(toasts, [...get(toasts), { id, message }], true);
      setTimeout(
        () => {
          set(toasts, get(toasts).filter((t) => t.id !== id), true);
        },
        2880
      );
    }
    let drawerRef = /* @__PURE__ */ state(null);
    function refreshSettings() {
      if (get(drawerRef)) get(drawerRef).refreshSettings();
    }
    function refreshSkills() {
      if (get(drawerRef)) get(drawerRef).refreshSkills();
    }
    function refreshMemories() {
      if (get(drawerRef)) get(drawerRef).refreshMemories();
    }
    function toggleDrawer() {
      set(drawerOpen, !get(drawerOpen));
    }
    function closeDrawer() {
      set(drawerOpen, false);
    }
    var $$exports = {
      showLongWorkOverlay,
      showToast,
      refreshSettings,
      refreshSkills,
      refreshMemories
    };
    var fragment = root();
    var button = first_child(fragment);
    var node = sibling(button, 2);
    bind_this(
      Drawer(node, {
        get open() {
          return get(drawerOpen);
        },
        onclose: closeDrawer
      }),
      ($$value) => set(drawerRef, $$value, true),
      () => get(drawerRef)
    );
    var node_1 = sibling(node, 2);
    LongWorkOverlay(node_1, {
      get visible() {
        return get(overlayVisible);
      }
    });
    var node_2 = sibling(node_1, 2);
    ToastStack(node_2, {
      get toasts() {
        return get(toasts);
      }
    });
    delegated("click", button, toggleDrawer);
    append($$anchor, fragment);
    return pop($$exports);
  }
  delegate(["click"]);
  function mountUi() {
    if (document.getElementById("bds-root")) {
      return state$1.ui;
    }
    const root2 = document.createElement("div");
    root2.id = "bds-root";
    document.body.appendChild(root2);
    const app = mount(App, { target: root2 });
    const api = {
      showLongWorkOverlay: (show) => app.showLongWorkOverlay(show),
      showToast: (message) => app.showToast(message),
      refreshSettings: () => app.refreshSettings(),
      refreshSkills: () => app.refreshSkills(),
      refreshMemories: () => app.refreshMemories()
    };
    state$1.ui = api;
    return api;
  }
  init().catch((error) => {
    console.error("[BetterDeepSeek] Init error:", error);
  });
  async function init() {
    await waitForBody();
    await loadStateFromStorage();
    injectHookScript();
    setupBridgeEvents();
    mountUi();
    bindStorageChangeListener();
    startUrlWatcher();
    observeChatDom();
    scheduleScan();
    pushConfigToPage();
  }
  async function waitForBody() {
    if (document.body) {
      return;
    }
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }
})();
