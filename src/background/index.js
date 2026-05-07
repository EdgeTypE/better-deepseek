import { fetchTranscript } from "youtube-transcript";

export const DEFAULT_GITHUB_COMMIT_COUNT = 100;
export const GITHUB_COMMITS_PAGE_SIZE = 100;
export const MAX_GITHUB_COMMIT_COUNT = 500;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "bds-get-youtube-transcript") {
    fetchTranscript(message.videoId)
      .then((transcript) => {
        sendResponse({ ok: true, transcript });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
        });
      });
    return true;
  }

  if (message.type === "bds-fetch-github-zip") {
    fetchGithubZip(message.url, message.token)
      .then((base64) => {
        sendResponse({ ok: true, base64 });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
          status:
            error && Number.isFinite(error.status) ? Number(error.status) : null,
          authRejected: Boolean(error && error.authRejected),
        });
      });
    return true;
  }

  if (message.type === "bds-fetch-github-commits") {
    fetchGithubCommits(
      message.owner,
      message.repo,
      message.branch,
      message.count,
      message.token,
    )
      .then((commits) => {
        sendResponse({ ok: true, commits });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
          status:
            error && Number.isFinite(error.status) ? Number(error.status) : null,
          authRejected: Boolean(error && error.authRejected),
          rateLimited: Boolean(error && error.rateLimited),
        });
      });
    return true;
  }

  if (message.type === "bds-fetch-url") {
    fetchPageContent(message.url, message.options)
      .then((html) => {
        sendResponse({ ok: true, html });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
        });
      });
    return true;
  }

  return false;
});



function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length)
    );
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function createGithubFetchError(message, options = {}) {
  const error = new Error(message);
  if (Number.isFinite(options.status)) {
    error.status = Number(options.status);
  }
  if (options.authRejected) {
    error.authRejected = true;
  }
  if (options.rateLimited) {
    error.rateLimited = true;
  }
  return error;
}

export function normalizeGithubCommitCount(count) {
  const parsed = Number.parseInt(String(count), 10);
  const normalized = Number.isFinite(parsed)
    ? parsed
    : DEFAULT_GITHUB_COMMIT_COUNT;
  return Math.min(
    MAX_GITHUB_COMMIT_COUNT,
    Math.max(1, normalized),
  );
}

function buildGithubApiHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const trimmedToken = String(token || "").trim();
  if (trimmedToken) {
    headers.Authorization = `token ${trimmedToken}`;
  }
  return headers;
}

