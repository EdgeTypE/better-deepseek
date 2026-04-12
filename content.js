(() => {
  "use strict";

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
  const LONG_WORK_STALE_MS = 30000;

  const DEFAULT_SYSTEM_PROMPT = [
    "You are Better DeepSeek inside a tool-enabled extension.",
    "",
    "MANDATORY PROJECT DELIVERY PROTOCOL:",
    "1) If the user asks for a project/app/template/scaffold/multiple files/zip/archive/downloadable package, you MUST use:",
    "   <BDS:LONG_WORK>",
    "   <BDS:create_file fileName=\"...\">...</BDS:create_file>",
    "   ...",
    "   </BDS:LONG_WORK>",
    "2) Inside LONG_WORK, create every required file with BDS:create_file. No placeholders.",
    "3) After </BDS:LONG_WORK>, you may add one short plain sentence only.",
    "4) The extension automatically zips all BDS:create_file outputs created inside LONG_WORK and gives the ZIP to the user.",
    "",
    "STRICTLY FORBIDDEN:",
    "- Do NOT generate base64 zip blobs.",
    "- Do NOT generate data: URLs for file delivery.",
    "- Do NOT try to build zip files with Python/JavaScript/HTML tools.",
    "- Do NOT say user should zip files manually when LONG_WORK can be used.",
    "- Do NOT output <thinking> tags, chain-of-thought, or internal planning text.",
    "",
    "TOOL USAGE:",
    "- Use <BDS:HTML>...</BDS:HTML> for interactive visuals/simulations with full HTML docs.",
    "- Use <BDS:LATEX>...</BDS:LATEX> for complete LaTeX documents meant for PDF.",
    "- Use <BDS:run_python_embed>...</BDS:run_python_embed> for browser-executable Python.",
    "- Use <BDS:memory_write>key: value, importance: always|called</BDS:memory_write> for durable user facts.",
    "- Inside <BDS:create_file> and <BDS:run_python_embed>, wrap code in fenced markdown blocks: ```lang ... ```.",
    "",
    "QUALITY:",
    "- Prefer complete, runnable outputs.",
    "- Use meaningful file paths and correct file extensions.",
    "- Keep user-facing text concise and practical."
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

  const TOOL_RENDERERS = {
    html: (content) => buildHtmlPreviewCard(content),
    latex: (content) => buildLatexCard(content),
    run_python_embed: (content) => buildPythonCard(content)
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    skills: [],
    memories: {},
    observer: null,
    scanTimer: 0,
    urlWatchTimer: 0,
    lastUrl: location.href,
    processedStandaloneFiles: new Set(),
    processedLatexAutoDownloads: new Set(),
    downloadCounter: 0,
    network: {
      activeCompletionRequests: 0,
      lastEventAt: 0
    },
    longWork: {
      active: false,
      files: new Map(),
      lastActivityAt: 0
    },
    ui: {
      root: null,
      toggleButton: null,
      drawer: null,
      closeButton: null,
      systemPromptInput: null,
      autoFilesCheckbox: null,
      autoZipCheckbox: null,
      autoLatexCheckbox: null,
      saveSettingsButton: null,
      skillUploadInput: null,
      skillList: null,
      memoryList: null,
      longWorkOverlay: null,
      toastStack: null
    }
  };

  let memoryPersistTimer = 0;

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
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function loadStateFromStorage() {
    const values = await chrome.storage.local.get([
      STORAGE_KEYS.settings,
      STORAGE_KEYS.skills,
      STORAGE_KEYS.memories
    ]);

    const storedSettings = values[STORAGE_KEYS.settings] || {};

    state.settings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings
    };

    if (shouldUpgradeSystemPrompt(storedSettings)) {
      state.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      state.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
    }

    const behaviorVersion = Number(
      storedSettings && storedSettings.downloadBehaviorVersion
        ? storedSettings.downloadBehaviorVersion
        : 0
    );
    if (behaviorVersion < DOWNLOAD_BEHAVIOR_VERSION) {
      state.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
      state.settings.autoDownloadFiles = false;
      state.settings.autoDownloadLongWorkZip = false;
      state.settings.autoDownloadLatexPdf = false;
      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
    }

    state.skills = normalizeSkills(values[STORAGE_KEYS.skills]);
    state.memories = normalizeMemories(values[STORAGE_KEYS.memories]);
  }

  function shouldUpgradeSystemPrompt(storedSettings) {
    const version = Number(storedSettings && storedSettings.systemPromptTemplateVersion
      ? storedSettings.systemPromptTemplateVersion
      : 0);

    if (version >= SYSTEM_PROMPT_TEMPLATE_VERSION) {
      return false;
    }

    const prompt = String(storedSettings && storedSettings.systemPrompt ? storedSettings.systemPrompt : "").trim();
    if (!prompt) {
      return true;
    }

    if (prompt.includes("You are Better DeepSeek, an output-focused assistant with tool tags.")) {
      return true;
    }

    if (prompt.includes("You are Better DeepSeek inside a tool-enabled extension.")) {
      return true;
    }

    if (prompt.includes("You are now Better DeepSeek.") && prompt.includes("When using <BDS:LONG_WORK>...</BDS:LONG_WORK>:")) {
      return true;
    }

    if (prompt.includes("Prefer complete, runnable outputs for create_file and LONG_WORK tasks.")) {
      return true;
    }

    return false;
  }

  function normalizeSkills(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => ({
        id: String(item && item.id ? item.id : makeId()),
        name: String(item && item.name ? item.name : "Skill"),
        content: String(item && item.content ? item.content : ""),
        active: item && typeof item.active === "boolean" ? item.active : true
      }))
      .filter((item) => item.content.trim().length > 0);
  }

  function normalizeMemories(raw) {
    const memories = {};

    if (Array.isArray(raw)) {
      for (const item of raw) {
        const key = sanitizeMemoryKey(item && item.key);
        const value = String(item && item.value ? item.value : "").trim();
        if (!key || !value) {
          continue;
        }

        memories[key] = {
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
      const key = sanitizeMemoryKey(unsafeKey);
      const value = String(item && item.value ? item.value : "").trim();
      if (!key || !value) {
        continue;
      }

      memories[key] = {
        value,
        importance: sanitizeMemoryImportance(item && item.importance)
      };
    }

    return memories;
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

  function setupBridgeEvents() {
    window.addEventListener(BRIDGE_EVENTS.requestConfig, () => {
      pushConfigToPage();
    });

    window.addEventListener(BRIDGE_EVENTS.networkState, (event) => {
      handleNetworkState(event && event.detail ? event.detail : {});
    });
  }

  function handleNetworkState(detail) {
    const activeCompletionRequests = Math.max(
      0,
      Number(detail && detail.activeCompletionRequests ? detail.activeCompletionRequests : 0)
    );

    state.network.activeCompletionRequests = activeCompletionRequests;
    state.network.lastEventAt = Date.now();

    if (activeCompletionRequests > 0) {
      if (state.longWork.active) {
        state.longWork.lastActivityAt = Date.now();
      }
      return;
    }

    showLongWorkOverlay(false);

    if (!state.longWork.active) {
      return;
    }

    const pendingFiles = state.longWork.files.size;
    if (pendingFiles > 0) {
      const latestAssistant = findLatestAssistantMessageNode();
      if (latestAssistant && latestAssistant.dataset.bdsLongWorkClosed !== "1") {
        latestAssistant.dataset.bdsLongWorkClosed = "1";
        finalizeLongWork(latestAssistant);
        return;
      }
    }

    state.longWork.active = false;
    state.longWork.lastActivityAt = 0;
    state.longWork.files.clear();
    showToast("LONG_WORK closed because API response ended.");
  }

  function pushConfigToPage() {
    const detail = {
      systemPrompt: String(state.settings.systemPrompt || ""),
      skills: state.skills
        .filter((skill) => skill.active)
        .map((skill) => ({ name: skill.name, content: skill.content })),
      memories: Object.entries(state.memories).map(([key, item]) => ({
        key,
        value: item.value,
        importance: item.importance
      }))
    };

    window.dispatchEvent(new CustomEvent(BRIDGE_EVENTS.configUpdate, { detail }));
  }

  function bindStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes[STORAGE_KEYS.settings]) {
        state.settings = {
          ...DEFAULT_SETTINGS,
          ...(changes[STORAGE_KEYS.settings].newValue || {})
        };
        renderSettings();
      }

      if (changes[STORAGE_KEYS.skills]) {
        state.skills = normalizeSkills(changes[STORAGE_KEYS.skills].newValue);
        renderSkills();
      }

      if (changes[STORAGE_KEYS.memories]) {
        state.memories = normalizeMemories(changes[STORAGE_KEYS.memories].newValue);
        renderMemories();
      }

      pushConfigToPage();
    });
  }

  function startUrlWatcher() {
    if (state.urlWatchTimer) {
      return;
    }

    state.urlWatchTimer = window.setInterval(() => {
      if (location.href === state.lastUrl) {
        return;
      }

      state.lastUrl = location.href;
      state.longWork.active = false;
      state.longWork.files.clear();
      state.longWork.lastActivityAt = 0;
      showLongWorkOverlay(false);
      scheduleScan();
    }, 1000);
  }

  function observeChatDom() {
    if (state.observer || !document.body) {
      return;
    }

    state.observer = new MutationObserver(() => {
      scheduleScan();
    });

    state.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function scheduleScan() {
    if (state.scanTimer) {
      return;
    }

    state.scanTimer = window.setTimeout(() => {
      state.scanTimer = 0;
      scanPage();
    }, 140);
  }

  function scanPage() {
    enhanceCodeBlockDownloads();

    if (state.longWork.active && Date.now() - state.longWork.lastActivityAt > LONG_WORK_STALE_MS) {
      state.longWork.active = false;
      state.longWork.files.clear();
      showLongWorkOverlay(false);
      showToast("LONG_WORK timeout cleared.");
    }

    const nodes = collectMessageNodes();
    for (const node of nodes) {
      processMessageNode(node);
    }
  }

  function collectMessageNodes() {
    const set = new Set();

    for (const node of document.querySelectorAll("div.ds-message._63c77b1")) {
      set.add(node);
    }

    if (!set.size) {
      for (const node of document.querySelectorAll("div.ds-message")) {
        set.add(node);
      }
    }

    return Array.from(set);
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
        state.longWork.active = true;
        state.longWork.lastActivityAt = Date.now();
        showLongWorkOverlay(true);
      }

      if (state.longWork.active && !parsed.longWorkClose) {
        hideMessageNode(node, true);
      } else {
        hideMessageNode(node, false);
      }

      if (hasActionableFiles) {
        if ((state.longWork.active || parsed.longWorkOpen) && isLatestAssistant) {
          state.longWork.lastActivityAt = Date.now();
          collectLongWorkFiles(parsed.createFiles);
        } else {
          emitStandaloneFiles(node, parsed.createFiles);
        }
      }

      if (!(state.longWork.active && !parsed.longWorkClose)) {
        renderToolBlocks(node, parsed.renderableBlocks);
      }

      const hasCollectedFiles = state.longWork.files.size > 0 || hasActionableFiles;
      if (
        parsed.longWorkClose &&
        hasCollectedFiles &&
        isLatestAssistant &&
        node.dataset.bdsLongWorkClosed !== "1"
      ) {
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

  function extractMessageRawText(node) {
    return parseNodeWithBestTextSource(node);
  }

  function parseNodeWithBestTextSource(node) {
    const candidates = getNodeTextCandidates(node);
    if (!candidates.length) {
      return "";
    }

    const tagCandidates = candidates.filter((value) => /<BDS:|<BetterDeepSeek>/i.test(value));
    const pool = tagCandidates.length ? tagCandidates : candidates;

    const selected = pool.sort((a, b) => scoreRawTextCandidate(b) - scoreRawTextCandidate(a))[0] || "";
    return stripMarkdownViewerControls(selected);
  }

  function getNodeTextCandidates(node) {
    const innerText = String(node.innerText || "");
    const textContent = String(node.textContent || "");
    const htmlDecoded = decodeNodeHtmlText(node.innerHTML || "");

    return [innerText, textContent, htmlDecoded].filter((value) => value && value.trim());
  }

  function decodeNodeHtmlText(html) {
    const htmlWithBreaks = String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|pre|code|blockquote|h[1-6])>/gi, "\n");

    const container = document.createElement("div");
    container.innerHTML = htmlWithBreaks;
    return String(container.textContent || "");
  }

  function scoreRawTextCandidate(value) {
    const text = String(value || "");
    const lineBreakCount = (text.match(/\n/g) || []).length;
    const tagCount = (text.match(/<BDS:|<BetterDeepSeek>/gi) || []).length;
    return tagCount * 10000 + lineBreakCount * 100 + text.length;
  }

  function isLatestAssistantMessage(node) {
    return findLatestAssistantMessageNode() === node;
  }

  function findLatestAssistantMessageNode() {
    const nodes = collectMessageNodes();
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const candidate = nodes[index];
      if (!candidate || candidate.closest("#bds-root")) {
        continue;
      }

      if (detectMessageRole(candidate) === "assistant") {
        return candidate;
      }
    }

    return null;
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

  function applySanitizedDisplay(node, visibleText, role) {
    if (role !== "assistant") {
      return;
    }

    const text = String(visibleText || "").trim();

    const host = getOrCreateHost(node, "bds-sanitized-host");
    host.textContent = text;
    node.dataset.bdsHiddenByTags = "1";
    node.style.display = "none";

    node.dataset.bdsSanitizedText = text;
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

  function collectLongWorkFiles(createFiles) {
    for (const item of createFiles) {
      const normalizedPath = normalizeFilePath(item.fileName);
      if (!normalizedPath) {
        continue;
      }

      state.longWork.files.set(normalizedPath, String(item.content || ""));
    }
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
      if (state.processedStandaloneFiles.has(signature)) {
        continue;
      }

      state.processedStandaloneFiles.add(signature);

      const shouldPackagePath =
        normalizedPath.includes("/") && window.BDSZip && typeof window.BDSZip.buildZip === "function";

      let blob;
      let cardTitle;
      let downloadName;
      let description = normalizedPath;

      if (shouldPackagePath) {
        blob = window.BDSZip.buildZip([{ path: normalizedPath, content }]);
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

      if (state.settings.autoDownloadFiles) {
        triggerBlobDownload(blob, downloadName);
      }
    }
  }

  function finalizeLongWork(node) {
    state.longWork.active = false;
    state.longWork.lastActivityAt = 0;
    showLongWorkOverlay(false);

    const entries = Array.from(state.longWork.files.entries()).map(([path, content]) => ({ path, content }));
    state.longWork.files.clear();

    if (!entries.length) {
      showToast("LONG_WORK finished. No files were produced.");
      return;
    }

    if (!window.BDSZip || typeof window.BDSZip.buildZip !== "function") {
      showToast("ZIP builder not available. Files will be provided one by one.");
      emitStandaloneFiles(
        node,
        entries.map((entry) => ({ fileName: entry.path, content: entry.content }))
      );
      return;
    }

    const host = getOrCreateHost(node, "bds-file-host");
    const zipBlob = window.BDSZip.buildZip(entries);
    const zipName = `better-deepseek-${buildTimestamp()}.zip`;

    host.appendChild(
      buildDownloadCard({
        title: "LONG_WORK project",
        description: `${entries.length} files packaged`,
        fileName: zipName,
        blob: zipBlob
      })
    );

    if (state.settings.autoDownloadLongWorkZip) {
      triggerBlobDownload(zipBlob, zipName);
    }

    showToast(`LONG_WORK complete: ${entries.length} files zipped.`);
  }

  function renderToolBlocks(node, blocks) {
    const host = getOrCreateHost(node, "bds-tool-host");

    if (!blocks.length) {
      host.replaceChildren();
      return;
    }

    const signature = simpleHash(
      blocks.map((block) => `${block.name}:${simpleHash(block.content)}`).join("|")
    );
    if (host.dataset.signature === signature) {
      return;
    }

    host.dataset.signature = signature;
    host.replaceChildren();

    for (const block of blocks) {
      const renderer = TOOL_RENDERERS[block.name];
      if (!renderer) {
        continue;
      }
      host.appendChild(renderer(block.content));
    }
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

  function buildLatexCard(latexSource) {
    const source = String(latexSource || "");
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
    preview.textContent = source.slice(0, 4000);

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
      await downloadLatexPdf(source, `latex-${Date.now()}.pdf`);
      pdfButton.disabled = false;
      pdfButton.textContent = previousText;
    });

    const texButton = document.createElement("button");
    texButton.type = "button";
    texButton.className = "bds-btn bds-btn-secondary";
    texButton.textContent = "Download .tex";
    texButton.addEventListener("click", () => {
      triggerTextDownload(source, `latex-${Date.now()}.tex`);
    });

    actions.appendChild(pdfButton);
    actions.appendChild(texButton);

    card.body.appendChild(status);
    card.body.appendChild(pdfFrame);
    card.body.appendChild(sourceDetails);
    card.body.appendChild(actions);

    void renderLatexPdfPreview(source, pdfFrame, status);

    if (state.settings.autoDownloadLatexPdf) {
      const autoKey = simpleHash(source);
      if (!state.processedLatexAutoDownloads.has(autoKey)) {
        state.processedLatexAutoDownloads.add(autoKey);
        void downloadLatexPdf(source, `latex-${Date.now()}.pdf`);
      }
    }

    return card.element;
  }

  async function renderLatexPdfPreview(source, pdfFrame, statusNode) {
    try {
      const blob = await compileLatexPdfBlob(source);
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

  function buildPythonCard(sourceCode) {
    const source = String(sourceCode || "");
    const card = createToolCardShell("Python Runner", "Pyodide in browser");

    const frame = document.createElement("iframe");
    frame.className = "bds-python-frame";
    frame.sandbox = "allow-scripts";
    frame.srcdoc = buildPythonRunnerDocument(source);

    const actions = document.createElement("div");
    actions.className = "bds-card-actions";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "bds-btn";
    downloadButton.textContent = "Download .py";
    downloadButton.addEventListener("click", () => {
      triggerTextDownload(source, `script-${Date.now()}.py`);
    });

    actions.appendChild(downloadButton);
    card.body.appendChild(frame);
    card.body.appendChild(actions);

    return card.element;
  }

  function createToolCardShell(title, subtitle) {
    const element = document.createElement("article");
    element.className = "bds-tool-card";

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

    element.appendChild(header);
    element.appendChild(body);

    return { element, body };
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

  function parseBdsMessage(rawText) {
    const text = String(rawText || "");
    const result = {
      containsControlTags: false,
      longWorkOpen: false,
      longWorkClose: false,
      renderableBlocks: [],
      createFiles: [],
      memoryWrites: [],
      visibleText: text
    };

    if (!/(<BDS:|<BetterDeepSeek>|Bds create file>)/i.test(text)) {
      return result;
    }

    result.containsControlTags = true;
    result.longWorkOpen = /<BDS:LONG_WORK>/i.test(text);
    result.longWorkClose = /<\/BDS:LONG_WORK>/i.test(text);

    // Parse create_file pair tags independently so nested files inside LONG_WORK are captured.
    const createFilePairRegex = /<BDS:create_file([^>]*)>([\s\S]*?)<\/BDS:create_file>/gi;
    let match;
    while ((match = createFilePairRegex.exec(text)) !== null) {
      const attrs = parseTagAttributes(match[1] || "");
      const fileName = attrs.fileName || attrs.filename || attrs.path;
      if (!fileName) {
        continue;
      }
      const content = normalizeTaggedCodeContent(String(match[2] || ""), "create_file");
      result.createFiles.push({ fileName, content });
    }

    const pairTagRegex = /<BDS:([A-Za-z0-9_]+)([^>]*)>([\s\S]*?)<\/BDS:\1>/gi;
    match = null;
    while ((match = pairTagRegex.exec(text)) !== null) {
      const name = String(match[1] || "").toLowerCase();
      const attrs = parseTagAttributes(match[2] || "");
      const content = normalizeTaggedCodeContent(String(match[3] || ""), name);

      if (Object.prototype.hasOwnProperty.call(TOOL_RENDERERS, name)) {
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
    while ((match = selfClosingCreateRegex.exec(text)) !== null) {
      const attrs = parseTagAttributes(match[1] || "");
      const fileName = attrs.fileName || attrs.filename || attrs.path;
      if (!fileName) {
        continue;
      }
      const content = normalizeTaggedCodeContent(String(attrs.content || ""), "create_file");
      result.createFiles.push({ fileName, content });
    }

    const plainCreateRegex = /Bds create file>\s*fileName\s*=\s*"([^"]+)"\s*content\s*=\s*"([\s\S]*?)"/gi;
    while ((match = plainCreateRegex.exec(text)) !== null) {
      result.createFiles.push({
        fileName: String(match[1] || "file.txt"),
        content: normalizeTaggedCodeContent(String(match[2] || ""), "create_file")
      });
    }

    result.visibleText = sanitizeVisibleText(text);
    return result;
  }

  function parseTagAttributes(rawAttrs) {
    const attrs = {};
    const regex = /([A-Za-z0-9_:-]+)\s*=\s*"([\s\S]*?)"/g;

    let match;
    while ((match = regex.exec(rawAttrs)) !== null) {
      const key = String(match[1] || "").trim();
      if (!key) {
        continue;
      }

      if (key === "fileName") {
        attrs.fileName = String(match[2] || "");
      } else {
        attrs[key] = String(match[2] || "");
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

  function stripMarkdownViewerControls(text) {
    let output = String(text || "");
    let previous = "";

    const languagePattern =
      "(?:python|javascript|typescript|tsx|jsx|html|css|json|bash|shell|sh|sql|yaml|yml|xml|markdown|md)";

    while (output !== previous) {
      previous = output;

      output = output.replace(
        new RegExp(`^\\s*${languagePattern}\\s*(?:\\r?\\n|\\s+)(?:Kopyala|Copy)\\s*(?:\\r?\\n|\\s+)(?:İndir|Download)\\s*(?:\\r?\\n)*`, "i"),
        ""
      );

      output = output.replace(
        /^\s*(?:Kopyala|Copy)\s*(?:\r?\n|\s+)(?:İndir|Download)\s*(?:\r?\n)*/i,
        ""
      );
    }

    return output;
  }

  function unwrapMarkdownCodeFence(content) {
    const original = String(content || "");
    const trimmed = original.trim();

    const fencedMultiline = trimmed.match(/^```[a-zA-Z0-9_+.-]*\s*\r?\n([\s\S]*?)\r?\n```$/);
    if (fencedMultiline) {
      return String(fencedMultiline[1] || "");
    }

    const fencedInline = trimmed.match(/^```([\s\S]*?)```$/);
    if (fencedInline) {
      return String(fencedInline[1] || "");
    }

    return original;
  }

  function parseMemoryWrite(content) {
    const cleaned = String(content || "").trim();
    if (!cleaned) {
      return null;
    }

    const match = cleaned.match(/^([a-z0-9_]+)\s*:\s*([\s\S]*?)(?:,\s*importance\s*:\s*(always|called))?$/i);
    if (!match) {
      return null;
    }

    const key = sanitizeMemoryKey(match[1]);
    const value = String(match[2] || "").trim();
    const importance = sanitizeMemoryImportance(match[3] || "called");

    if (!key || !value) {
      return null;
    }

    return { key, value, importance };
  }

  function sanitizeVisibleText(text) {
    let output = String(text || "");

    output = output.replace(/<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi, "");
    output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
    output = output.replace(/<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi, "");
    output = output.replace(/<BDS:[A-Za-z0-9_]+[^>]*>[\s\S]*?<\/BDS:[A-Za-z0-9_]+>/gi, "");
    output = output.replace(/<BDS:create_file[^>]*\/>/gi, "");
    output = output.replace(/<\/?BDS:LONG_WORK>/gi, "");
    output = output.replace(/Bds create file>[^\n]*/gi, "");

    return output.replace(/\n{3,}/g, "\n\n").trim();
  }

  function upsertMemories(items) {
    let changed = false;

    for (const item of items) {
      const key = sanitizeMemoryKey(item.key);
      const value = String(item.value || "").trim();
      const importance = sanitizeMemoryImportance(item.importance);

      if (!key || !value) {
        continue;
      }

      const existing = state.memories[key];
      if (existing && existing.value === value && existing.importance === importance) {
        continue;
      }

      state.memories[key] = { value, importance };
      changed = true;
    }

    if (!changed) {
      return;
    }

    renderMemories();
    pushConfigToPage();

    if (memoryPersistTimer) {
      window.clearTimeout(memoryPersistTimer);
    }

    memoryPersistTimer = window.setTimeout(async () => {
      memoryPersistTimer = 0;
      await chrome.storage.local.set({ [STORAGE_KEYS.memories]: state.memories });
    }, 300);
  }

  function sanitizeMemoryKey(input) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  }

  function sanitizeMemoryImportance(input) {
    return String(input || "called").toLowerCase() === "always" ? "always" : "called";
  }

  function mountUi() {
    if (document.getElementById("bds-root")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "bds-root";

    root.innerHTML = `
      <button id="bds-toggle" type="button">BDS</button>
      <aside id="bds-drawer" class="bds-closed">
        <div class="bds-drawer-header">
          <h2>Better DeepSeek</h2>
          <button id="bds-close" type="button">Close</button>
        </div>

        <label class="bds-label" for="bds-system-prompt">Hidden System Prompt</label>
        <textarea id="bds-system-prompt" spellcheck="false"></textarea>

        <label class="bds-check">
          <input id="bds-auto-files" type="checkbox" /> Auto download create_file outputs
        </label>
        <label class="bds-check">
          <input id="bds-auto-zip" type="checkbox" /> Auto download LONG_WORK zip
        </label>
        <label class="bds-check">
          <input id="bds-auto-latex" type="checkbox" /> Auto download LATEX PDF outputs
        </label>
        <button id="bds-save-settings" type="button">Save Settings</button>

        <hr />

        <label class="bds-label" for="bds-skill-upload">Upload Skill (.md)</label>
        <input id="bds-skill-upload" type="file" accept=".md,text/markdown" />
        <div id="bds-skill-list" class="bds-list"></div>

        <hr />

        <h3 class="bds-subtitle">Stored Memory</h3>
        <div id="bds-memory-list" class="bds-list"></div>
      </aside>

      <div id="bds-long-work-overlay" class="bds-hidden">
        <div class="bds-loader-card">
          <strong>Working...</strong>
          <p>Thinking and building your output</p>
          <div class="bds-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div id="bds-toast-stack"></div>
    `;

    document.body.appendChild(root);

    state.ui.root = root;
    state.ui.toggleButton = root.querySelector("#bds-toggle");
    state.ui.drawer = root.querySelector("#bds-drawer");
    state.ui.closeButton = root.querySelector("#bds-close");
    state.ui.systemPromptInput = root.querySelector("#bds-system-prompt");
    state.ui.autoFilesCheckbox = root.querySelector("#bds-auto-files");
    state.ui.autoZipCheckbox = root.querySelector("#bds-auto-zip");
    state.ui.autoLatexCheckbox = root.querySelector("#bds-auto-latex");
    state.ui.saveSettingsButton = root.querySelector("#bds-save-settings");
    state.ui.skillUploadInput = root.querySelector("#bds-skill-upload");
    state.ui.skillList = root.querySelector("#bds-skill-list");
    state.ui.memoryList = root.querySelector("#bds-memory-list");
    state.ui.longWorkOverlay = root.querySelector("#bds-long-work-overlay");
    state.ui.toastStack = root.querySelector("#bds-toast-stack");

    bindUiEvents();
    renderSettings();
    renderSkills();
    renderMemories();
  }

  function bindUiEvents() {
    state.ui.toggleButton.addEventListener("click", () => {
      state.ui.drawer.classList.toggle("bds-open");
      state.ui.drawer.classList.toggle("bds-closed");
    });

    state.ui.closeButton.addEventListener("click", () => {
      state.ui.drawer.classList.remove("bds-open");
      state.ui.drawer.classList.add("bds-closed");
    });

    state.ui.saveSettingsButton.addEventListener("click", async () => {
      state.settings.systemPrompt = String(state.ui.systemPromptInput.value || "").trim();
      state.settings.systemPromptTemplateVersion = SYSTEM_PROMPT_TEMPLATE_VERSION;
      state.settings.downloadBehaviorVersion = DOWNLOAD_BEHAVIOR_VERSION;
      state.settings.autoDownloadFiles = Boolean(state.ui.autoFilesCheckbox.checked);
      state.settings.autoDownloadLongWorkZip = Boolean(state.ui.autoZipCheckbox.checked);
      state.settings.autoDownloadLatexPdf = Boolean(state.ui.autoLatexCheckbox.checked);

      await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
      pushConfigToPage();
      showToast("Settings saved.");
    });

    state.ui.skillUploadInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      const content = await file.text();
      const name = file.name.replace(/\.md$/i, "") || `skill-${state.skills.length + 1}`;

      state.skills.push({
        id: makeId(),
        name,
        content,
        active: true
      });

      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state.skills });
      renderSkills();
      pushConfigToPage();
      showToast(`Skill loaded: ${name}`);

      event.target.value = "";
    });

    state.ui.skillList.addEventListener("change", async (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      if (input.dataset.action !== "toggle-skill") {
        return;
      }

      const skillId = input.dataset.id;
      const skill = state.skills.find((item) => item.id === skillId);
      if (!skill) {
        return;
      }

      skill.active = Boolean(input.checked);
      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state.skills });
      pushConfigToPage();
    });

    state.ui.skillList.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      if (target.dataset.action !== "delete-skill") {
        return;
      }

      const skillId = target.dataset.id;
      const before = state.skills.length;
      state.skills = state.skills.filter((item) => item.id !== skillId);

      if (state.skills.length === before) {
        return;
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.skills]: state.skills });
      renderSkills();
      pushConfigToPage();
      showToast("Skill removed.");
    });
  }

  function renderSettings() {
    if (!state.ui.systemPromptInput) {
      return;
    }

    state.ui.systemPromptInput.value = String(state.settings.systemPrompt || "");
    state.ui.autoFilesCheckbox.checked = Boolean(state.settings.autoDownloadFiles);
    state.ui.autoZipCheckbox.checked = Boolean(state.settings.autoDownloadLongWorkZip);
    state.ui.autoLatexCheckbox.checked = Boolean(state.settings.autoDownloadLatexPdf);
  }

  function renderSkills() {
    if (!state.ui.skillList) {
      return;
    }

    if (!state.skills.length) {
      state.ui.skillList.innerHTML = "<p class=\"bds-empty\">No skills loaded.</p>";
      return;
    }

    state.ui.skillList.innerHTML = state.skills
      .map(
        (skill) => `
          <div class="bds-skill-item">
            <label>
              <input
                type="checkbox"
                data-action="toggle-skill"
                data-id="${escapeHtml(skill.id)}"
                ${skill.active ? "checked" : ""}
              />
              <span>${escapeHtml(skill.name)}</span>
            </label>
            <button type="button" data-action="delete-skill" data-id="${escapeHtml(skill.id)}">Delete</button>
          </div>
        `
      )
      .join("");
  }

  function renderMemories() {
    if (!state.ui.memoryList) {
      return;
    }

    const entries = Object.entries(state.memories);
    if (!entries.length) {
      state.ui.memoryList.innerHTML = "<p class=\"bds-empty\">No memory entries yet.</p>";
      return;
    }

    state.ui.memoryList.innerHTML = entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([key, item]) => `
          <div class="bds-memory-item">
            <strong>${escapeHtml(key)}</strong>
            <span>${escapeHtml(item.value)}</span>
            <em>${escapeHtml(item.importance)}</em>
          </div>
        `
      )
      .join("");
  }

  function showLongWorkOverlay(show) {
    if (!state.ui.longWorkOverlay) {
      return;
    }

    state.ui.longWorkOverlay.classList.toggle("bds-hidden", !show);
    state.ui.longWorkOverlay.classList.toggle("bds-visible", show);
  }

  function showToast(message) {
    if (!state.ui.toastStack) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = "bds-toast";
    toast.textContent = String(message || "Done");

    state.ui.toastStack.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add("bds-toast-out");
      window.setTimeout(() => {
        toast.remove();
      }, 280);
    }, 2600);
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
        const fileName = `snippet-${++state.downloadCounter}.${extension}`;
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
    <script src="https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js"></script>
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
    </script>
  </body>
