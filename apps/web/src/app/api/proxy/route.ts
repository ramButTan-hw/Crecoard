import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";
import { safeFetch, SsrfError } from "@/lib/safeFetch";

// ─── Allowed HTTP methods ─────────────────────────────────────────────────────
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * POST /api/proxy
 *
 * Body (JSON):
 * {
 *   url:        string,          // the remote URL to fetch — HTTPS only
 *   method?:    string,          // default "GET"
 *   headers?:   Record<string, string>,  // forwarded verbatim (Authorization etc.)
 *   body?:      string,          // raw string body for POST/PUT/PATCH
 * }
 *
 * Auth credentials (apiAuthValue) are accepted directly in `headers` for now.
 * TODO: upgrade path — move to a server-side credential vault (e.g. Supabase
 * Vault or encrypted env secrets) and have the client send only a credential ID.
 * That removes the sensitive value from every request body.
 */
export async function POST(req: NextRequest) {
  // ── 0. Authenticate & rate-limit ─────────────────────────────────────────────
  // This route forwards arbitrary headers (including Authorization) to arbitrary
  // HTTPS hosts, so it must never be open to anonymous callers.
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`proxy:${auth.userId ?? getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  // ── 1. Parse & validate request body ────────────────────────────────────────
  let payload: {
    url?: unknown;
    method?: unknown;
    headers?: unknown;
    body?: unknown;
  };

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, method = "GET", headers: forwardHeaders, body: forwardBody } = payload;

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // ── 2. HTTPS-only ────────────────────────────────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs are allowed" }, { status: 400 });
  }

  // ── 3. Validate method ───────────────────────────────────────────────────────
  const upperMethod = typeof method === "string" ? method.toUpperCase() : "";
  if (!ALLOWED_METHODS.has(upperMethod)) {
    return NextResponse.json({ error: "Unsupported method" }, { status: 400 });
  }

  // ── 4. Build outbound headers ────────────────────────────────────────────────
  // Only forward explicitly supplied headers — never echo Cookie, Host, etc.
  const outHeaders: Record<string, string> = {
    "User-Agent": "Crecoard-Proxy/1.0",
  };

  if (forwardHeaders && typeof forwardHeaders === "object" && !Array.isArray(forwardHeaders)) {
    const allowed = new Set([
      "authorization",
      "x-api-key",
      "content-type",
      "accept",
      "x-requested-with",
    ]);
    for (const [k, v] of Object.entries(forwardHeaders as Record<string, unknown>)) {
      if (typeof v === "string" && allowed.has(k.toLowerCase())) {
        outHeaders[k] = v;
      }
    }
  }

  // ── 5. Execute proxied request ───────────────────────────────────────────────
  let response: Response;
  try {
    response = await safeFetch(parsed, {
      method: upperMethod,
      headers: outHeaders,
      ...(upperMethod !== "GET" && upperMethod !== "DELETE" && typeof forwardBody === "string"
        ? { body: forwardBody }
        : {}),
      // No caching — API widget data should always be fresh
      cache: "no-store",
    }, {
      // 10-second budget across the whole redirect chain
      totalTimeoutMs: 10_000,
    });
  } catch (err: unknown) {
    if (err instanceof SsrfError) {
      return NextResponse.json({ error: "Destination not allowed" }, { status: 403 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to reach remote" }, { status: 502 });
  }

  // ── 6. Return response ───────────────────────────────────────────────────────
  // Read as text first; attempt JSON parse — if it fails, wrap in { text }.
  const raw = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { text: raw };
  }

  return NextResponse.json(
    { status: response.status, data },
    { status: response.ok ? 200 : response.status }
  );
}
