import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("youtube-transcript", () => ({
  fetchTranscript: vi.fn(),
}));

import {
  fetchGithubCommits,
  normalizeGithubCommitCount,
  fetchPageContent,
} from "../../src/background/index.js";

function createJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

describe("background GitHub commits fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("paginates commit history and returns structured commit data", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      sha: `abcdef${String(index).padStart(34, "0")}`,
      commit: {
        author: {
          name: `Author ${index}`,
          date: `2026-05-${String((index % 9) + 1).padStart(2, "0")}T10:00:00Z`,
        },
        message: `Commit ${index}`,
      },
    }));
    const secondPage = Array.from({ length: 20 }, (_, index) => ({
      sha: `fedcba${String(index).padStart(34, "0")}`,
      commit: {
        author: {
          name: `Tail ${index}`,
          date: `2026-05-${String((index % 9) + 1).padStart(2, "0")}T12:00:00Z`,
        },
        message: `Tail commit ${index}`,
      },
    }));

    fetch
      .mockResolvedValueOnce(createJsonResponse(firstPage))
      .mockResolvedValueOnce(createJsonResponse(secondPage));

    const commits = await fetchGithubCommits(
      "owner",
      "repo",
      "feature/test",
      120,
      "ghp_secret",
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain("per_page=100");
    expect(fetch.mock.calls[0][0]).toContain("page=1");
    expect(fetch.mock.calls[0][0]).toContain("sha=feature%2Ftest");
    expect(fetch.mock.calls[1][0]).toContain("per_page=20");
    expect(fetch.mock.calls[1][0]).toContain("page=2");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("token ghp_secret");
    expect(fetch.mock.calls[0][1].headers.Accept).toBe("application/vnd.github+json");
    expect(fetch.mock.calls[0][1].headers["X-GitHub-Api-Version"]).toBeUndefined();
    expect(commits).toHaveLength(120);
    expect(commits[0]).toEqual({
      sha: "abcdef0",
      author: "Author 0",
      date: "2026-05-01T10:00:00Z",
      message: "Commit 0",
    });
    expect(commits[119]).toEqual({
      sha: "fedcba0",
      author: "Tail 19",
      date: "2026-05-02T12:00:00Z",
      message: "Tail commit 19",
    });
  });

  it("marks rejected-token responses as auth failures", async () => {
    fetch.mockResolvedValue(
      new Response("{}", {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    await expect(
      fetchGithubCommits("owner", "repo", "main", 10, "ghp_secret"),
    ).rejects.toMatchObject({
      status: 401,
      authRejected: true,
    });
  });

  it("normalizes background commit counts to the supported range", () => {
    expect(normalizeGithubCommitCount(0)).toBe(1);
    expect(normalizeGithubCommitCount(600)).toBe(600);
  });
});

describe("background bds-fetch-url", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("returns html and status on success", async () => {
    globalThis.fetch.mockResolvedValue(
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await fetchPageContent("https://example.com");
    expect(result.html).toBe("<html>ok</html>");
    expect(result.status).toBe(200);
  });

  it("includes status on HTTP error", async () => {
    globalThis.fetch.mockResolvedValue(
      new Response("Server Error", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    let caught;
    try {
      await fetchPageContent("https://example.com/error");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.message).toContain("503");
    expect(caught.status).toBe(503);
  });

  it("passes credentials and redirect options to fetch", async () => {
    globalThis.fetch.mockResolvedValue(
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await fetchPageContent("https://example.com", {
      method: "GET",
      headers: { Accept: "text/html" },
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });

    const fetchArgs = globalThis.fetch.mock.calls[0];
    expect(fetchArgs[1].cache).toBe("no-store");
    expect(fetchArgs[1].credentials).toBe("omit");
    expect(fetchArgs[1].redirect).toBe("follow");
    expect(fetchArgs[1].method).toBe("GET");
    expect(fetchArgs[1].headers.Accept).toBe("text/html");
  });

  it("throws on missing url", async () => {
    await expect(fetchPageContent("")).rejects.toThrow("No URL provided");
  });
});
