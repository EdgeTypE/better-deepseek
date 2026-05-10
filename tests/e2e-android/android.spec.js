/**
 * Android WebView simulator E2E suite.
 *
 * These tests load the same mock-deepseek fixture used by the Chrome suite,
 * but run the dist-android bundle on top of a JS mock of window.AndroidBridge.
 * They guard the parity contract between Chrome and Android so a future shim
 * regression is caught without needing a device farm.
 */
import { test, expect } from "./helpers/android.js";
import { strToU8, zipSync } from "fflate";

const githubZipBase64 = Buffer.from(
  zipSync({
    "Hello-World-main/README.md": strToU8("# Hello World\n\nAndroid fixture repo.\n"),
    "Hello-World-main/src/index.js": strToU8('console.log("android fixture");\n'),
  }),
).toString("base64");

async function addAssistantMessage(page, text) {
  await page.evaluate((rawText) => {
    window.__mockDeepSeek.addAssistantMessage(rawText);
  }, text);
}

async function openDrawer(page) {
  const drawer = page.locator("#bds-drawer");
  if (await drawer.evaluate((node) => node.classList.contains("bds-open"))) return;
  await page.locator("#bds-toggle").click({ force: true });
  await expect(drawer).toHaveClass(/bds-open/);
}

test("loads the bundle and surfaces the BDS toggle inside the WebView simulator", async ({ page }) => {
  await expect(page.locator("#bds-toggle")).toBeVisible();
});

test("shows the folder upload menu item on Android when native pickFiles is available", async ({ page }) => {
  await page.locator(".bds-plus-btn").click({ force: true });
  await expect(page.locator(".bds-attach-dropdown")).toBeVisible();
  // Native bridge mock includes pickFiles, so supportsFolderUpload is true.
  await expect(
    page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "Upload Folder" }),
  ).toBeVisible();
  await expect(
    page.locator(".bds-attach-dropdown .bds-attach-item").filter({ hasText: "GitHub Repo" }),
  ).toBeVisible();
});

test("Upload Folder button is visible in Projects panel on Android when native bridge available", async ({ page }) => {
  await openDrawer(page);
  await page.locator("#bds-drawer button").filter({ hasText: "Manage" }).click({ force: true });
  await page.locator("#bds-drawer button").filter({ hasText: "New Project" }).click({ force: true });
  await page.locator('#bds-drawer input[placeholder="Project name (required)"]').fill("Folder Test");
  await page.locator("#bds-drawer button").filter({ hasText: "Create" }).click({ force: true });
  await page.locator("#bds-drawer .bds-skill-item").filter({ hasText: "Folder Test" }).click({ force: true });

  // With native pickFiles available, Upload Folder should be visible.
  await expect(
    page.locator("#bds-drawer button").filter({ hasText: "Upload Folder" }),
  ).toBeVisible();
});

test("hides the voice prompt mic button on Android", async ({ page }) => {
  await expect(page.locator(".bds-mic-btn")).toHaveCount(0);
});

test("Upload File on Android uses native pickFiles bridge and injects result", async ({ page }) => {
  // Set up native picker mock to return one file.
  await page.evaluate(() => {
    window.__bdsNativeFilePicker = (_mode) => ({
      files: [{ name: "picked.txt", content: "native content" }],
    });
  });

  await page.locator(".bds-plus-btn").click({ force: true });
  await page
    .locator(".bds-attach-dropdown .bds-attach-item")
    .filter({ hasText: "Upload File" })
    .click({ force: true });

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.getAttachedFiles()))
    .toContain("picked.txt");
});

test("Upload Folder on Android uses native folder pickFiles bridge and builds workspace file", async ({ page }) => {
  await page.evaluate(() => {
    window.__bdsNativeFilePicker = (_mode) => ({
      files: [
        { name: "src/index.js", content: 'console.log("hello");' },
        { name: "README.md", content: "# Project" },
      ],
      folderName: "myProject",
    });
  });

  await page.locator(".bds-plus-btn").click({ force: true });
  await page
    .locator(".bds-attach-dropdown .bds-attach-item")
    .filter({ hasText: "Upload Folder" })
    .click({ force: true });

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.getAttachedFiles()))
    .toContain("myProject_workspace.txt");
});

test("Upload File cancellation on Android leaves input unchanged", async ({ page }) => {
  // Default mock returns cancelled; no files should be injected.
  await page.evaluate(() => {
    window.__bdsNativeFilePicker = (_mode) => ({ files: [], cancelled: true });
  });

  const initialFiles = await page.evaluate(() => window.__mockDeepSeek.getAttachedFiles());

  await page.locator(".bds-plus-btn").click({ force: true });
  await page
    .locator(".bds-attach-dropdown .bds-attach-item")
    .filter({ hasText: "Upload File" })
    .click({ force: true });

  await page.waitForTimeout(300);
  const afterFiles = await page.evaluate(() => window.__mockDeepSeek.getAttachedFiles());
  expect(afterFiles).toHaveLength(initialFiles.length);
});

