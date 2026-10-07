import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("youtube-transcript", () => ({
  fetchTranscript: vi.fn(),
}));

import { fetchRepoMetadata, fetchRepoText, fetchRepoZip } from "../../src/background/index.js";

// readZipResponse rejects payloads under 100 bytes as "not a ZIP".
function createZipResponse(bytes = new Uint8Array(128).fill(7)) {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/zip" },
  });
}

const GITLAB_ARCHIVE =
  "https://gitlab.com/api/v4/projects/group%2Fproject/repository/archive.zip?sha=main";

describe("background repo archive fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("refuses hosts outside the allowlist", async () => {
    await expect(fetchRepoZip("https://evil.example.com/repo.zip")).rejects.toThrow(
      /unrecognized repository host/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses gitlab's web archive route, which 406s on a cross-site Origin", async () => {
    // The web route rejects any request carrying Origin (406), and a browser
    // always sends Origin cross-origin. Blocking it here turns a confusing
    // network failure into an explicit refusal.
    await expect(
      fetchRepoZip(
        "https://gitlab.com/group/project/-/archive/main/project-main.zip",
      ),
    ).rejects.toThrow(/unrecognized repository host/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches a gitlab archive without sending a token", async () => {
    fetch.mockResolvedValueOnce(createZipResponse());

    const base64 = await fetchRepoZip(GITLAB_ARCHIVE, "ghp_secret");

    expect(fetch).toHaveBeenCalledTimes(1);
    // No init object at all → no Authorization header left for another host.
    expect(fetch.mock.calls[0][1]).toBeUndefined();
    expect(typeof base64).toBe("string");
  });

  it("fetches a codeberg archive without sending a token", async () => {
    fetch.mockResolvedValueOnce(createZipResponse());

    await fetchRepoZip(
      "https://codeberg.org/api/v1/repos/owner/repo/archive/main.zip",
      "ghp_secret",
    );

    expect(fetch.mock.calls[0][1]).toBeUndefined();
  });

  it("sends the github token only to codeload", async () => {
    fetch.mockResolvedValueOnce(createZipResponse());

    await fetchRepoZip(
      "https://codeload.github.com/owner/repo/zip/refs/heads/main",
      "ghp_secret",
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("token ghp_secret");
  });

  it("does not silently retry with an anonymous request when the token is rejected", async () => {
    // Known behavior worth pinning: a 401/403 from codeload throws immediately
    // instead of falling back to an anonymous fetch. That is intentional — a
    // rejected token almost always means a private repo, where the anonymous
    // retry would 404 and produce a misleading "not found" message.
    fetch.mockResolvedValueOnce(new Response("bad creds", { status: 401 }));

    await expect(
      fetchRepoZip(
        "https://codeload.github.com/owner/repo/zip/refs/heads/main",
        "ghp_expired",
      ),
    ).rejects.toThrow(/rejected the supplied token/);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("token ghp_expired");
  });

  it("never leaks the token to a non-github host", async () => {
    fetch.mockResolvedValueOnce(createZipResponse());

    await fetchRepoZip(GITLAB_ARCHIVE, "ghp_secret");

    const init = fetch.mock.calls[0][1];
    expect(init).toBeUndefined();
    expect(JSON.stringify(init ?? {})).not.toContain("ghp_secret");
  });

  it("reports the status when the host returns an error", async () => {
    fetch.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    await expect(fetchRepoZip(GITLAB_ARCHIVE)).rejects.toThrow(/404/);
  });
});

