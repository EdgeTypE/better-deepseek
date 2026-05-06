// @vitest-environment jsdom

import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildGitHubFetchError,
  decodeZipBase64,
  fetchGitHubRepo,
  parseGitHubUrl,
  preferGitHubFailure,
} from "../../src/content/files/github-reader.js";
import { resetAppState } from "../helpers/app-state.js";

function zipToBase64(files) {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
    ),
  );
  return btoa(String.fromCharCode(...zipped));
}

async function readFileText(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

describe("github-reader integration", () => {
  beforeEach(() => {
    resetAppState();
    chrome.runtime.sendMessage.mockReset();
  });

  it("parses shorthand and full github urls", () => {
    expect(parseGitHubUrl("owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "main",
    });
    expect(parseGitHubUrl("https://github.com/owner/repo/tree/feature/x")).toEqual({
      owner: "owner",
      repo: "repo",
      branch: "feature/x",
    });
    expect(parseGitHubUrl("https://example.com/nope")).toBeNull();
  });

  it("decodes zip payloads from base64", () => {
    expect(Array.from(decodeZipBase64("SGVsbG8="))).toEqual(
      Array.from(new TextEncoder().encode("Hello")),
    );
  });

  it("prefers stronger github failures", () => {
    expect(preferGitHubFailure({ status: 404 }, { authRejected: true, status: 403 })).toEqual({
      authRejected: true,
      status: 403,
    });
    expect(buildGitHubFetchError({ status: 404 }).message).toContain("Repository not found");
  });

  it("fetches, filters, and concatenates a github repository", async () => {
    const base64 = zipToBase64({
      "repo-main/.gitignore": "ignored.txt\n",
      "repo-main/src/app.js": "console.log('hi');",
      "repo-main/README.md": "# Demo",
      "repo-main/ignored.txt": "skip me",
      "repo-main/image.png": "png",
    });

    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, base64 });
    const statusUpdates = [];

    const file = await fetchGitHubRepo("owner/repo", (status) => statusUpdates.push(status));
    const text = await readFileText(file);

    expect(file.name).toBe("repo_github.txt");
    expect(text).toContain("Repository: owner/repo/main");
    expect(text).toContain("Directory Tree:");
    expect(text.length).toBeGreaterThan(60);
    expect(statusUpdates).toContain("Creating file...");
  });

  it("falls back from main to master when needed", async () => {
    const base64 = zipToBase64({ "repo-master/index.js": "export {};" });
    chrome.runtime.sendMessage
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, base64 });

    await fetchGitHubRepo("owner/repo");

    expect(chrome.runtime.sendMessage.mock.calls[0][0].url).toContain("/main");
    expect(chrome.runtime.sendMessage.mock.calls[1][0].url).toContain("/master");
  });

  it("surfaces auth failures and invalid urls", async () => {
    await expect(fetchGitHubRepo("not a repo")).rejects.toThrow("Invalid GitHub URL");

    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      status: 403,
      authRejected: true,
    });

    await expect(fetchGitHubRepo("owner/repo")).rejects.toThrow("GitHub rejected your token");
  });
});
