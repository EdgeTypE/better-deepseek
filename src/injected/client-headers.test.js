import { describe, expect, it, vi } from "vitest";
import {
  buildDeepSeekApiHeaders,
  captureClientHeader,
  captureMetadataFromHeaders,
  normalizeBearerToken,
} from "./client-headers.js";

describe("normalizeBearerToken", () => {
  it("strips single or repeated Bearer prefixes, whitespace, and quotes", () => {
    expect(normalizeBearerToken("abc.123")).toBe("abc.123");
    expect(normalizeBearerToken("Bearer abc.123")).toBe("abc.123");
    expect(normalizeBearerToken("bearer  Bearer  abc.123 ")).toBe("abc.123");
    expect(normalizeBearerToken('"Bearer abc.123"')).toBe("abc.123");
    expect(normalizeBearerToken("")).toBeNull();
    expect(normalizeBearerToken("Bearer ")).toBeNull();
    expect(normalizeBearerToken(null)).toBeNull();
  });
});

describe("captureMetadataFromHeaders", () => {
  it("captures authorization and DeepSeek client/device headers from plain objects, arrays, and Headers", () => {
    const captured = {};
    const setAuthToken = vi.fn();
    const state = {
      setAuthToken,
      captureClientHeader: (k, v) => captureClientHeader(k, v, captured),
    };

    captureMetadataFromHeaders(
      {
        Authorization: "Bearer tok-1",
        "X-Client-Version": "2.8.0",
        "X-Ignore-Me": "nope",
      },
      state
    );
    captureMetadataFromHeaders(
      [
        ["x-device-id", "dev-uuid"],
        ["x-client-locale", "tr_TR"],
      ],
      state
    );
    captureMetadataFromHeaders(new Headers({ "x-client-platform": "web" }), state);

    expect(setAuthToken).toHaveBeenCalledWith("Bearer tok-1");
    expect(captured).toEqual({
      "x-client-version": "2.8.0",
      "x-device-id": "dev-uuid",
      "x-client-locale": "tr_TR",
      "x-client-platform": "web",
    });
  });
});

describe("buildDeepSeekApiHeaders", () => {
  it("builds GET headers without Content-Type and prevents double Bearer", () => {
    const fakeStorage = {
      getItem: (key) => {
        if (key === "deepseek-device-id:chat") return "dev-from-ls";
        if (key === "__appKit_@deepseek/chat_localePreference") {
          return JSON.stringify({ value: "en_US", __version: "0" });
        }
        return null;
      },
    };

    const headers = buildDeepSeekApiHeaders({
      authToken: "Bearer raw-secret-token",
      capturedHeaders: {
        "x-client-version": "2.8.0",
        "x-client-timezone-offset": "10800",
      },
      includeContentType: false,
      storage: fakeStorage,
    });

    expect(headers["authorization"]).toBe("Bearer raw-secret-token");
    expect(headers["content-type"]).toBeUndefined();
    expect(headers["x-client-bundle-id"]).toBe("com.deepseek.chat");
    expect(headers["x-client-platform"]).toBe("web");
    expect(headers["x-client-version"]).toBe("2.8.0");
    expect(headers["x-client-locale"]).toBe("en_US");
    expect(headers["x-client-timezone-offset"]).toBe("10800");
    expect(headers["x-device-id"]).toBe("dev-from-ls");
    expect(headers["x-device-model"]).toBe("");
  });

  it("includes Content-Type: application/json only when includeContentType is true", () => {
    const headers = buildDeepSeekApiHeaders({
      authToken: "tok",
      includeContentType: true,
      storage: { getItem: () => null },
      navigatorObj: { language: "en-US" },
    });

    expect(headers["content-type"]).toBe("application/json");
    expect(headers["authorization"]).toBe("Bearer tok");
    expect(headers["x-client-version"]).toBe("2.8.0");
  });
});
