import { parseGitHubUrl } from "./github-reader.js";
import {
  DEFAULT_GITHUB_COMMIT_COUNT,
  MIN_GITHUB_COMMIT_COUNT,
  normalizeGitHubCommitCount,
} from "../../lib/github-commits.js";

export {
  DEFAULT_GITHUB_COMMIT_COUNT,
  MIN_GITHUB_COMMIT_COUNT,
  normalizeGitHubCommitCount,
};

function normalizeCommitField(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function formatGitHubCommitEntry(commit, index) {
  const sha = normalizeCommitField(commit?.sha, "unknown");
  const author = normalizeCommitField(commit?.author, "Unknown author");
  const date = normalizeCommitField(commit?.date, "unknown date");
  const rawMessage = normalizeCommitField(commit?.message, "(no message)");
  const messageLines = rawMessage.replace(/\r\n/g, "\n").split("\n");
  const entryLines = [
    `${index + 1}. ${sha} - ${author} - ${date}`,
    `   ${messageLines[0]}`,
  ];

  for (const extraLine of messageLines.slice(1)) {
    entryLines.push(`   ${extraLine}`);
  }

  return entryLines.join("\n");
}

export function buildGitHubCommitsText({
  owner,
  repo,
  branch,
  requestedCount,
  commits,
}) {
  const lines = [
    `Commits for ${owner}/${repo} (${branch})`,
    `Requested commits: ${normalizeGitHubCommitCount(requestedCount)}`,
    `Returned commits: ${Array.isArray(commits) ? commits.length : 0}`,
    "",
  ];

  if (!Array.isArray(commits) || commits.length === 0) {
    lines.push("No commits were returned.");
    return `${lines.join("\n")}\n`;
  }

  for (let index = 0; index < commits.length; index++) {
    lines.push(formatGitHubCommitEntry(commits[index], index));
    if (index < commits.length - 1) {
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

export function createGitHubCommitsFile(metadata, commits, requestedCount) {
  const text = buildGitHubCommitsText({
    owner: metadata.owner,
    repo: metadata.repo,
    branch: metadata.branch,
    requestedCount,
    commits,
  });
  return new File([text], `${metadata.repo}_commits.txt`, {
    type: "text/plain",
  });
}

export function buildGitHubCommitsFetchError(
  result,
  fallbackMessage = "Failed to fetch commit history.",
) {
  if (result?.authRejected) {
    return new Error(
      "GitHub rejected your token. Check that it has the `repo` scope and has not expired.",
    );
  }

  if (result?.rateLimited) {
    const error = new Error(
      "GitHub API rate limit hit. Add a token for more requests.",
    );
    error.rateLimited = true;
    return error;
  }

  if (result?.status === 404) {
    return new Error(
      "Repository not found or you may need a GitHub token for private repos. Add one in Advanced Settings.",
    );
  }

  return new Error(result?.error || fallbackMessage);
}

export async function fetchGitHubCommits(
  repoUrl,
  count,
  onStatus = () => { },
  options = {},
) {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    throw new Error("Invalid GitHub URL. Use: https://github.com/owner/repo");
  }

  const metadata = {
    owner: parsed.owner,
    repo: parsed.repo,
    branch: normalizeCommitField(options.branch || parsed.branch, "main"),
  };
  const normalizedCount = normalizeGitHubCommitCount(count);
  const token = normalizeCommitField(options.token, "");

  onStatus(
    `Fetching up to ${normalizedCount} recent commits for ${metadata.owner}/${metadata.repo} (${metadata.branch})...`,
  );

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: "bds-fetch-github-commits",
      owner: metadata.owner,
      repo: metadata.repo,
      branch: metadata.branch,
      count: normalizedCount,
      token: token || undefined,
    });
  } catch (error) {
    throw buildGitHubCommitsFetchError({
      error: String(error?.message || error),
    });
  }

  if (!result?.ok || !Array.isArray(result.commits)) {
    throw buildGitHubCommitsFetchError(result);
  }

  onStatus("Creating commit history file...");
  return createGitHubCommitsFile(metadata, result.commits, normalizedCount);
}
