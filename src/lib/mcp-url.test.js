import { describe, expect, it } from "vitest";
import {
  assertSafeMcpUrl,
  isPrivateOrLocalHost,
  validateMcpUrl,
} from "./mcp-url.js";

describe("isPrivateOrLocalHost", () => {
  it("detects localhost and loopback variations", () => {
    expect(isPrivateOrLocalHost("localhost")).toBe(true);
    expect(isPrivateOrLocalHost("sub.localhost")).toBe(true);
    expect(isPrivateOrLocalHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("127.0.1.1")).toBe(true);
    expect(isPrivateOrLocalHost("::1")).toBe(true);
    expect(isPrivateOrLocalHost("[::1]")).toBe(true);
    expect(isPrivateOrLocalHost("0.0.0.0")).toBe(true);
  });

  it("detects private IPv4 networks (RFC 1918)", () => {
    expect(isPrivateOrLocalHost("10.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("10.255.255.255")).toBe(true);
    expect(isPrivateOrLocalHost("172.16.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("172.31.255.255")).toBe(true);
    expect(isPrivateOrLocalHost("192.168.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("192.168.100.200")).toBe(true);
  });

  it("detects link-local, carrier-grade NAT, and reserved IPs", () => {
    expect(isPrivateOrLocalHost("169.254.169.254")).toBe(true);
    expect(isPrivateOrLocalHost("100.64.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("100.127.255.255")).toBe(true);
    expect(isPrivateOrLocalHost("224.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("240.0.0.1")).toBe(true);
  });

  it("detects local/internal domain suffixes", () => {
    expect(isPrivateOrLocalHost("my-service.local")).toBe(true);
    expect(isPrivateOrLocalHost("backend.internal")).toBe(true);
    expect(isPrivateOrLocalHost("printer.lan")).toBe(true);
    expect(isPrivateOrLocalHost("router.home.arpa")).toBe(true);
    expect(isPrivateOrLocalHost("nas.corp")).toBe(true);
    expect(isPrivateOrLocalHost("singlelabelhost")).toBe(true);
  });

  it("detects DNS rebinding services", () => {
    expect(isPrivateOrLocalHost("localtest.me")).toBe(true);
    expect(isPrivateOrLocalHost("sub.localtest.me")).toBe(true);
    expect(isPrivateOrLocalHost("127.0.0.1.nip.io")).toBe(true);
    expect(isPrivateOrLocalHost("test.sslip.io")).toBe(true);
    expect(isPrivateOrLocalHost("lvh.me")).toBe(true);
  });

  it("detects IPv6 private, link-local, and mapped addresses", () => {
    expect(isPrivateOrLocalHost("fe80::1")).toBe(true);
    expect(isPrivateOrLocalHost("fc00::1")).toBe(true);
    expect(isPrivateOrLocalHost("fd12:3456::1")).toBe(true);
    expect(isPrivateOrLocalHost("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHost("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalHost("::ffff:7f00:1")).toBe(true);
  });

  it("allows public domain names and public IPs", () => {
    expect(isPrivateOrLocalHost("mcp.exa.ai")).toBe(false);
    expect(isPrivateOrLocalHost("api.github.com")).toBe(false);
    expect(isPrivateOrLocalHost("example.org")).toBe(false);
    expect(isPrivateOrLocalHost("8.8.8.8")).toBe(false);
    expect(isPrivateOrLocalHost("1.1.1.1")).toBe(false);
  });
});

describe("validateMcpUrl & assertSafeMcpUrl", () => {
  it("rejects missing, empty, or non-string URLs", () => {
    expect(validateMcpUrl("").valid).toBe(false);
    expect(validateMcpUrl("   ").valid).toBe(false);
    expect(validateMcpUrl(null).valid).toBe(false);
    expect(() => assertSafeMcpUrl("")).toThrow("Server URL is required");
  });

  it("rejects invalid URL syntax", () => {
    expect(validateMcpUrl("not-a-url").valid).toBe(false);
    expect(() => assertSafeMcpUrl("not-a-url")).toThrow("Invalid server URL");
  });

  it("rejects non-HTTPS protocols (http, ftp, javascript, file)", () => {
    expect(validateMcpUrl("http://mcp.exa.ai/mcp").valid).toBe(false);
    expect(validateMcpUrl("http://localhost:8000/mcp").valid).toBe(false);
    expect(validateMcpUrl("ftp://mcp.exa.ai/mcp").valid).toBe(false);
    expect(validateMcpUrl("javascript:alert(1)").valid).toBe(false);
    expect(() => assertSafeMcpUrl("http://mcp.exa.ai/mcp")).toThrow("Only HTTPS is allowed");
  });

  it("rejects localhost and loopback targets under HTTPS", () => {
    expect(validateMcpUrl("https://localhost:8443/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://127.0.0.1:8443/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://127.1:8443/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://[::1]:8443/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://0.0.0.0:8443/mcp").valid).toBe(false);
    expect(() => assertSafeMcpUrl("https://127.0.0.1:8443/mcp")).toThrow("Blocked private or local network host");
  });

  it("rejects private network targets under HTTPS", () => {
    expect(validateMcpUrl("https://192.168.1.10/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://10.0.0.5:9000").valid).toBe(false);
    expect(validateMcpUrl("https://172.16.50.1:443").valid).toBe(false);
    expect(validateMcpUrl("https://my-server.local/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://intranet:8443/mcp").valid).toBe(false);
    expect(validateMcpUrl("https://127.0.0.1.nip.io/mcp").valid).toBe(false);
  });

  it("accepts valid, public HTTPS URLs", () => {
    const res1 = validateMcpUrl("https://mcp.exa.ai/mcp");
    expect(res1.valid).toBe(true);
    expect(res1.url).toBe("https://mcp.exa.ai/mcp");

    const res2 = validateMcpUrl("https://api.github.com/mcp?key=123");
    expect(res2.valid).toBe(true);

    expect(assertSafeMcpUrl("https://example.com:8443/mcp")).toBe("https://example.com:8443/mcp");
  });
});