</html>`;
  }

  function normalizeFilePath(fileName) {
    const cleaned = String(fileName || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^[A-Za-z]:/, "")
      .replace(/^\/+/, "");

    if (!cleaned) {
      return "file.txt";
    }

    const safeParts = cleaned
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .map((part) => part.replace(/[<>:"|?*]/g, "_"));

    return safeParts.join("/") || "file.txt";
  }

  function buildCreateFilePackageName(path) {
    const normalizedPath = normalizeFilePath(path);
    const folderHint = normalizedPath.includes("/")
      ? normalizedPath.split("/").slice(0, -1).join("-")
      : normalizedPath.split(".")[0];

    const safeHint = folderHint.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const base = safeHint || "generated-file";
    return `${base}-${buildTimestamp()}.zip`;
  }

  function flattenPathForDownload(path) {
    return String(path || "file.txt")
      .replace(/[<>:"|?*]/g, "_")
      .replace(/\//g, "__");
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

  function triggerTextDownload(text, fileName) {
    const blob = new Blob([String(text || "")], { type: "text/plain" });
    triggerBlobDownload(blob, fileName);
  }

  async function compileLatexPdfBlob(source) {
    const response = await chrome.runtime.sendMessage({
      type: "bds-compile-latex",
      source
    });

    if (!response || !response.ok || !response.base64) {
      throw new Error(response && response.error ? response.error : "LaTeX compile failed.");
    }

    return base64ToBlob(response.base64, "application/pdf");
  }

  async function downloadLatexPdf(source, fileName) {
    try {
      const blob = await compileLatexPdfBlob(source);
      triggerBlobDownload(blob, fileName);
      showToast("LaTeX PDF downloaded.");
      return true;
    } catch (error) {
      showToast("LaTeX PDF failed. Downloaded .tex fallback.");
      triggerTextDownload(source, String(fileName || "latex.pdf").replace(/\.pdf$/i, ".tex"));
      return false;
    }
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
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
    }, 2000);
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

  function simpleHash(input) {
    const text = String(input || "");
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return (hash >>> 0).toString(16);
  }

  function buildTimestamp() {
    const now = new Date();

    const pad = (value) => String(value).padStart(2, "0");
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const mi = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  function makeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