function buildGithubCommitsUrl(owner, repo, branch, perPage, page) {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`);
  url.searchParams.set("sha", branch);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  return url.toString();
}

function isGithubRateLimitResponse(resp, bodyText) {
  const remaining = Number.parseInt(
    String(resp.headers.get("x-ratelimit-remaining") || ""),
    10,
  );
  return (
    (resp.status === 403 || resp.status === 429) &&
    (
      remaining === 0 ||
      String(bodyText || "").toLowerCase().includes("api rate limit exceeded")
    )
  );
}

function normalizeGithubCommit(commit) {
  const commitData = commit && commit.commit ? commit.commit : {};
  const authorData = commitData.author || commitData.committer || {};
  const sha = String(commit && commit.sha ? commit.sha : "").trim();
  const author = String(authorData.name || "").trim() || "Unknown author";
  const date = String(authorData.date || "").trim() || "unknown date";
  const message = String(commitData.message || "").trim() || "(no message)";

  return {
    sha: sha ? sha.slice(0, 7) : "unknown",
    author,
    date,
    message,
  };
}

function canSendGithubToken(url) {
  try {
    return new URL(url).hostname === "codeload.github.com";
  } catch {
    return false;
  }
}

async function readZipResponse(resp, url) {
  if (!resp.ok) {
    throw createGithubFetchError(`GitHub returned ${resp.status} for ${url}`, {
      status: resp.status,
    });
  }

  const arrayBuffer = await resp.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength < 100) {
    throw new Error("Received empty or invalid ZIP.");
  }

  const bytes = new Uint8Array(arrayBuffer);
  return bytesToBase64(bytes);
}

async function fetchGithubZip(url, token) {
  if (!url) throw new Error("No URL provided.");

  const trimmedToken = String(token || "").trim();
  const shouldUseToken = Boolean(trimmedToken) && canSendGithubToken(url);

  if (shouldUseToken) {
    let authResponse = null;

    try {
      authResponse = await fetch(url, {
        headers: {
          Authorization: `token ${trimmedToken}`,
        },
      });

      if (authResponse.ok) {
        return await readZipResponse(authResponse, url);
      }

      if (authResponse.status === 401 || authResponse.status === 403) {
        throw createGithubFetchError(
          `GitHub rejected the supplied token for ${url}`,
          {
            status: authResponse.status,
            authRejected: true,
          }
        );
      }
    } catch (error) {
      if (error && error.authRejected) {
        throw error;
      }
      authResponse = null;
    }

    const fallbackResponse = await fetch(url);
    if (fallbackResponse.ok) {
      return await readZipResponse(fallbackResponse, url);
    }

    throw createGithubFetchError(
      `GitHub returned ${fallbackResponse.status} for ${url}`,
      {
        status: fallbackResponse.status,
      }
    );
  }

  return await readZipResponse(await fetch(url), url);
}

export async function fetchGithubCommits(owner, repo, branch, count, token) {
  const safeOwner = String(owner || "").trim();
  const safeRepo = String(repo || "").trim();
  const safeBranch = String(branch || "").trim() || "main";
  const trimmedToken = String(token || "").trim();
  const normalizedCount = normalizeGithubCommitCount(count);

  if (!safeOwner || !safeRepo) {
    throw new Error("Missing GitHub repository.");
  }

  const commits = [];
  let page = 1;

  // GitHub's commits REST endpoint is capped at 100 items per page, so
  // counts above that require pagination even though the UI allows up to 500.
  while (commits.length < normalizedCount) {
    const remaining = normalizedCount - commits.length;
    const perPage = Math.min(GITHUB_COMMITS_PAGE_SIZE, remaining);
    const url = buildGithubCommitsUrl(
      safeOwner,
      safeRepo,
      safeBranch,
      perPage,
      page,
    );
    const resp = await fetch(url, {
      headers: buildGithubApiHeaders(trimmedToken),
    });

    if (!resp.ok) {
      const bodyText = await resp.text();

      if (isGithubRateLimitResponse(resp, bodyText)) {
        throw createGithubFetchError(
          "GitHub API rate limit hit. Add a token for more requests.",
          {
            status: resp.status,
            rateLimited: true,
          }
        );
      }

      if (trimmedToken && (resp.status === 401 || resp.status === 403)) {
        throw createGithubFetchError(
          `GitHub rejected the supplied token for ${safeOwner}/${safeRepo}`,
          {
            status: resp.status,
            authRejected: true,
          }
        );
      }

      if (resp.status === 404) {
        throw createGithubFetchError(
          "Repository not found or you may need a GitHub token for private repos. Add one in Advanced Settings.",
          {
            status: resp.status,
          }
        );
      }

      throw createGithubFetchError(
        `GitHub returned ${resp.status} ${resp.statusText}`.trim(),
        {
          status: resp.status,
        }
      );
    }

    const data = await resp.json();
    if (!Array.isArray(data)) {
      throw new Error("Unexpected GitHub commits response.");
    }

    for (const item of data) {
      if (commits.length >= normalizedCount) {
        break;
      }
      commits.push(normalizeGithubCommit(item));
    }

    if (data.length < perPage) {
      break;
    }

    page += 1;
  }

  return commits;
}

async function fetchPageContent(url, options = {}) {
  if (!url) throw new Error("No URL provided.");

  const fetchOptions = {
    method: options.method || 'GET',
    headers: options.headers || {},
  };

  if (options.body) {
    fetchOptions.body = options.body;
  }

  const resp = await fetch(url, fetchOptions);
  if (!resp.ok) {
    throw new Error(`Server returned ${resp.status} for ${url}`);
  }

  return await resp.text();
}

// Update detection for "What's New" popup
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    chrome.storage.local.set({ bds_whats_new_pending: true });
  }
});
