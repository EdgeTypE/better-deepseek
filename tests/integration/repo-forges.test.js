import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildGitLabArchiveUrl,
  buildGitLabProjectApiUrl,
  buildGitLabRawFileUrl,
  buildGitLabTreeUrl,
  fetchGitLabRepo,
  parseGitLabUrl,
} from "../../src/content/files/gitlab-reader.js";
import {
  buildCodebergArchiveUrl,
  buildCodebergRepoApiUrl,
  fetchCodebergRepo,
  parseCodebergUrl,
} from "../../src/content/files/codeberg-reader.js";
import {
  buildHuggingFaceFileUrl,
  buildHuggingFaceInfoUrl,
  buildHuggingFaceTreeUrl,
  fetchHuggingFaceRepo,
  isHuggingFaceModelFile,
  parseHuggingFaceUrl,
} from "../../src/content/files/huggingface-reader.js";
import { MAX_FILE_BYTES } from "../../src/content/files/repo-archive.js";
import {
  describeRepoForgeUrl,
  isRepoShorthand,
  REPO_FORGES,
  resolveRepoForgeKey,
} from "../../src/content/files/repo-forges.js";
import { resetAppState } from "../helpers/app-state.js";

/**
 * NOTE: this file deliberately runs in the node environment, not jsdom.
 *
 * jsdom's TextEncoder produces a Uint8Array from a different JS realm, so
 * fflate cannot recognize it as a byte array and `zipSync` silently emits
 * garbage entries ("a/b.txt/0/", "a/b.txt/1/", ...). The suite then passes
 * while testing nothing. Node's globals give us a real TextEncoder plus
 * File/Blob with a working `.text()`, which is what production actually sees.
 */
async function readFileText(file) {
  return await file.text();
}

function zipToBase64(files) {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
    ),
  );
  return btoa(String.fromCharCode(...zipped));
}

/**
 * Stand in for the background worker's GitLab endpoints.
 *
 * `zip` defaults to null, which reproduces production: GitLab answers 406 to
 * anonymous archive downloads, so the reader must fall through to the tree API.
 */
function mockGitLab({
  defaultBranch = "main",
  tree = [],
  files = {},
  zip = null,
  projectStatus = null,
} = {}) {
  chrome.runtime.sendMessage.mockImplementation(async (message) => {
    // A private/missing project rejects every call with the same status.
    if (projectStatus) {
      return { ok: false, status: projectStatus, error: `HTTP ${projectStatus}` };
    }

    if (message.type === "bds-fetch-repo-metadata") {
      if (message.url.includes("/repository/tree")) {
        return { ok: true, data: tree };
      }
      return { ok: true, data: { default_branch: defaultBranch } };
    }

    if (message.type === "bds-fetch-repo-text") {
      for (const [path, content] of Object.entries(files)) {
        if (message.url.includes(`/files/${encodeURIComponent(path)}/raw`)) {
          return { ok: true, text: content };
        }
      }
      return { ok: false, status: 404, error: "404" };
    }

    if (message.type === "bds-fetch-repo-zip") {
      if (zip) return { ok: true, base64: zip };
      // The real GitLab response for anonymous browser archive downloads.
      return { ok: false, status: 406, error: "gitlab.com returned 406" };
    }

    return { ok: false, error: "unexpected message" };
  });
}

