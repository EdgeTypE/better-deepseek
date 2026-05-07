import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("youtube-transcript", () => ({
  fetchTranscript: vi.fn(),
}));

import {
  fetchGithubCommits,
  normalizeGithubCommitCount,
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
    expect(normalizeGithubCommitCount(600)).toBe(500);
  });
});
