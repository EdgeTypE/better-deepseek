import "./api-proxy.js";
import { fetchTranscript } from "youtube-transcript";
import {
  DEFAULT_GITHUB_COMMIT_COUNT,
  GITHUB_COMMITS_PAGE_SIZE,
  normalizeGitHubCommitCount,
} from "../lib/github-commits.js";

export {
  DEFAULT_GITHUB_COMMIT_COUNT,
  GITHUB_COMMITS_PAGE_SIZE,
};

export { fetchPageContent };

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
      .then((result) => {
        sendResponse({ ok: true, html: result.html, status: result.status });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error && error.message ? error.message : error),
          status: error.status || null,
        });
      });
    return true;
  }

  if (message.type === "BDS_UPDATE_LANGUAGES") {
    handleLanguageUpdate()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "BDS_RESET_LANGUAGES") {
    handleLanguageReset()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
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
  return normalizeGitHubCommitCount(count);
}

function buildGithubApiHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
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

/**
 * Detect character encoding from HTTP headers or HTML meta tags.
 * Returns a charset string or null if none is found.
 */
function detectCharsetFromHeaders(resp) {
  const contentType = resp.headers.get("content-type");
  if (!contentType) return null;
  const match = contentType.match(/charset\s*=\s*([^\s;]+)/i);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

function detectCharsetFromHtml(buffer) {
  const scanView = new TextDecoder("latin1").decode(buffer.slice(0, 10240));

  let match = scanView.match(/<meta[\s>][^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)\s*["']?[^>]*\/?>/i);
  if (match) return match[1];

  match = scanView.match(/<meta\s+http-equiv\s*=\s*["']?\s*Content-Type\s*["']?\s*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];

  return null;
}

async function fetchPageContent(url, options = {}) {
  if (!url) throw new Error("No URL provided.");
  const safeOptions = options && typeof options === "object" ? options : {};

  const fetchOptions = {
    method: safeOptions.method || "GET",
    headers: safeOptions.headers || {},
  };

  if (safeOptions.body) {
    fetchOptions.body = safeOptions.body;
  }

  if (safeOptions.cache) {
    fetchOptions.cache = safeOptions.cache;
  }
  if (safeOptions.credentials) {
    fetchOptions.credentials = safeOptions.credentials;
  }
  if (safeOptions.redirect) {
    fetchOptions.redirect = safeOptions.redirect;
  }

  const resp = await fetch(url, fetchOptions);
  if (!resp.ok) {
    const error = new Error(`Server returned ${resp.status} for ${url}`);
    error.status = resp.status;
    throw error;
  }

  const buffer = await resp.arrayBuffer();

  let charset = detectCharsetFromHeaders(resp);
  if (!charset) {
    charset = detectCharsetFromHtml(buffer);
  }

  let html;
  try {
    html = new TextDecoder(charset || "utf-8", { fatal: false }).decode(buffer);
  } catch {
    html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }

  return { html, status: resp.status };
}

// Open chat.deepseek.com when the extension toolbar icon is clicked
if (chrome.action) {
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "https://chat.deepseek.com" });
  });
}

// Update detection for "What's New" popup
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    chrome.storage.local.set({ bds_whats_new_pending: true });
  }
});

import {
  persistRemoteConfig,
  persistRemoteStatus,
  persistLocales,
} from "../lib/remote-persistence.js";

const storageAdapter = {
  get: (key) => chrome.storage.local.get(key),
  set: (values) => chrome.storage.local.set(values),
};

// Run once on startup
persistRemoteStatus({ fetch, storage: storageAdapter });
persistRemoteConfig({ fetch, storage: storageAdapter });

const localeMods = import.meta.glob("../locales/*.json", { eager: true });
const localeCodes = Object.keys(localeMods)
  .map(p => p.match(/([^/\\]+)\.json$/)?.[1])
  .filter(Boolean);

async function handleLanguageUpdate() {
  return persistLocales({ fetch, storage: storageAdapter }, localeCodes);
}

async function handleLanguageReset() {
  try {
    await chrome.storage.local.remove([
      "bds_locale_updates",
      "bds_locale_update_last_checked"
    ]);
    return { success: true };
  } catch (err) {
    console.error("Failed to reset language files:", err);
    return { success: false, error: err.message };
  }
}