describe("gitlab-reader integration", () => {
  beforeEach(() => {
    resetAppState();
    chrome.runtime.sendMessage.mockReset();
  });

  it("parses full, nested, tree, and shorthand urls", () => {
    expect(parseGitLabUrl("https://gitlab.com/group/project")).toEqual({
      namespace: "group",
      project: "project",
      ref: "main",
    });
    expect(parseGitLabUrl("https://gitlab.com/a/b/c")).toEqual({
      namespace: "a/b",
      project: "c",
      ref: "main",
    });
    expect(parseGitLabUrl("https://gitlab.com/a/b/-/tree/dev")).toEqual({
      namespace: "a",
      project: "b",
      ref: "dev",
    });
    expect(parseGitLabUrl("a/b")).toEqual({
      namespace: "a",
      project: "b",
      ref: "main",
    });
    expect(parseGitLabUrl("https://gitlab.com/a/b.git")).toEqual({
      namespace: "a",
      project: "b",
      ref: "main",
    });
  });

  it("rejects non-gitlab hosts and malformed input", () => {
    expect(parseGitLabUrl("https://github.com/a/b")).toBeNull();
    expect(parseGitLabUrl("")).toBeNull();
    expect(parseGitLabUrl("https://gitlab.com/onlyone")).toBeNull();
  });

  it("builds the API v4 archive url (the one bulk route worth trying)", () => {
    expect(
      buildGitLabArchiveUrl({ namespace: "a/b", project: "c", ref: "feat/x" }),
    ).toBe(
      "https://gitlab.com/api/v4/projects/a%2Fb%2Fc/repository/archive.zip?sha=feat%2Fx",
    );
  });

  it("omits sha when no ref is known so GitLab serves the default branch", () => {
    expect(buildGitLabArchiveUrl({ namespace: "a", project: "b", ref: "" })).toBe(
      "https://gitlab.com/api/v4/projects/a%2Fb/repository/archive.zip",
    );
  });

  it("builds the project metadata url with an encoded full path", () => {
    expect(
      buildGitLabProjectApiUrl({
        namespace: "a/wayne-enterprises/wayne-industries",
        project: "microservice",
      }),
    ).toBe(
      "https://gitlab.com/api/v4/projects/a%2Fwayne-enterprises%2Fwayne-industries%2Fmicroservice",
    );
  });

  it("builds a recursive, paginated tree url", () => {
    expect(
      buildGitLabTreeUrl({ namespace: "a/b", project: "c", ref: "dev", page: 3 }),
    ).toBe(
      "https://gitlab.com/api/v4/projects/a%2Fb%2Fc/repository/tree" +
        "?recursive=true&per_page=100&page=3&ref=dev",
    );
  });

  it("builds a raw-file url with the path fully encoded (slashes included)", () => {
    expect(
      buildGitLabRawFileUrl({
        namespace: "a/b",
        project: "c",
        ref: "main",
        path: "src/lib/app.js",
      }),
    ).toBe(
      "https://gitlab.com/api/v4/projects/a%2Fb%2Fc/repository/files/src%2Flib%2Fapp.js/raw?ref=main",
    );
  });

  it("falls back to the tree API when the archive endpoint answers 406", async () => {
    // The core regression: GitLab refuses anonymous archive downloads with 406
    // from every route, so a keyless import has to read the repository through
    // the tree + raw-file API instead.
    mockGitLab({
      tree: [
        { type: "tree", path: "src" },
        { type: "blob", path: "src/app.js" },
        { type: "blob", path: "README.md" },
        { type: "blob", path: "logo.png" },
      ],
      files: {
        "src/app.js": "console.log('hi');",
        "README.md": "# Demo",
        "logo.png": "binary",
      },
    });

    const file = await fetchGitLabRepo("group/project");
    const text = await readFileText(file);

    expect(file.name).toBe("project_gitlab.txt");
    expect(text).toContain("Repository: group/project@main");
    expect(text).toContain("Directory Tree:");
    expect(text).toContain("src/app.js");
    expect(text).toContain("console.log('hi');");
    // The tree marks logo.png as a blob, but the extension filter drops it.
    expect(text).not.toContain("binary");
    // The archive was attempted first and rejected, then the walk succeeded.
    const types = chrome.runtime.sendMessage.mock.calls.map(([m]) => m.type);
    expect(types).toContain("bds-fetch-repo-zip");
    expect(types).toContain("bds-fetch-repo-text");
  });

  it("applies .gitignore when walking the tree", async () => {
    mockGitLab({
      tree: [
        { type: "blob", path: ".gitignore" },
        { type: "blob", path: "kept.js" },
        { type: "blob", path: "ignored.txt" },
      ],
      files: {
        ".gitignore": "ignored.txt\n",
        "kept.js": "keep me",
        "ignored.txt": "skip me",
      },
    });

    const text = await readFileText(await fetchGitLabRepo("group/project"));

    expect(text).toContain("keep me");
    expect(text).not.toContain("skip me");
  });

  it("prefers the bulk archive when it works (single request)", async () => {
    const base64 = zipToBase64({ "project-main/index.js": "export {};" });
    mockGitLab({ zip: base64 });

    const file = await fetchGitLabRepo("group/project");
    const text = await readFileText(file);

    expect(text).toContain("Repository: group/project@main");
    const types = chrome.runtime.sendMessage.mock.calls.map(([m]) => m.type);
    expect(types).not.toContain("bds-fetch-repo-text");
  });

  it("resolves the default branch from metadata and uses it (master repo)", async () => {
    // Regression: a public project whose default branch is `master` failed
    // because we always guessed `main`.
    mockGitLab({
      defaultBranch: "master",
      tree: [{ type: "blob", path: "app.js" }],
      files: { "app.js": "ok" },
    });

    const file = await fetchGitLabRepo(
      "https://gitlab.com/gitlab-examples/wayne-enterprises/wayne-industries/microservice",
    );
    const text = await readFileText(file);

    expect(file.name).toBe("microservice_gitlab.txt");
    expect(text).toContain(
      "Repository: gitlab-examples/wayne-enterprises/wayne-industries/microservice@master",
    );
    // The archive attempt carries the resolved branch, not a guessed `main`.
    const zipCall = chrome.runtime.sendMessage.mock.calls.find(
      ([m]) => m.type === "bds-fetch-repo-zip",
    );
    expect(zipCall[0].url).toContain("sha=master");
  });

  it("keeps the explicit ref from the URL instead of the default branch", async () => {
    mockGitLab({
      defaultBranch: "main",
      tree: [{ type: "blob", path: "app.js" }],
      files: { "app.js": "dev build" },
    });

    const text = await readFileText(
      await fetchGitLabRepo("https://gitlab.com/a/b/-/tree/dev"),
    );

    expect(text).toContain("Repository: a/b@dev");
    // An explicit ref is authoritative — do not even ask for the default branch.
    const projectCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([m]) => m.type === "bds-fetch-repo-metadata" && !m.url.includes("/tree"),
    );
    expect(projectCalls).toHaveLength(0);
  });

  it("reports a status message while walking the tree", async () => {
    mockGitLab({
      tree: [{ type: "blob", path: "app.js" }],
      files: { "app.js": "ok" },
    });
    const statusUpdates = [];

    await fetchGitLabRepo("group/project", (status) => statusUpdates.push(status));

    expect(statusUpdates).toContain("Listing repository files...");
    expect(statusUpdates).toContain("Creating file...");
  });

  it("explains that a 401/403 means the project is private, not that the ref is wrong", async () => {
    mockGitLab({ projectStatus: 403 });

    await expect(fetchGitLabRepo("group/project")).rejects.toThrow(
      /private or does not exist/,
    );
  });

  it("names the forge host in the error instead of misattributing it to GitHub", async () => {
    mockGitLab();

    await expect(fetchGitLabRepo("group/project")).rejects.toThrow(
      /GitLab project archive not found/,
    );
  });

  it("rejects invalid urls before any network call", async () => {
    await expect(fetchGitLabRepo("https://github.com/a/b")).rejects.toThrow(
      /Invalid GitLab URL/,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

/**
 * Stand in for the background worker's Codeberg endpoints.
 *
 * `zipRef` models the one branch that actually has an archive — Gitea answers
 * 404 for every other ref, which is exactly what made a guessed `main` fail on
 * repositories whose default branch is something else.
 */
function mockCodeberg({
  defaultBranch = "main",
  zipRef = "main",
  metadataStatus = null,
  zipStatus = null,
} = {}) {
  const base64 = zipToBase64({
    "repo-main/index.js": "export {};",
    "repo-main/README.md": "# CB",
  });

  chrome.runtime.sendMessage.mockImplementation(async (message) => {
    if (message.type === "bds-fetch-repo-metadata") {
      if (metadataStatus) {
        return { ok: false, status: metadataStatus, error: `HTTP ${metadataStatus}` };
      }
      return { ok: true, data: { default_branch: defaultBranch } };
    }

    if (message.type === "bds-fetch-repo-zip") {
      if (zipStatus) {
        return {
          ok: false,
          status: zipStatus,
          error: `codeberg.org returned ${zipStatus} for ${message.url}`,
        };
      }
      if (!message.url.includes(`/archive/${encodeURIComponent(zipRef)}.zip`)) {
        return {
          ok: false,
          status: 404,
          error: `codeberg.org returned 404 for ${message.url}`,
        };
      }
      return { ok: true, base64 };
    }

    return { ok: false, error: "unexpected message" };
  });
}

describe("codeberg-reader integration", () => {
  beforeEach(() => {
    resetAppState();
    chrome.runtime.sendMessage.mockReset();
  });

  it("parses full, branch, tag, and shorthand urls", () => {
    expect(parseCodebergUrl("https://codeberg.org/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
    });
    expect(parseCodebergUrl("https://codeberg.org/owner/repo/src/branch/dev")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "dev",
    });
    expect(parseCodebergUrl("https://codeberg.org/owner/repo/src/tag/v1.2")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "v1.2",
    });
    expect(parseCodebergUrl("owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
    });
    expect(parseCodebergUrl("https://codeberg.org/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
    });
  });

  it("rejects non-codeberg hosts", () => {
    expect(parseCodebergUrl("https://gitlab.com/o/r")).toBeNull();
    expect(parseCodebergUrl("")).toBeNull();
  });

  it("builds the gitea archive url", () => {
    expect(buildCodebergArchiveUrl({ owner: "o", repo: "r", ref: "feat/x" })).toBe(
      "https://codeberg.org/api/v1/repos/o/r/archive/feat%2Fx.zip",
    );
  });

  it("builds the repo metadata url", () => {
    expect(buildCodebergRepoApiUrl({ owner: "o", repo: "r" })).toBe(
      "https://codeberg.org/api/v1/repos/o/r",
    );
  });

  it("fetches and concatenates a codeberg repository", async () => {
    mockCodeberg({ defaultBranch: "main", zipRef: "main" });

    const file = await fetchCodebergRepo("owner/repo");
    const text = await readFileText(file);

    expect(file.name).toBe("repo_codeberg.txt");
    expect(text).toContain("Repository: owner/repo@main");
    expect(text).toContain("index.js");
  });

  it("resolves the real default branch instead of guessing main", async () => {
    // Regression: Codeberg/Gitea defaults are not uniform. `forgejo/forgejo`
    // really does use `forgejo` as its default branch, and its archive endpoint
    // answers 404 for both `main` and `master` — so a guess can never succeed.
    mockCodeberg({ defaultBranch: "forgejo", zipRef: "forgejo" });

    const file = await fetchCodebergRepo("forgejo/forgejo");
    const text = await readFileText(file);

    expect(text).toContain("Repository: forgejo/forgejo@forgejo");
    // The resolved branch is used on the first and only download attempt.
    const zipCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([m]) => m.type === "bds-fetch-repo-zip",
    );
    expect(zipCalls).toHaveLength(1);
    expect(zipCalls[0][0].url).toContain("/archive/forgejo.zip");
  });

  it("falls back to main and master when the repo api is unavailable", async () => {
    // Metadata is best-effort: if it fails, the common names are still tried.
    mockCodeberg({ metadataStatus: 500, zipRef: "master" });

    const text = await readFileText(await fetchCodebergRepo("owner/repo"));

    expect(text).toContain("Repository: owner/repo@master");
    const zipUrls = chrome.runtime.sendMessage.mock.calls
      .filter(([m]) => m.type === "bds-fetch-repo-zip")
      .map(([m]) => m.url);
    expect(zipUrls[0]).toContain("/archive/main.zip");
    expect(zipUrls[1]).toContain("/archive/master.zip");
  });

  it("keeps the explicit ref from the url instead of the default branch", async () => {
    mockCodeberg({ defaultBranch: "main", zipRef: "dev" });

    const text = await readFileText(
      await fetchCodebergRepo("https://codeberg.org/owner/repo/src/branch/dev"),
    );

    expect(text).toContain("Repository: owner/repo@dev");
    // An explicit ref is authoritative — do not even ask for the default branch.
    const metadataCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([m]) => m.type === "bds-fetch-repo-metadata",
    );
    expect(metadataCalls).toHaveLength(0);
  });

  it("explains that a 401/403 means the repo is private, not that the ref is wrong", async () => {
    mockCodeberg({ metadataStatus: 403, zipStatus: 403 });

    await expect(fetchCodebergRepo("owner/repo")).rejects.toThrow(
      /private or does not exist/,
    );
  });

  it("names the forge host in the error instead of misattributing it", async () => {
    mockCodeberg({ metadataStatus: 404, zipStatus: 404 });

    await expect(fetchCodebergRepo("owner/repo")).rejects.toThrow(
      /Codeberg repository not found/,
    );
  });

  it("rejects invalid urls before any network call", async () => {
    await expect(fetchCodebergRepo("not a url")).rejects.toThrow(
      /Invalid Codeberg URL/,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

/**
 * Stand in for the background worker's HuggingFace endpoints.
 *
 * `tree` mirrors the real `/tree/{rev}?recursive=true` payload, which reports a
 * `size` for every entry — that is what lets the reader drop weights and
 * oversized files before a single download.
 */
function mockHuggingFace({
  sha = "abc123def",
  tree = [],
  files = {},
  status = null,
} = {}) {
  chrome.runtime.sendMessage.mockImplementation(async (message) => {
    // A gated/private repo rejects every call with the same status.
    if (status) {
      return { ok: false, status, error: `HTTP ${status}` };
    }

    if (message.type === "bds-fetch-repo-metadata") {
      if (message.url.includes("/tree/")) return { ok: true, data: tree };
      return { ok: true, data: { sha } };
    }

    if (message.type === "bds-fetch-repo-text") {
      for (const [path, content] of Object.entries(files)) {
        const encoded = path.split("/").map(encodeURIComponent).join("/");
        if (message.url.includes(`/${encoded}`)) {
          return { ok: true, text: content };
        }
      }
      return { ok: false, status: 404, error: "404" };
    }

    return { ok: false, error: "unexpected message" };
  });
}

/** Every `/resolve/...` URL the reader asked the worker for. */
function resolveRequests() {
  return chrome.runtime.sendMessage.mock.calls
    .filter(([m]) => m.type === "bds-fetch-repo-text")
    .map(([m]) => m.url);
}

describe("huggingface-reader integration", () => {
  beforeEach(() => {
    resetAppState();
    chrome.runtime.sendMessage.mockReset();
  });

  it("parses model, dataset, space, tree and short-link urls", () => {
    expect(parseHuggingFaceUrl("https://huggingface.co/google-bert/bert-base-uncased")).toEqual(
      { kind: "models", owner: "google-bert", repo: "bert-base-uncased", ref: "main" },
    );
    expect(
      parseHuggingFaceUrl("https://huggingface.co/google-bert/bert-base-uncased/tree/dev"),
    ).toEqual({
      kind: "models",
      owner: "google-bert",
      repo: "bert-base-uncased",
      ref: "dev",
    });
    expect(parseHuggingFaceUrl("https://huggingface.co/datasets/rajpurkar/squad")).toEqual({
      kind: "datasets",
      owner: "rajpurkar",
      repo: "squad",
      ref: "main",
    });
    expect(parseHuggingFaceUrl("https://huggingface.co/spaces/gradio/hello_world")).toEqual({
      kind: "spaces",
      owner: "gradio",
      repo: "hello_world",
      ref: "main",
    });
    expect(parseHuggingFaceUrl("https://hf.co/google-bert/bert-base-uncased")).toEqual({
      kind: "models",
      owner: "google-bert",
      repo: "bert-base-uncased",
      ref: "main",
    });
    expect(parseHuggingFaceUrl("datasets/rajpurkar/squad")).toEqual({
      kind: "datasets",
      owner: "rajpurkar",
      repo: "squad",
      ref: "main",
    });
    expect(parseHuggingFaceUrl("google-bert/bert-base-uncased")).toEqual({
      kind: "models",
      owner: "google-bert",
      repo: "bert-base-uncased",
      ref: "main",
    });
  });

  it("rejects other hosts and malformed input", () => {
    expect(parseHuggingFaceUrl("https://github.com/a/b")).toBeNull();
    expect(parseHuggingFaceUrl("https://huggingface.co/onlyone")).toBeNull();
    expect(parseHuggingFaceUrl("")).toBeNull();
  });

  it("builds the recursive tree url with a mandatory revision", () => {
    expect(
      buildHuggingFaceTreeUrl({
        kind: "models",
        owner: "google-bert",
        repo: "bert-base-uncased",
        ref: "main",
      }),
    ).toBe(
      "https://huggingface.co/api/models/google-bert/bert-base-uncased/tree/main?recursive=true",
    );
    // Dataset and space repos share the API shape, only the segment differs.
    expect(
      buildHuggingFaceTreeUrl({ kind: "datasets", owner: "a", repo: "b", ref: "main" }),
    ).toContain("/api/datasets/a/b/tree/main");
  });

  it("builds the info url without a revision", () => {
    expect(buildHuggingFaceInfoUrl({ kind: "spaces", owner: "a", repo: "b" })).toBe(
      "https://huggingface.co/api/spaces/a/b",
    );
  });

  it("builds resolve urls, keeping the /datasets|/spaces prefix off models", () => {
    expect(
      buildHuggingFaceFileUrl({
        kind: "models",
        owner: "a",
        repo: "b",
        ref: "main",
        path: "src/app.js",
      }),
    ).toBe("https://huggingface.co/a/b/resolve/main/src/app.js");
    expect(
      buildHuggingFaceFileUrl({
        kind: "datasets",
        owner: "a",
        repo: "b",
        ref: "main",
        path: "README.md",
      }),
    ).toBe("https://huggingface.co/datasets/a/b/resolve/main/README.md");
  });

  it("recognises weight and dataset-array formats as non-documents", () => {
    expect(isHuggingFaceModelFile("pytorch_model.bin")).toBe(true);
    expect(isHuggingFaceModelFile("model.safetensors")).toBe(true);
    expect(isHuggingFaceModelFile("nested/tf_model.h5")).toBe(true);
    expect(isHuggingFaceModelFile("data/train.parquet")).toBe(true);
    expect(isHuggingFaceModelFile("README.md")).toBe(false);
    expect(isHuggingFaceModelFile("config.json")).toBe(false);
    expect(isHuggingFaceModelFile("LICENSE")).toBe(false);
  });

  it("imports the documents and skips model weights", async () => {
    mockHuggingFace({
      tree: [
        { type: "directory", oid: "d1", size: 0, path: "coreml" },
        { type: "file", oid: "f1", size: 12, path: "README.md" },
        { type: "file", oid: "f2", size: 30, path: "config.json" },
        // 440 MB of weights — must never be downloaded.
        { type: "file", oid: "f3", size: 440_000_000, path: "pytorch_model.bin" },
        { type: "file", oid: "f4", size: 900, path: "model.safetensors" },
        { type: "file", oid: "f5", size: 1_500_000_000, path: "train.parquet" },
      ],
      files: {
        "README.md": "# BERT",
        "config.json": '{"hidden_size":768}',
        "pytorch_model.bin": "WEIGHTS",
        "model.safetensors": "WEIGHTS",
        "train.parquet": "ARROWS",
      },
    });

    const file = await fetchHuggingFaceRepo(
      "https://huggingface.co/google-bert/bert-base-uncased",
    );
    const text = await readFileText(file);

    expect(file.name).toBe("bert-base-uncased_huggingface.txt");
    expect(text).toContain("Repository: google-bert/bert-base-uncased@main");
    expect(text).toContain("Directory Tree:");
    expect(text).toContain("# BERT");
    expect(text).toContain("hidden_size");
    expect(text).not.toContain("WEIGHTS");
    expect(text).not.toContain("ARROWS");

    // The weights were dropped from the listing, so nothing was requested for
    // them — no bytes crossed the network.
    const requested = resolveRequests();
    expect(requested.some((u) => u.endsWith("README.md"))).toBe(true);
    expect(requested.some((u) => u.endsWith("pytorch_model.bin"))).toBe(false);
    expect(requested.some((u) => u.endsWith("model.safetensors"))).toBe(false);
    expect(requested.some((u) => u.endsWith("train.parquet"))).toBe(false);
  });

  it("drops files whose reported size exceeds the cap before downloading", async () => {
    mockHuggingFace({
      tree: [
        { type: "file", oid: "f1", size: 20, path: "README.md" },
        // A text file that is simply too large to be worth importing.
        { type: "file", oid: "f2", size: MAX_FILE_BYTES + 1, path: "huge.json" },
      ],
      files: { "README.md": "# ok", "huge.json": "x" },
    });

    const text = await readFileText(await fetchHuggingFaceRepo("a/b"));

    expect(text).toContain("# ok");
    expect(resolveRequests().some((u) => u.endsWith("huge.json"))).toBe(false);
  });

  it("honours an explicit ref from the url", async () => {
    mockHuggingFace({
      tree: [{ type: "file", oid: "f1", size: 5, path: "README.md" }],
      files: { "README.md": "dev" },
    });

    const text = await readFileText(
      await fetchHuggingFaceRepo("https://huggingface.co/a/b/tree/dev"),
    );

    expect(text).toContain("Repository: a/b@dev");
    // An explicit ref is authoritative — do not fall back to the info endpoint.
    const infoCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([m]) => m.type === "bds-fetch-repo-metadata" && !m.url.includes("/tree/"),
    );
    expect(infoCalls).toHaveLength(0);
  });

  it("falls back to the default revision's commit when main is missing", async () => {
    // `main` is the HuggingFace convention but not a guarantee: the info
    // endpoint publishes the default revision's commit, which the tree accepts.
    chrome.runtime.sendMessage.mockImplementation(async (message) => {
      if (message.type === "bds-fetch-repo-metadata") {
        if (message.url.includes("/tree/main")) {
          return { ok: false, status: 404, error: "404" };
        }
        if (message.url.includes("/tree/abc123def")) {
          return {
            ok: true,
            data: [{ type: "file", oid: "f1", size: 5, path: "README.md" }],
          };
        }
        return { ok: true, data: { sha: "abc123def" } };
      }
      if (message.type === "bds-fetch-repo-text") {
        return { ok: true, text: "# recovered" };
      }
      return { ok: false, error: "unexpected" };
    });

    const text = await readFileText(await fetchHuggingFaceRepo("a/b"));

    expect(text).toContain("# recovered");
    // The label keeps the human-meaningful `main`, not the commit hash.
    expect(text).toContain("Repository: a/b@main");
  });

  it("explains that a 401/403 means the repo is gated, not that the ref is wrong", async () => {
    mockHuggingFace({ status: 403 });

    await expect(fetchHuggingFaceRepo("a/b")).rejects.toThrow(/gated or private/);
  });

  it("names the forge host in the error instead of misattributing it", async () => {
    mockHuggingFace();

    await expect(fetchHuggingFaceRepo("a/b")).rejects.toThrow(
      /HuggingFace repository not found/,
    );
  });

  it("rejects invalid urls before any network call", async () => {
    await expect(fetchHuggingFaceRepo("https://github.com/a/b")).rejects.toThrow(
      /Invalid HuggingFace URL/,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe("repo forge registry", () => {
  it("registers every forge with its i18n keys and a fetcher", () => {
    expect(REPO_FORGES.map((forge) => forge.key)).toEqual([
      "gitlab",
      "codeberg",
      "huggingface",
    ]);
    for (const forge of REPO_FORGES) {
      expect(forge.labelKey).toMatch(/^attachMenu\./);
      expect(forge.placeholderKey).toMatch(/^attachMenu\./);
      expect(forge.invalidKey).toMatch(/^attachMenu\./);
      expect(typeof forge.fetch).toBe("function");
    }
  });

  it("resolves URLs to forges by hostname", () => {
    expect(resolveRepoForgeKey("https://gitlab.com/a/b")).toBe("gitlab");
    expect(resolveRepoForgeKey("https://codeberg.org/a/b")).toBe("codeberg");
    expect(resolveRepoForgeKey("https://huggingface.co/a/b")).toBe("huggingface");
    expect(resolveRepoForgeKey("https://hf.co/a/b")).toBe("huggingface");
    expect(resolveRepoForgeKey("https://github.com/a/b")).toBeNull();
  });

  it("cannot resolve a shorthand — it is valid for every forge", () => {
    // This is why the UI treats a shorthand as belonging to the open dialog
    // rather than trying to detect the forge from the string.
    expect(resolveRepoForgeKey("owner/repo")).toBeNull();
    expect(resolveRepoForgeKey("datasets/owner/dataset")).toBeNull();
  });

  it("recognises forge shorthands", () => {
    expect(isRepoShorthand("group/project")).toBe(true);
    expect(isRepoShorthand("owner/repo")).toBe(true);
    expect(isRepoShorthand("owner/model")).toBe(true);
    expect(isRepoShorthand("datasets/rajpurkar/squad")).toBe(true);
    expect(isRepoShorthand("spaces/gradio/hello_world")).toBe(true);
    expect(isRepoShorthand("  owner/repo  ")).toBe(true);
    expect(isRepoShorthand("owner/repo.git")).toBe(true);
  });

  it("does not mistake a bare hostname or a typo for a shorthand", () => {
    // `gitlab.com/a/b` has no scheme but means a host; every reader's shorthand
    // branch would read `gitlab.com` as the namespace.
    expect(isRepoShorthand("gitlab.com/a/b")).toBe(false);
    expect(isRepoShorthand("hf.co/a/b")).toBe(false);
    expect(isRepoShorthand("https://gitlab.com/a/b")).toBe(false);
    expect(isRepoShorthand("owner")).toBe(false);
    expect(isRepoShorthand("not a url")).toBe(false);
    expect(isRepoShorthand("")).toBe(false);
    expect(isRepoShorthand(null)).toBe(false);
  });

  it("describes the expected url shape for every registered forge", () => {
    for (const forge of REPO_FORGES) {
      expect(describeRepoForgeUrl(forge.key)).toMatch(/^https:\/\//);
    }
  });
});