test("drawer import and upload inputs stay single-file on Android", async ({ page }) => {
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
  await importButtons.nth(0).click({ force: true });
  await importButtons.nth(1).click({ force: true });
  await importButtons.nth(2).click({ force: true });
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

test("project Upload File on Android uses native pickFiles bridge", async ({ page }) => {
  await openDrawer(page);

  // Seed a project directly in chrome.storage rather than going through the
  // multi-step "New Project" UI flow.  The polyfill's set() fires onChanged
  // synchronously, so appState.projects is updated before the evaluate()
  // Promise resolves — no additional wait is needed.
  await page.evaluate(() =>
    chrome.storage.local.set({
      bds_projects: [
        {
          id: "regression-prj",
          name: "Regression Project",
          description: "",
          customInstructions: "",
          createdAt: Date.now(),
        },
      ],
      bds_project_files: { "regression-prj": [] },
    }),
  );

  // Click "Manage" via direct JS rather than Playwright's coordinate-based
  // click.  The drawer is overflow-y: auto and "Manage" sits near the bottom
  // edge on mobile viewports; coordinate-based force-clicks can land on the
  // wrong element when the scroll hasn't settled on slow CI runners.
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("#bds-drawer button")).find(
      (b) => b.textContent.trim() === "Manage",
    );
    btn?.scrollIntoView({ block: "nearest", behavior: "instant" });
    btn?.click();
  });

  // Wait for ProjectsManager to mount and show the seeded project before clicking.
  await page.locator("#bds-drawer .bds-skill-item").filter({ hasText: "Regression Project" }).waitFor();
  await page.locator("#bds-drawer .bds-skill-item").filter({ hasText: "Regression Project" }).click({ force: true });

  // Set up native picker to return one file.
  await page.evaluate(() => {
    window.__bdsNativeFilePicker = (_mode) => ({
      files: [{ name: "project-file.txt", content: "project content" }],
    });
    // Track whether the DOM file input was clicked directly (it should NOT be on Android).
    const input = document.querySelector('#bds-drawer input[type="file"][multiple]');
    window.__mockDeepSeek.projectInputClickedDirectly = false;
    input.addEventListener("click", () => {
      window.__mockDeepSeek.projectInputClickedDirectly = true;
    }, { once: true });
  });

  await page.locator("#bds-drawer button").filter({ hasText: "Upload File" }).click({ force: true });

  // Native bridge should have been called, not the DOM input.
  await page.waitForTimeout(500);
  const clickedDirectly = await page.evaluate(() => window.__mockDeepSeek.projectInputClickedDirectly);
  expect(clickedDirectly).toBe(false);
});

test("imports a GitHub repository and commit history through the Android bridge", async ({ page }) => {
  await page.evaluate((zipBase64) => {
    window.__bdsBridgeRoute = {
      "bds-fetch-github-zip": () => ({
        ok: true,
        base64: zipBase64,
      }),
      "bds-fetch-github-commits": () => ({
        ok: true,
        commits: [
          {
            sha: "abcdef1",
            author: "Android Fixture",
            date: "2026-05-07T10:00:00Z",
            message: "Bridge commit fixture",
          },
        ],
      }),
    };
  }, githubZipBase64);

  await page.locator(".bds-plus-btn").click({ force: true });
  await page
    .locator(".bds-attach-dropdown .bds-attach-item")
    .filter({ hasText: "GitHub Repo" })
    .click({ force: true });
  await page.locator(".bds-github-input").fill("octocat/Hello-World");
  await page.locator(".bds-github-checkbox input").check();
  await page.locator(".bds-github-btn-import").click({ force: true });

  await expect
    .poll(() => page.evaluate(() => window.__mockDeepSeek.getAttachedFiles()))
    .toEqual(["Hello-World_github.txt", "Hello-World_commits.txt"]);
});

test("renders standalone create_file download cards", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:create_file fileName="notes.txt">android body</BDS:create_file>',
  );
  await expect(page.locator(".bds-download-card")).toContainText("notes.txt");
});

test("does NOT inject duplicate Run buttons on re-scan", async ({ page }) => {
  // Add a Python code message — the scanner fires on DOM mutation and via
  // scheduleScan debounce. If the injector is re-entrant, we'd see two
  // "Run Python" buttons on the same code block.
  await page.evaluate(() => {
    window.__mockDeepSeek.addCodeMessage("python", 'print("hello")');
  });
  await page.waitForSelector(".bds-run-btn");
  await page.waitForTimeout(500); // allow debounced re-scan to fire

  // Count buttons across all code blocks — there should be exactly 1 "Run Python"
  const count = await page.evaluate(() =>
    document.querySelectorAll(".bds-run-btn").length,
  );
  expect(count).toBe(1);
});

test("routes blob downloads through AndroidBridge.downloadBlob", async ({ page }) => {
  await addAssistantMessage(
    page,
    '<BDS:create_file fileName="hello.txt">routed-via-bridge</BDS:create_file>',
  );
  await expect(page.locator(".bds-download-card")).toContainText("hello.txt");

  await page.locator(".bds-download-card .bds-btn").click({ force: true });

  await expect
    .poll(async () =>
      page.evaluate(() => (window.__bdsCapturedDownloads || []).length),
    )
    .toBeGreaterThan(0);

  const captured = await page.evaluate(() => window.__bdsCapturedDownloads[0]);
  expect(captured.fileName).toBe("hello.txt");
  expect(captured.base64.length).toBeGreaterThan(0);
});

test("persists settings via the AndroidBridge storage mock", async ({ page }) => {
  await openDrawer(page);
  await page.locator("#bds-system-prompt").fill("Android sim prompt");
  await page.locator("#bds-save-settings").click({ force: true });

  const stored = await page.evaluate(() => {
    const store = window.__bdsAndroidStore;
    for (const [k, v] of store.entries()) {
      if (typeof v === "string" && v.includes("Android sim prompt")) return k;
    }
    return null;
  });
  expect(stored).not.toBeNull();
});
