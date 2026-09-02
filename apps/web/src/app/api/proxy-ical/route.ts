import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";
import { safeFetch, SsrfError } from "@/lib/safeFetch";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`proxy-ical:${auth.userId ?? getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  const rawUrl = new URL(req.url).searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate it is an absolute HTTPS URL before forwarding.
  // This blocks file://, javascript:, data:, and plain-HTTP URLs.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs are allowed" }, { status: 400 });
  }

  try {
    // safeFetch resolves the host up front and re-validates every redirect hop
    // against the SSRF block list (see lib/safeFetch.ts) — hostname string
    // matching alone is bypassable via DNS (evil.example → 127.0.0.1) and via
    // redirects (302 → http://169.254.169.254).
    const upstream = await safeFetch(parsed, {
      headers: {
        // Some iCal servers require a recognisable User-Agent.
        "User-Agent": "Crecoard/1.0 iCal-Proxy (+https://crecoard.com)",
        "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.8",
      },
      // Revalidate once per minute to avoid hammering upstream servers.
      next: { revalidate: 60 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned HTTP ${upstream.status}` },
        { status: 502 },
      );
    }

    const body = await upstream.text();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // Never cache the raw secret URL in the browser — let the server cache via `next.revalidate`.
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    if (err instanceof SsrfError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