describe("background raw repository file fetch", () => {
  const RAW =
    "https://gitlab.com/api/v4/projects/group%2Fproject/repository/files/src%2Fapp.js/raw?ref=main";

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("returns the file text for an allowlisted raw endpoint", async () => {
    fetch.mockResolvedValueOnce(new Response("console.log('hi');", { status: 200 }));

    await expect(fetchRepoText(RAW)).resolves.toBe("console.log('hi');");
    expect(fetch).toHaveBeenCalledTimes(1);
    // Never sends a credential.
    expect(fetch.mock.calls[0][1]).toBeUndefined();
  });

  it("refuses non-allowlisted hosts", async () => {
    await expect(
      fetchRepoText("https://evil.example.com/api/v4/projects/x/repository/files/a/raw"),
    ).rejects.toThrow(/unrecognized repository host/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses gitlab web routes that are not part of the API allowlist", async () => {
    await expect(
      fetchRepoText("https://gitlab.com/group/project/-/raw/main/README.md"),
    ).rejects.toThrow(/unrecognized repository host/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses API paths that are not raw-file reads", async () => {
    await expect(
      fetchRepoText("https://gitlab.com/api/v4/projects/group%2Fproject"),
    ).rejects.toThrow(/unrecognized repository host/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports the status when the raw endpoint fails", async () => {
    fetch.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    await expect(fetchRepoText(RAW)).rejects.toThrow(/404/);
  });

  it("accepts huggingface resolve urls for models, datasets and spaces", async () => {
    for (const url of [
      "https://huggingface.co/google-bert/bert-base-uncased/resolve/main/README.md",
      "https://huggingface.co/datasets/rajpurkar/squad/resolve/main/README.md",
      "https://huggingface.co/spaces/gradio/hello_world/resolve/main/app.py",
    ]) {
      fetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
      await expect(fetchRepoText(url)).resolves.toBe("ok");
      expect(fetch.mock.calls.at(-1)[1]).toBeUndefined();
    }
  });

  it("refuses huggingface web and cache routes that are not resolve paths", async () => {
    // The 307 target (`/api/resolve-cache/...`) is followed internally by fetch;
    // it is never handed to the worker, and must not be reachable directly.
    for (const url of [
      "https://huggingface.co/google-bert/bert-base-uncased",
      "https://huggingface.co/google-bert/bert-base-uncased/tree/main",
      "https://huggingface.co/api/resolve-cache/models/a/b/c/README.md",
      "https://huggingface.co/datasets/rajpurkar/squad",
    ]) {
      await expect(fetchRepoText(url)).rejects.toThrow(
        /unrecognized repository host/,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a huggingface resolve path with the wrong number of segments", async () => {
    // Repo ids are exactly `owner/repo`, so a shallow or padded path is not a
    // repository file and must not be fetched.
    for (const url of [
      "https://huggingface.co/a/resolve/main/README.md",
      "https://huggingface.co/a/b/c/resolve/main/README.md",
    ]) {
      await expect(fetchRepoText(url)).rejects.toThrow(
        /unrecognized repository host/,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("background repository metadata fetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("accepts the gitlab project and tree endpoints", async () => {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "master" }), { status: 200 }),
    );

    await expect(
      fetchRepoMetadata("https://gitlab.com/api/v4/projects/a%2Fb"),
    ).resolves.toEqual({ default_branch: "master" });
  });

  it("accepts the codeberg repo api (used to read default_branch)", async () => {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "forgejo" }), { status: 200 }),
    );

    await expect(
      fetchRepoMetadata("https://codeberg.org/api/v1/repos/forgejo/forgejo"),
    ).resolves.toEqual({ default_branch: "forgejo" });
  });

  it("refuses codeberg web pages and non-api paths", async () => {
    for (const url of [
      "https://codeberg.org/forgejo/forgejo",
      "https://codeberg.org/forgejo/forgejo/src/branch/forgejo",
      "https://codeberg.org/forgejo/forgejo/raw/branch/forgejo/README.md",
    ]) {
      await expect(fetchRepoMetadata(url)).rejects.toThrow(
        /unrecognized metadata host/,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("admits the whole codeberg api surface, like gitlab's — only web routes are blocked", async () => {
    // Deliberate, and identical to how gitlab.com/api/v4/ behaves: the
    // allowlist admits the API surface rather than one endpoint. The archive
    // route therefore also passes here, but it is fetched through the separate
    // `bds-fetch-repo-zip` path, which has its own allowlist.
    fetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(
      fetchRepoMetadata(
        "https://codeberg.org/api/v1/repos/forgejo/forgejo/archive/main.zip",
      ),
    ).resolves.toEqual({});
  });

  it("has no codeberg single-file endpoint", async () => {
    // Codeberg's archive serves the whole repository, so it never needs a
    // file-by-file read — and must not become reachable through that allowlist.
    for (const url of [
      "https://codeberg.org/api/v1/repos/a/b/raw/README.md",
      "https://codeberg.org/api/v1/repos/a/b/contents/README.md",
      "https://codeberg.org/a/b/raw/branch/main/README.md",
    ]) {
      await expect(fetchRepoText(url)).rejects.toThrow(
        /unrecognized repository host/,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts the huggingface model, dataset and space APIs", async () => {
    for (const url of [
      "https://huggingface.co/api/models/a/b",
      "https://huggingface.co/api/models/a/b/tree/main?recursive=true",
      "https://huggingface.co/api/datasets/a/b",
      "https://huggingface.co/api/spaces/a/b/tree/main?recursive=true",
    ]) {
      fetch.mockResolvedValueOnce(new Response("[]", { status: 200 }));
      await expect(fetchRepoMetadata(url)).resolves.toEqual([]);
    }
  });

  it("refuses huggingface web pages and other hosts", async () => {
    for (const url of [
      "https://huggingface.co/a/b",
      "https://huggingface.co/a/b/tree/main",
      "https://evil.example.com/api/models/a/b",
    ]) {
      await expect(fetchRepoMetadata(url)).rejects.toThrow(
        /unrecognized metadata host/,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses gitlab web routes that are not part of the API allowlist", async () => {
    await expect(
      fetchRepoMetadata("https://gitlab.com/group/project"),
    ).rejects.toThrow(/unrecognized metadata host/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
