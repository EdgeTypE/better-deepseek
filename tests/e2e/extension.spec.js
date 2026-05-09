import { test, expect } from "./helpers/extension.js";

async function addAssistantMessage(page, text) {
  await page.evaluate((rawText) => {
    window.__mockDeepSeek.addAssistantMessage(rawText);
  }, text);
}

async function addUserMessage(page, text) {
  await page.evaluate((rawText) => {
    window.__mockDeepSeek.addUserMessage(rawText);
  }, text);
}

async function addCodeMessage(page, language, code) {
  await page.evaluate(
    ({ lang, source }) => {
      window.__mockDeepSeek.addCodeMessage(lang, source);
    },
    { lang: language, source: code },
  );
}

async function updateLastAssistantMessage(page, text) {
  await page.evaluate((rawText) => {
    window.__mockDeepSeek.updateLastAssistantMessage(rawText);
  }, text);
}

async function openDrawer(page) {
  const drawer = page.locator("#bds-drawer");
  if (await drawer.evaluate((node) => node.classList.contains("bds-open"))) {
    return;
  }
  await page.locator("#bds-toggle").click();
  await expect(drawer).toHaveClass(/bds-open/);
}

async function closeDrawer(page) {
  const drawer = page.locator("#bds-drawer");
  if (!(await drawer.evaluate((node) => node.classList.contains("bds-open")))) {
    return;
  }
  await page.locator("#bds-close").click();
  await expect(drawer).toHaveClass(/bds-closed/);
}

test("loads the extension and toggles the drawer", async ({ page }) => {
  await expect(page.locator("#bds-toggle")).toBeVisible();
  await openDrawer(page);
  await closeDrawer(page);
});

test("renders visualizer and HTML tool cards from tagged assistant messages", async ({ page }) => {
  await addAssistantMessage(
    page,
    [
      "Lead text before tools.",
      '<BDS:VISUALIZER><div class="v-card"><h2 class="v-title">Chart</h2></div></BDS:VISUALIZER>',
      "<BDS:HTML><section><h1>Embedded Report</h1></section></BDS:HTML>",
    ].join("\n"),
  );

  await expect(page.locator(".bds-visualizer-card")).toBeVisible();
  await expect(page.locator(".bds-tool-card h4")).toContainText("HTML");
});

test("renders PPTX, Excel, and Docx cards for office-generation tags", async ({ page }) => {
  await addAssistantMessage(
    page,
    [
      '<BDS:pptx>fileName: "deck.pptx"</BDS:pptx>',
      '<BDS:excel>const wb = {}; XLSX.writeFile(wb, "report.xlsx")</BDS:excel>',
      '<BDS:docx>const doc = {}; DOCX.save(doc, "brief.docx")</BDS:docx>',
    ].join("\n"),
  );

  await expect(page.locator(".bds-pptx-card")).toContainText("deck.pptx");
  await expect(page.locator(".bds-excel-card")).toContainText("report.xlsx");
  await expect(page.locator(".bds-docx-card")).toContainText("brief.docx");
});

test("adds code download buttons and opens the JavaScript runner", async ({ page }) => {
  await addCodeMessage(page, "python", 'print("hello")');
  await addCodeMessage(page, "javascript", 'console.log("runner");');

  await expect(page.getByRole("button", { name: "Run Python" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run JS" })).toBeVisible();
  await expect(page.locator(".bds-code-download")).toHaveCount(2);

  const codeDownload = page.waitForEvent("download");
  await page.locator(".md-code-block .bds-code-download").first().click();
  await expect(await codeDownload).toBeTruthy();

  await page.getByRole("button", { name: "Run JS" }).click();
  await expect(page.locator(".bds-code-runner-card")).toBeVisible();

  const runnerDownload = page.waitForEvent("download");
  await page.locator(".bds-code-runner-card .bds-btn-small").click();
  await expect(await runnerDownload).toBeTruthy();
});

test("imports a GitHub repository through the attach menu flow", async ({ page }) => {
  await page.locator(".bds-plus-btn").click();
  await page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "GitHub Repo" }).click();
  await page.locator(".bds-github-input").fill("octocat/Hello-World");
  await page.locator(".bds-github-btn-import").click();

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.getAttachedFiles()))
    .toEqual(["Hello-World_github.txt"]);
});

