import { describe, expect, it } from "vitest";
import { resolveFixtureRequest } from "../e2e/fixtures/fixture-resolver.js";

describe("shared E2E fixture resolver", () => {
  it("serves the Google Fonts stylesheet without using the network", () => {
    const result = resolveFixtureRequest(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    );

    expect(result.routeName).toBe("google-fonts-css");
    expect(result.statusCode).toBe(200);
    expect(result.mediaType).toContain("text/css");
  });

  it("serves only locale codes that exist in the repository", () => {
    expect(resolveFixtureRequest(
      "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales/en.json?t=1",
    ).routeName).toBe("locale-en");

    expect(() => resolveFixtureRequest(
      "https://raw.githubusercontent.com/EdgeTypE/better-deepseek/main/src/locales/zz.json?t=1",
    )).toThrow(/Unknown locale code|Unmatched external URL/);
  });

  it("rejects every other external URL", () => {
    expect(() => resolveFixtureRequest("https://example.com/unexpected"))
      .toThrow(/Unmatched external URL/);
  });
});
