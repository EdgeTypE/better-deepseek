// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const searchImagesMock = vi.hoisted(() => vi.fn());
vi.mock("../../../src/lib/wikimedia-commons.js", () => ({
  searchImages: searchImagesMock,
}));

import ImageCard from "../../../src/content/ui/ImageCard.svelte";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

describe("ImageCard", () => {
  beforeEach(() => {
    searchImagesMock.mockReset();
    document.body.innerHTML = "";
  });

  it('shows loading state when query is provided', async () => {
    searchImagesMock.mockReturnValue(new Promise(() => {}));

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "sunset",
      attrs: {},
    });
    await flushUi();

    expect(target.querySelector(".bds-image-skeleton")).not.toBeNull();
    expect(searchImagesMock).toHaveBeenCalledWith({
      query: "sunset",
      count: 1,
      width: 400,
      filetype: undefined,
      intitle: undefined,
      category: undefined,
      signal: expect.any(AbortSignal),
    });
    cleanup();
  });

  it('renders image when query resolves successfully', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://upload.wikimedia.org/thumb/test.jpg",
      title: "File:Test.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
      width: 800,
      height: 600,
      mime: "image/jpeg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test image",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.src).toContain("test.jpg");
    expect(target.textContent).toContain("File:Test.jpg");

    const creditLink = target.querySelector(".bds-image-credit");
    expect(creditLink).not.toBeNull();
    expect(creditLink.href).toContain("File:Test.jpg");
    cleanup();
  });

  it('renders image directly from src attribute (skips API)', async () => {
    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: { src: "https://example.com/direct.jpg" },
    });
    await flushUi();

    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.src).toBe("https://example.com/direct.jpg");
    expect(searchImagesMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('renders image when src attribute is wrapped in markdown link syntax', async () => {
    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: { src: "[https://cataas.com/cat](https://cataas.com/cat)" },
    });
    await flushUi();

    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.src).toBe("https://cataas.com/cat");
    expect(searchImagesMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('renders src image with caption and no credit link', async () => {
    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: { src: "https://example.com/img.jpg", caption: "My Image" },
    });
    await flushUi();

    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    expect(target.textContent).toContain("My Image");
    expect(target.querySelector(".bds-image-credit")).toBeNull();
    cleanup();
  });

  it('shows error state when no query and no src', async () => {
    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: {},
    });
    await flushUi();

    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector(".bds-image-skeleton")).toBeNull();
    expect(searchImagesMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('shows error state when searchImages promise rejects', async () => {
    searchImagesMock.mockRejectedValue(new Error("Network failure"));

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector(".bds-image-skeleton")).toBeNull();
    cleanup();
  });

  it('shows error state when API returns null', async () => {
    searchImagesMock.mockResolvedValue(null);

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "nothing",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector(".bds-image-skeleton")).toBeNull();
    cleanup();
  });

  it('uses attrs.query when both content and attrs.query exist', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      title: "File:Query.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Query.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "fallback query",
      attrs: { query: "explicit query" },
    });
    await flushUi();
    await flushUi();

    expect(searchImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "explicit query" })
    );
    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    cleanup();
  });

  it('uses attrs.q as query alias', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      title: "File:Q.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Q.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: { q: "alias query" },
    });
    await flushUi();
    await flushUi();

    expect(searchImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "alias query" })
    );
    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    cleanup();
  });

  it('opens fullscreen when clicking loaded image from API', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      fullUrl: "https://example.com/full.jpg",
      title: "File:Full.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Full.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    const wrapper = target.querySelector(".bds-image-wrapper");
    wrapper.click();
    await flushUi();

    const fullscreen = document.querySelector(".bds-image-fullscreen");
    expect(fullscreen).not.toBeNull();

    const fullImg = fullscreen.querySelector("img");
    expect(fullImg).not.toBeNull();
    expect(fullImg.src).toBe("https://example.com/full.jpg");
    cleanup();
  });

  it('opens fullscreen with src when clicking direct-url image', async () => {
    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "",
      attrs: { src: "https://example.com/direct.jpg" },
    });
    await flushUi();

    const wrapper = target.querySelector(".bds-image-wrapper");
    wrapper.click();
    await flushUi();

    const fullscreen = document.querySelector(".bds-image-fullscreen");
    const fullImg = fullscreen.querySelector("img");
    expect(fullImg.src).toBe("https://example.com/direct.jpg");
    cleanup();
  });

  it('closes fullscreen when close button is clicked', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      fullUrl: "https://example.com/full.jpg",
      title: "File:Full.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Full.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    target.querySelector(".bds-image-wrapper").click();
    await flushUi();

    expect(document.querySelector(".bds-image-fullscreen")).not.toBeNull();

    document.querySelector(".bds-image-close-btn").click();
    await flushUi();

    expect(document.querySelector(".bds-image-fullscreen")).toBeNull();
    cleanup();
  });

  it('closes fullscreen when backdrop is clicked', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      fullUrl: "https://example.com/full.jpg",
      title: "File:Full.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Full.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: {},
    });
    await flushUi();
    await flushUi();

    target.querySelector(".bds-image-wrapper").click();
    await flushUi();

    expect(document.querySelector(".bds-image-fullscreen")).not.toBeNull();

    document.querySelector(".bds-image-fullscreen").click();
    await flushUi();

    expect(document.querySelector(".bds-image-fullscreen")).toBeNull();
    cleanup();
  });

  it('does not show fullscreen for loading state (no wrapper)', async () => {
    searchImagesMock.mockReturnValue(new Promise(() => {}));

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: {},
    });
    await flushUi();

    expect(target.querySelector(".bds-image-wrapper")).toBeNull();
    expect(document.querySelector(".bds-image-fullscreen")).toBeNull();
    cleanup();
  });

  it('passes optional attrs to searchImages', async () => {
    searchImagesMock.mockResolvedValue({
      displayUrl: "https://example.com/thumb.jpg",
      title: "File:Opt.jpg",
      descriptionUrl: "https://commons.wikimedia.org/wiki/File:Opt.jpg",
    });

    const { target, cleanup } = renderSvelte(ImageCard, {
      content: "test",
      attrs: { count: "3", width: "200", filetype: "image/png", intitle: "true", category: "Nature" },
    });
    await flushUi();
    await flushUi();

    expect(searchImagesMock).toHaveBeenCalledWith({
      query: "test",
      count: "3",
      width: "200",
      filetype: "image/png",
      intitle: "true",
      category: "Nature",
      signal: expect.any(AbortSignal),
    });
    const img = target.querySelector("img");
    expect(img).not.toBeNull();
    cleanup();
  });
});