test("Upload File keeps multiple mode in the web flow", async ({ page }) => {
  await page.evaluate(() => {
    const input = document.querySelector("#native-file-input");
    window.__mockDeepSeek.uploadFileClickMultiple = null;
    input.addEventListener("click", (event) => {
      window.__mockDeepSeek.uploadFileClickMultiple = input.multiple;
      event.preventDefault();
    }, { once: true });
  });

  await page.locator(".bds-plus-btn").click();
  await page
    .locator(".bds-attach-dropdown .bds-attach-item")
    .filter({ hasText: "Upload File" })
    .click();

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.uploadFileClickMultiple))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.querySelector("#native-file-input").multiple))
    .toBe(true);
});

test("drawer import and upload inputs stay single-file in the web flow", async ({ page }) => {
  await openDrawer(page);
  await page.evaluate(() => {
    const modes = {};
    window.__mockDeepSeek.drawerFilePickerModes = modes;

    const names = ["skillImport", "characterImport", "memoryImport"];
    const jsonInputs = Array.from(
      document.querySelectorAll('#bds-drawer input[type="file"][accept=".json"]'),
    );
    jsonInputs.forEach((input, index) => {
      input.addEventListener("click", (event) => {
        modes[names[index]] = input.multiple;
        event.preventDefault();
      }, { once: true });
    });

    for (const [key, selector] of [
      ["skillUpload", "#bds-skill-upload"],
      ["characterUpload", "#bds-char-upload"],
    ]) {
      const input = document.querySelector(selector);
      input.addEventListener("click", (event) => {
        modes[key] = input.multiple;
        event.preventDefault();
      }, { once: true });
    }
  });

  const importButtons = page.locator("#bds-drawer button").filter({ hasText: "Import" });
  await importButtons.nth(0).click();
  await importButtons.nth(1).click();
  await importButtons.nth(2).click();
  await page.locator("#bds-skill-upload").dispatchEvent("click");
  await page.locator("#bds-char-upload").dispatchEvent("click");

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.drawerFilePickerModes))
    .toEqual({
      skillImport: false,
      characterImport: false,
      memoryImport: false,
      skillUpload: false,
      characterUpload: false,
    });
});

test("project Upload File keeps multiple mode in the web flow", async ({ page }) => {
  await openDrawer(page);
  await page.locator("#bds-drawer button").filter({ hasText: "Manage" }).click();
  await page.locator("#bds-drawer button").filter({ hasText: "New Project" }).click();
  await page.locator('#bds-drawer input[placeholder="Project name (required)"]').fill("Regression Project");
  await page.locator("#bds-drawer button").filter({ hasText: "Create" }).click();
  await page.locator("#bds-drawer .bds-skill-item").filter({ hasText: "Regression Project" }).click();

  await page.evaluate(() => {
    const input = document.querySelector('#bds-drawer input[type="file"][multiple]');
    window.__mockDeepSeek.projectUploadClickMultiple = null;
    input.addEventListener("click", (event) => {
      window.__mockDeepSeek.projectUploadClickMultiple = input.multiple;
      event.preventDefault();
    }, { once: true });
  });

  await page.locator("#bds-drawer button").filter({ hasText: "Upload File" }).click();

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.projectUploadClickMultiple))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.querySelector('#bds-drawer input[type="file"][multiple]').multiple))
    .toBe(true);
});

test("imports GitHub commit history as a second attachment when enabled", async ({ page }) => {
  await page.locator(".bds-plus-btn").click();
  await page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "GitHub Repo" }).click();
  await page.locator(".bds-github-input").fill("octocat/Hello-World");
  await page.locator(".bds-github-checkbox input").check();
  await expect(page.locator(".bds-github-number-input")).toHaveValue("");
  await expect(page.locator(".bds-github-number-input")).toHaveAttribute("placeholder", "100");
  await page.locator(".bds-github-btn-import").click();

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.getAttachedFiles()))
    .toEqual(["Hello-World_github.txt", "Hello-World_commits.txt"]);
});

test("creates standalone download cards for create_file outputs", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:create_file fileName="notes.txt">standalone body</BDS:create_file>',
  );

  await expect(page.locator(".bds-download-card")).toContainText("notes.txt");

  const download = page.waitForEvent("download");
  await page.locator(".bds-download-card .bds-btn").click();
  await expect(await download).toBeTruthy();
});

test("shows LONG_WORK progress and emits a ZIP download card after close", async ({ page }) => {
  await addAssistantMessage(
    page,
    [
      "Starting long work.",
      "<BDS:LONG_WORK>",
      '<BDS:create_file fileName="src/app.js">console.log("alpha");</BDS:create_file>',
    ].join("\n"),
  );

  await expect(page.locator(".bds-loading-indicator")).toBeVisible();

  await updateLastAssistantMessage(
    page,
    [
      "Starting long work.",
      "<BDS:LONG_WORK>",
      '<BDS:create_file fileName="src/app.js">console.log("alpha");</BDS:create_file>',
      '<BDS:create_file fileName="src/util.js">console.log("beta");</BDS:create_file>',
      "</BDS:LONG_WORK>",
    ].join("\n"),
  );

  await expect(page.locator(".bds-download-card")).toContainText("LONG_WORK project");
  await expect(page.locator(".bds-download-card")).toContainText("2 files packaged");
});

