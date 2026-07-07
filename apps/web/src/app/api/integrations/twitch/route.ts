import { NextRequest, NextResponse } from "next/server";
import type { TwitchData, TwitchScheduleSegment } from "@/store/boardStore";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";

const HELIX = "https://api.twitch.tv/helix";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// Live status changes often, so keep the cache short.
const cache = new Map<string, { data: TwitchData; expiresAt: number }>();
const CACHE_TTL = 60 * 1000; // 1 min

// App access token (client_credentials) — shared in-process, refreshed lazily.
let appToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(clientId: string, clientSecret: string, force = false): Promise<string | null> {
  if (!force && appToken && appToken.expiresAt > Date.now()) return appToken.value;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  let res: Response;
  try {
    res = await fetch(`${TOKEN_URL}?${params.toString()}`, { method: "POST", cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.access_token) return null;
  // Refresh a minute before Twitch's stated expiry.
  appToken = { value: json.access_token, expiresAt: Date.now() + ((json.expires_in ?? 3600) - 60) * 1000 };
  return appToken.value;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`twitch:${auth.userId ?? getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  let body: { channel?: string; schedule?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const channel = (body.channel ?? "").trim().toLowerCase().replace(/^@/, "");
  const wantSchedule = body.schedule !== false;
  if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel)) {
    return NextResponse.json({ error: "Enter a valid Twitch channel name." }, { status: 400 });
  }

  const clientId = process.env.TWITCH_CLIENT_ID ?? "";
  const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Twitch integration is not configured on this server. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET." },
      { status: 503 }
    );
  }

  // Serve from cache if fresh.
  const cached = cache.get(channel);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  // Helix fetch that transparently retries once on a 401 (expired/invalid token).
  const helix = async (path: string): Promise<Response | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getAppToken(clientId, clientSecret, attempt === 1);
      if (!token) return null;
      let res: Response;
      try {
        res = await fetch(`${HELIX}${path}`, {
          headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      } catch {
        return null;
      }
      if (res.status === 401) { appToken = null; continue; }
      return res;
    }
    return null;
  };

  // 1) Resolve the user (profile + id).
  const usersRes = await helix(`/users?login=${encodeURIComponent(channel)}`);
  if (!usersRes) return NextResponse.json({ error: "Failed to reach Twitch." }, { status: 502 });
  if (usersRes.status === 401) return NextResponse.json({ error: "Twitch authentication failed. The server credentials may be invalid — contact the site admin." }, { status: 401 });
  if (!usersRes.ok) return NextResponse.json({ error: `Twitch error ${usersRes.status}.` }, { status: 502 });

  const usersJson = await usersRes.json().catch(() => null);
  const user = usersJson?.data?.[0];
  if (!user) return NextResponse.json({ error: `Channel "${channel}" not found.` }, { status: 404 });

  // 2) Live stream (empty array = offline).
  const streamsRes = await helix(`/streams?user_login=${encodeURIComponent(channel)}`);
  const stream = streamsRes && streamsRes.ok ? (await streamsRes.json().catch(() => null))?.data?.[0] : null;
  const isLive = !!stream && stream.type === "live";

  // 3) Next scheduled stream when offline (best-effort — many channels have no schedule).
  let nextStream: TwitchScheduleSegment | undefined;
  if (!isLive && wantSchedule) {
    const schedRes = await helix(`/schedule?broadcaster_id=${user.id}&first=1`);
    if (schedRes && schedRes.ok) {
      const seg = (await schedRes.json().catch(() => null))?.data?.segments?.[0];
      if (seg?.start_time) {
        nextStream = {
          title: seg.title || undefined,
          startTime: seg.start_time,
          category: seg.category?.name || undefined,
        };
      }
    }
  }

  const data: TwitchData = {
    channel,
    displayName: user.display_name ?? channel,
    profileImageUrl: user.profile_image_url || undefined,
    description: user.description || undefined,
    isLive,
    title: isLive ? (stream.title || undefined) : undefined,
    gameName: isLive ? (stream.game_name || undefined) : undefined,
    viewerCount: isLive ? stream.viewer_count : undefined,
    startedAt: isLive ? stream.started_at : undefined,
    thumbnailUrl: isLive && stream.thumbnail_url
      ? stream.thumbnail_url.replace("{width}", "440").replace("{height}", "248")
      : undefined,
    nextStream,
    fetchedAt: Date.now(),
  };

  cache.set(channel, { data, expiresAt: Date.now() + CACHE_TTL });
  return NextResponse.json(data);
}
