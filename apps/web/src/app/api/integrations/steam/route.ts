import { NextRequest, NextResponse } from "next/server";
import type { SteamData } from "@/store/boardStore";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";

const STEAM_BASE = "https://api.steampowered.com";

const cache = new Map<string, { data: SteamData; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

async function resolveToSteamId(identifier: string, key: string): Promise<string | null> {
  // Already a 17-digit SteamID64
  if (/^\d{17}$/.test(identifier.trim())) return identifier.trim();

  // Full profile URL with SteamID64
  const profileMatch = identifier.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1];

  // Full or partial vanity URL — extract the vanity slug
  const idMatch = identifier.match(/steamcommunity\.com\/id\/([^/?\s]+)/);
  const vanity = idMatch ? idMatch[1] : identifier.trim();

  const res = await fetch(
    `${STEAM_BASE}/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  return json?.response?.success === 1 ? (json.response.steamid as string) : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`steam:${auth.userId ?? getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  let body: { identifier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const identifier = body.identifier?.trim();
  if (!identifier) {
    return NextResponse.json({ error: "Missing identifier." }, { status: 400 });
  }

  const apiKey = process.env.STEAM_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Steam integration is not configured on this server. Set STEAM_API_KEY in your environment." },
      { status: 503 }
    );
  }

  const cacheKey = identifier.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  let steamId: string | null;
  try {
    steamId = await resolveToSteamId(identifier, apiKey);
  } catch {
    return NextResponse.json({ error: "Failed to reach Steam API." }, { status: 502 });
  }

  if (!steamId) {
    return NextResponse.json(
      { error: "Steam profile not found. Check the username or URL." },
      { status: 404 }
    );
  }

  let summaryRes: Response, recentRes: Response;
  try {
    [summaryRes, recentRes] = await Promise.all([
      fetch(`${STEAM_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`, { cache: "no-store" }),
      fetch(`${STEAM_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&count=4`, { cache: "no-store" }),
    ]);
  } catch {
    return NextResponse.json({ error: "Failed to reach Steam API." }, { status: 502 });
  }

  if (!summaryRes.ok) {
    return NextResponse.json({ error: "Steam API error fetching profile." }, { status: 502 });
  }

  const summaryJson = await summaryRes.json();
  const player = summaryJson?.response?.players?.[0];
  if (!player) {
    return NextResponse.json(
      { error: "Player not found or profile is private." },
      { status: 404 }
    );
  }

  let status: SteamData["status"] = "offline";
  if (player.gameid) status = "ingame";
  else if (player.personastate === 1) status = "online";
  else if (player.personastate === 2) status = "busy";
  else if (player.personastate === 3 || player.personastate === 4) status = "away";
  else if (player.personastate >= 5) status = "online";

  let recentGames: SteamData["recentGames"] = [];
  if (recentRes.ok) {
    const recentJson = await recentRes.json();
    const games: {
      appid: number;
      name: string;
      playtime_2weeks?: number;
      playtime_forever: number;
      img_icon_url?: string;
    }[] = recentJson?.response?.games ?? [];
    recentGames = games.slice(0, 4).map((g) => ({
      appId: g.appid,
      name: g.name,
      playtime2weeks: g.playtime_2weeks,
      playtimeForever: g.playtime_forever,
      iconUrl: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : undefined,
    }));
  }

  const result: SteamData = {
    steamId,
    username: player.personaname as string,
    avatarUrl: (player.avatarmedium ?? player.avatar) as string | undefined,
    profileUrl: player.profileurl as string,
    status,
    currentGame: player.gameextrainfo as string | undefined,
    recentGames,
    fetchedAt: Date.now(),
  };

  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
  return NextResponse.json(result);
}