test("updates stored memory entries when memory_write tags are processed", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:memory_write key_name="favorite_tool" value="Visualizer" importance="always" />',
  );

  await page.waitForTimeout(500);
  await openDrawer(page);

  await expect(page.locator("#bds-memory-list")).toContainText("favorite_tool");
  await expect(page.locator("#bds-memory-list")).toContainText("Visualizer");
});

test("renders the voice prompt control in the composer", async ({ page }) => {
  await expect(page.locator(".bds-mic-btn")).toBeVisible();
  await expect(page.locator(".bds-mic-btn")).toHaveAttribute("title", "Voice Prompt");
});

test("persists settings across reloads", async ({ page }) => {
  await openDrawer(page);
  await page.locator("#bds-system-prompt").fill("System prompt from Playwright");
  await page.locator("#bds-save-settings").click();

  await page.reload();
  await page.waitForSelector("#bds-toggle");
  await openDrawer(page);
  await expect(page.locator("#bds-system-prompt")).toHaveValue("System prompt from Playwright");
});

test("filters sidebar history through the injected search box", async ({ page }) => {
  await expect(page.locator("#bds-sidebar-search-input")).toBeVisible();
  await page.locator("#bds-sidebar-search-input").fill("Alpha");
  await page.waitForTimeout(150);

  await expect
    .poll(() =>
      page.evaluate(() => ({
        alpha: document.querySelector('a[href="/chat/s/mock-chat-1"]').style.display,
        beta: document.querySelector('a[href="/chat/s/mock-chat-2"]').style.display,
      })),
    )
    .toEqual({ alpha: "", beta: "none" });
});

test("exports a chat as markdown from the sidebar menu", async ({ page }) => {
  await page.goto("https://chat.deepseek.com/chat/s/mock-chat-1");
  await page.waitForSelector("#bds-toggle");

  await addUserMessage(page, "How do exports work?");
  await addAssistantMessage(page, "Exports are generated from the visible session transcript.");

  // Hover and open chat menu
  const chatItem = page.locator('a._546d736[data-session-id="mock-chat-1"]');
  await chatItem.hover();
  
  // Click the three-dots/menu button (using exact class from mock)
  const menuBtn = chatItem.locator('div._2090548');
  await menuBtn.click({ force: true });

  // Small delay for the mock script and our injector to process
  await page.waitForTimeout(500);

  // Wait for the injected BDS option
  const exportOption = page.locator(".bds-export-option");
  await expect(exportOption).toBeVisible({ timeout: 10000 });
  await exportOption.click();

  // Wait for selection overlay
  await expect(page.locator(".bds-selection-bar")).toBeVisible();

  // Wait for checkboxes to be added by scanner
  await page.waitForSelector(".bds-selection-checkbox", { timeout: 5000 });

  // Select all messages
  await page.locator('button:has-text("Select All")').click();

  const download = page.waitForEvent("download");
  // Click MD button in the overlay
  await page.locator('.bds-export-btn[title="Markdown (.md)"]').click();
  const artifact = await download;

  expect(artifact.suggestedFilename()).toMatch(/\.md$/);
});

test("hides the Get App promotional button when the Android hide script runs", async ({ page }) => {
  const container = page.locator('[data-testid="get-app-container"]');
  await expect(container).toBeVisible();

  // Simulate MainActivity.injectBdsScripts() evaluating the hide-get-app snippet.
  await page.evaluate(() => {
    if (window.__bdsGetAppObserver) return;
    function hideButton() {
      const spans = document.querySelectorAll("span");
      for (const span of spans) {
        if (span.textContent.trim() !== "Get App") continue;
        let el = span.parentElement;
        while (el && el.tagName !== "BUTTON") {
          el = el.parentElement;
        }
        if (el && el.parentElement) {
          el.parentElement.style.display = "none";
        }
      }
    }
    hideButton();
    const observer = new MutationObserver(hideButton);
    observer.observe(document.body, { subtree: true, childList: true });
    window.__bdsGetAppObserver = observer;
  });

  await expect(container).not.toBeVisible();
});

