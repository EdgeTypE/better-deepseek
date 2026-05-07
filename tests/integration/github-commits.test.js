// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_GITHUB_COMMIT_COUNT,
  MIN_GITHUB_COMMIT_COUNT,
  buildGitHubCommitsFetchError,
  buildGitHubCommitsText,
  fetchGitHubCommits,
  normalizeGitHubCommitCount,
} from "../../src/content/files/github-commits.js";

async function readFileText(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });
}

describe("github-commits integration", () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockReset();
  });

  it("normalizes commit counts into the supported UI range", () => {
    expect(normalizeGitHubCommitCount(0)).toBe(MIN_GITHUB_COMMIT_COUNT);
    expect(normalizeGitHubCommitCount(999)).toBe(MAX_GITHUB_COMMIT_COUNT);
    expect(normalizeGitHubCommitCount("42")).toBe(42);
  });

  it("formats commit history into a readable text file", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      commits: [
        {
          sha: "abcdef1",
          author: "Alice",
          date: "2026-05-06T10:00:00Z",
          message: "Fix sidebar\nAdd test",
        },
      ],
    });

    const statuses = [];
    const file = await fetchGitHubCommits(
      "owner/repo",
      5,
      (status) => statuses.push(status),
      { token: "ghp_secret", branch: "feature/ui" },
    );
    const text = await readFileText(file);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "bds-fetch-github-commits",
      owner: "owner",
      repo: "repo",
      branch: "feature/ui",
      count: 5,
      token: "ghp_secret",
    });
    expect(file.name).toBe("repo_commits.txt");
    expect(text).toContain("Commits for owner/repo (feature/ui)");
    expect(text).toContain("1. abcdef1 - Alice - 2026-05-06T10:00:00Z");
    expect(text).toContain("   Fix sidebar");
    expect(text).toContain("   Add test");
    expect(statuses).toContain("Creating commit history file...");
  });

  it("builds consistent error messages for rate limits and private repos", () => {
    expect(
      buildGitHubCommitsFetchError({ rateLimited: true }).message,
    ).toBe("GitHub API rate limit hit. Add a token for more requests.");
    expect(
      buildGitHubCommitsText({
        owner: "owner",
        repo: "repo",
        branch: "main",
        requestedCount: 1,
        commits: [],
      }),
    ).toContain("No commits were returned.");
    expect(
      buildGitHubCommitsFetchError({ status: 404 }).message,
    ).toContain("Advanced Settings");
  });
});
