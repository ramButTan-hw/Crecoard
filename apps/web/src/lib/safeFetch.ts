import dns from "dns/promises";
import { isIP } from "net";

// ─── SSRF protection for outbound proxy routes ────────────────────────────────
// Shared by /api/proxy and /api/proxy-ical. Every URL is DNS-resolved and
// every resolved address is checked against private/loopback/link-local ranges
// BEFORE any connection is made, and redirects are followed manually with each
// hop re-validated. This blocks:
//   • hostnames whose DNS resolves to internal IPs (string-matching the
//     hostname alone does not — "evil.example" can point at 127.0.0.1)
//   • redirect chains that hop to internal hosts (302 → 169.254.169.254)
//   • http downgrades mid-chain
//   • leaking Authorization to a different origin via redirect
//
// Residual risk (documented): a DNS-rebinding domain could answer the
// validation lookup with a public IP and the fetch's lookup with a private
// one. Closing that fully requires socket-level address pinning; the attack
// is substantially harder than the redirect/DNS bypasses above.

export class SsrfError extends Error {}

const MAX_REDIRECTS = 5;

// ─── IPv4 ─────────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

function inV4Cidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

// RFC-1918, loopback, link-local (incl. cloud metadata 169.254.169.254),
// CGNAT, benchmark, multicast, reserved.
const BLOCKED_V4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

export function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_V4_CIDRS.some((cidr) => inV4Cidr(ip, cidr));
}

// ─── IPv6 ─────────────────────────────────────────────────────────────────────

function hexPairToIpv4(hi: string, lo: string): string | null {
  const h = parseInt(hi, 16);
  const l = parseInt(lo, 16);
  if (Number.isNaN(h) || Number.isNaN(l) || h > 0xffff || l > 0xffff) return null;
  return `${h >> 8}.${h & 0xff}.${l >> 8}.${l & 0xff}`;
}

export function isBlockedIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::" || n === "::1") return true;

  // IPv4-mapped (::ffff:127.0.0.1 / ::ffff:7f00:1) → check the embedded v4
  const mappedDotted = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isBlockedIpv4(mappedDotted[1]);
  const mappedHex = n.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const v4 = hexPairToIpv4(mappedHex[1], mappedHex[2]);
    return v4 === null ? true : isBlockedIpv4(v4);
  }

  // NAT64 (64:ff9b::/96) embeds the IPv4 address in the last 32 bits
  const nat64Dotted = n.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (nat64Dotted) return isBlockedIpv4(nat64Dotted[1]);
  const nat64Hex = n.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64Hex) {
    const v4 = hexPairToIpv4(nat64Hex[1], nat64Hex[2]);
    return v4 === null ? true : isBlockedIpv4(v4);
  }

  return (
    /^fe[89ab]/.test(n) || // fe80::/10 link-local
    /^f[cd]/.test(n) ||    // fc00::/7 unique-local
    n.startsWith("ff")     // ff00::/8 multicast
  );
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true; // not an IP literal → caller should have resolved it first
}

// ─── URL validation ───────────────────────────────────────────────────────────

/**
 * Throws SsrfError unless `target` is HTTPS and resolves ONLY to public
 * addresses. Checks every record returned by DNS, not just the first.
 */
export async function assertSafeUrl(target: URL): Promise<void> {
  if (target.protocol !== "https:") {
    throw new SsrfError("Only HTTPS URLs are allowed");
  }

  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new SsrfError("Missing host");

  // IP literals skip DNS
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new SsrfError("Destination not allowed");
    return;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new SsrfError("Could not resolve host");
  }
  if (records.length === 0) throw new SsrfError("Could not resolve host");

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new SsrfError("Host resolves to a blocked address");
    }
  }
}

// ─── Fetch with validated redirect hops ───────────────────────────────────────

/**
 * fetch() replacement for untrusted URLs: validates the destination up front,
 * follows redirects manually (re-validating every hop), refuses http
 * downgrades, strips forwarded credentials when a redirect changes origin, and
 * mirrors standard fetch semantics for method rewriting (301/302/303 → GET).
 */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  opts: { maxRedirects?: number; totalTimeoutMs?: number } = {}
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const deadline = opts.totalTimeoutMs !== undefined ? Date.now() + opts.totalTimeoutMs : null;

  let target = typeof input === "string" ? new URL(input) : input;
  let method = (init.method ?? "GET").toUpperCase();
  let body: RequestInit["body"] = init.body;
  let headers = new Headers(init.headers);

  for (let hop = 0; ; hop++) {
    await assertSafeUrl(target);

    const remaining = deadline === null ? undefined : deadline - Date.now();
    if (remaining !== undefined && remaining <= 0) {
      throw new DOMException("Request timed out", "TimeoutError");
    }

    const response = await fetch(target, {
      ...init,
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      redirect: "manual",
      signal: remaining !== undefined ? AbortSignal.timeout(remaining) : init.signal,
    });

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && location !== null;
    if (!isRedirect) return response;
    if (hop >= maxRedirects) throw new Error("Too many redirects");

    const next = new URL(location, target);

    // Never leak credentials to a different origin via redirect
    if (next.origin !== target.origin) {
      headers = new Headers(headers);
      headers.delete("authorization");
      headers.delete("x-api-key");
    }

    // Standard fetch semantics: 301/302/303 downgrade POST → GET; 307/308 preserve
    if (response.status === 301 || response.status === 302 || response.status === 303) {
      if (method === "POST") {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
      }
    }

    target = next;
  }
}