test("re-hides Get App button after SPA re-render (observer stays alive)", async ({ page }) => {
  // Install the hide script.
  await page.evaluate(() => {
    if (window.__bdsGetAppObserver) return;
    function hideButton() {
      const spans = document.querySelectorAll("span");
      for (const span of spans) {
        if (span.textContent.trim() !== "Get App") continue;
        let el = span.parentElement;
        while (el && el.tagName !== "BUTTON") {
          el = el.parentElement;
        }
        if (el && el.parentElement) {
          el.parentElement.style.display = "none";
        }
      }
    }
    hideButton();
    const observer = new MutationObserver(hideButton);
    observer.observe(document.body, { subtree: true, childList: true });
    window.__bdsGetAppObserver = observer;
  });

  // Simulate SPA transition: remove original node and inject a fresh "Get App" button.
  await page.evaluate(() => {
    const old = document.querySelector('[data-testid="get-app-container"]');
    if (old) old.remove();

    const container = document.createElement("div");
    container.dataset.testid = "get-app-container-spa";
    const button = document.createElement("button");
    button.type = "button";
    const label = document.createElement("span");
    label.textContent = "Get App";
    button.appendChild(label);
    container.appendChild(button);
    document.body.prepend(container);
  });

  // Observer must auto-hide the re-inserted button.
  await expect(page.locator('[data-testid="get-app-container-spa"]')).not.toBeVisible();
});

function installDrawerHideScript(page) {
  return page.evaluate(() => {
    if (window.__bdsDrawerItemObserver) return;
    const TARGET = "Download mobile App";
    function hideItem(menu) {
      const options = menu.querySelectorAll(".ds-dropdown-menu-option");
      for (const opt of options) {
        const label = opt.querySelector(".ds-dropdown-menu-option__label");
        if (label?.textContent.trim().includes(TARGET)) {
          opt.style.display = "none";
        }
      }
    }
    document.querySelectorAll(".ds-dropdown-menu").forEach(hideItem);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList.contains("ds-dropdown-menu")) {
            hideItem(node);
          } else {
            const menu = node.querySelector?.(".ds-dropdown-menu");
            if (menu) hideItem(menu);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__bdsDrawerItemObserver = observer;
  });
}

test("hides Download mobile App item in settings drawer when Android hide script runs", async ({ page }) => {
  await installDrawerHideScript(page);

  // Open the settings drawer (fixture builds a real .ds-dropdown-menu on click).
  await page.locator('[data-testid="settings-trigger"]').click();
  await expect(page.locator('[data-testid="settings-drawer"]')).toBeVisible();

  // Download item must be hidden; other items must remain visible.
  await expect(page.locator('[data-testid="drawer-item-download"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="drawer-item-settings"]')).toBeVisible();
  await expect(page.locator('[data-testid="drawer-item-logout"]')).toBeVisible();
});

test("re-hides drawer download item when settings menu is reopened (SPA nav)", async ({ page }) => {
  await installDrawerHideScript(page);

  // Open → verify hidden.
  await page.locator('[data-testid="settings-trigger"]').click();
  await expect(page.locator('[data-testid="drawer-item-download"]')).not.toBeVisible();

  // Close by clicking elsewhere, then reopen — fixture creates a fresh .ds-dropdown-menu.
  await page.locator("h1").click();
  await page.locator('[data-testid="settings-trigger"]').click();
  await expect(page.locator('[data-testid="drawer-item-download"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="drawer-item-settings"]')).toBeVisible();
});

test("creates the PDF export iframe from the sidebar menu", async ({ page }) => {
  await page.goto("https://chat.deepseek.com/chat/s/mock-chat-1");
  await page.waitForSelector("#bds-toggle");

  await addUserMessage(page, "Generate a PDF snapshot.");
  await addAssistantMessage(page, "This transcript should render into the PDF export iframe.");

  // Hover and open chat menu
  const chatItem = page.locator('a._546d736[data-session-id="mock-chat-1"]');
  await chatItem.hover();
  const menuBtn = chatItem.locator('div._2090548');
  await menuBtn.click({ force: true });

  await page.waitForTimeout(500);

  // Wait for the injected BDS option
  const exportOption = page.locator(".bds-export-option");
  await expect(exportOption).toBeVisible({ timeout: 10000 });
  await exportOption.click();

  // Wait for selection overlay
  await expect(page.locator(".bds-selection-bar")).toBeVisible();
  
  // Wait for checkboxes
  await page.waitForSelector(".bds-selection-checkbox", { timeout: 5000 });

  // Select all messages
  await page.locator('button:has-text("Select All")').click();

  // Click PDF button in the overlay
  await page.locator('.bds-export-btn[title="PDF Document"]').click();

  await expect(page.locator("#bds-print-iframe")).toHaveCount(1);
});
