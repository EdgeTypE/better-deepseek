/**
 * MCP Server URL Validation & SSRF / Private Network Protection.
 *
 * Enforces:
 * 1. Valid URL syntax.
 * 2. HTTPS protocol only (plain HTTP is completely forbidden).
 * 3. Blocking of loopback addresses (127.0.0.0/8, ::1, localhost, 0.0.0.0).
 * 4. Blocking of RFC 1918 private IPv4 subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).
 * 5. Blocking of link-local, carrier-grade NAT, multicast, reserved ranges (169.254.0.0/16, 100.64.0.0/10, etc.).
 * 6. Blocking of IPv6 private/local ranges (fc00::/7, fe80::/10, IPv4-mapped IPv6).
 * 7. Blocking of local/internal domain suffixes (.local, .internal, .lan, .home.arpa, single-label names).
 * 8. Blocking of known DNS rebinding services (nip.io, sslip.io, localtest.me, lvh.me).
 */

const BLOCKED_DOMAIN_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".corp",
  ".intranet",
  ".private",
  // Known public DNS wildcard / rebinding services pointing to local addresses:
  ".nip.io",
  "nip.io",
  ".sslip.io",
  "sslip.io",
  ".localtest.me",
  "localtest.me",
  ".lvh.me",
  "lvh.me",
  ".lacolhost.com",
  "lacolhost.com",
  ".vcap.me",
  "vcap.me",
];

function isIpv4PrivateOrLocal(a, b, c, d) {
  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC 1918 Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (RFC 6598 Shared Address Space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (RFC 3927 Link-Local / Cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (RFC 6890 IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (RFC 5737 TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 (RFC 1918 Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (RFC 2544 Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (RFC 5737 TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (RFC 5737 TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (RFC 5771 Multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (RFC 1112 Reserved / Broadcast 255.255.255.255)
  if (a >= 240) return true;

  return false;
}

function parseIpv4MappedHex(hexStr) {
  const parts = hexStr.split(":");
  if (parts.length !== 2) return null;
  const hi = parseInt(parts[0], 16);
  const lo = parseInt(parts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

export function isPrivateOrLocalHost(hostname) {
  if (!hostname || typeof hostname !== "string") return true;

  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase().trim();
  if (!clean) return true;

  // Suffix checks (localhost, .local, etc.)
  for (const suffix of BLOCKED_DOMAIN_SUFFIXES) {
    if (clean === suffix || clean.endsWith(suffix)) {
      return true;
    }
  }

  // Single-label hostname without dots or colons (e.g. "my-server", "router", "intranet")
  if (!clean.includes(".") && !clean.includes(":")) {
    return true;
  }

  // Standard IPv4 dotted format
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = [
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4]),
    ];
    if (a > 255 || b > 255 || c > 255 || d > 255) return true;
    return isIpv4PrivateOrLocal(a, b, c, d);
  }

  // IPv6 format
  if (clean.includes(":")) {
    // Loopback: ::1 or 0:0:0:0:0:0:0:1
    if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
    // Unspecified: :: or 0:0:0:0:0:0:0:0
    if (clean === "::" || clean === "0:0:0:0:0:0:0:0") return true;
    // Unique Local Address (fc00::/7 -> fc00.. to fdff..)
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true;
    // Link-local (fe80::/10 -> fe80.. to febf..)
    if (
      clean.startsWith("fe8") ||
      clean.startsWith("fe9") ||
      clean.startsWith("fea") ||
      clean.startsWith("feb")
    ) {
      return true;
    }
    // Multicast (ff00::/8)
    if (clean.startsWith("ff")) return true;
    // Documentation prefix (2001:db8::/32)
    if (clean.startsWith("2001:db8")) return true;
    // Discard prefix (100::/64)
    if (clean.startsWith("100:")) return true;

    // IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:hex:hex)
    if (clean.startsWith("::ffff:") || clean.startsWith("0:0:0:0:0:ffff:")) {
      const rest = clean.replace(/^(::ffff:|0:0:0:0:0:ffff:)/, "");
      const v4Match = rest.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (v4Match) {
        return isIpv4PrivateOrLocal(
          Number(v4Match[1]),
          Number(v4Match[2]),
          Number(v4Match[3]),
          Number(v4Match[4])
        );
      }
      const mappedOctets = parseIpv4MappedHex(rest);
      if (mappedOctets) {
        return isIpv4PrivateOrLocal(...mappedOctets);
      }
      return true;
    }

    // Deprecated IPv4-compatible IPv6 (::x.x.x.x or ::hex:hex)
    if (clean.startsWith("::") && clean.split(":").length <= 3) {
      return true;
    }
  }

  return false;
}

export function validateMcpUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Server URL is required." };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid server URL." };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Insecure MCP server URL: Only HTTPS is allowed. Plain HTTP, localhost, and local network servers are not permitted.",
    };
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return {
      valid: false,
      error: `Blocked private or local network host (${parsed.hostname}). Only public HTTPS MCP servers are permitted.`,
    };
  }

  return { valid: true, url: parsed.href };
}

export function assertSafeMcpUrl(rawUrl) {
  const result = validateMcpUrl(rawUrl);
  if (!result.valid) {
    throw new Error(result.error);
  }
  return result.url;
}
