import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";

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

  // Block requests to private/loopback address ranges.
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.startsWith("127.") ||
    host.startsWith("169.254.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]";

  if (blocked) {
    return NextResponse.json({ error: "URL resolves to a private address" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // Some iCal servers require a recognisable User-Agent.
        "User-Agent": "Crecoard/1.0 iCal-Proxy (+https://crecoard.com)",
        "Accept": "text/calendar, text/plain;q=0.9, */*;q=0.8",
      },
      // fetch in Node 18+ follows redirects by default (mode: "follow").
      // The redirect option is not needed but made explicit for clarity.
      redirect: "follow",
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
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
