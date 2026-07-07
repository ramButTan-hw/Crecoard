import { NextRequest, NextResponse } from "next/server";
import type { TrackerGGGame, TrackerGGPlatform, TrackerGGData, TrackerGGStat } from "@/store/boardStore";
import { requireApiUser, rateLimit, getClientIp } from "@/lib/apiAuth";

const TRN_BASE = "https://public-api.tracker.gg/v2";

// Simple in-process cache so repeated requests for the same player
// don't burn rate limit — evicted after CACHE_TTL ms.
const cache = new Map<string, { data: TrackerGGData; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Accent color per game
const GAME_ACCENT: Record<TrackerGGGame, string> = {
  "valorant":      "#ff4655",
  "apex":          "#e6630a",
  "rocket-league": "#1e90ff",
  "fortnite":      "#e8d44d",
  "csgo":          "#f0a500",
};

// Which stat keys to surface per game (from the Tracker.gg overview segment)
const GAME_STATS: Record<TrackerGGGame, string[]> = {
  "valorant":      ["kDRatio", "headshotsPercentage", "wins", "matchesPlayed", "timePlayed", "damagePerRound"],
  "apex":          ["kills", "kDRatio", "damage", "wins", "matchesPlayed", "level"],
  "rocket-league": ["wins", "goals", "saves", "assists", "mvps", "goalShotRatio"],
  "fortnite":      ["wins", "kDRatio", "winRate", "top10", "matchesPlayed", "kills"],
  "csgo":          ["kills", "kDRatio", "headshots", "wins", "matchesPlayed", "timePlayed"],
};

// Which stat key holds the primary rank per game (if any)
const RANK_STAT: Partial<Record<TrackerGGGame, string>> = {
  "valorant":      "rank",
  "rocket-league": "rank",  // playlist-level
  "csgo":          "rank",
};

export async function POST(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`tracker-gg:${auth.userId ?? getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return limited.response;

  let body: { game?: string; platform?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const game     = body.game     as TrackerGGGame | undefined;
  const platform = body.platform as TrackerGGPlatform | undefined;
  const username = body.username;

  if (!game || !platform || !username) {
    return NextResponse.json({ error: "Missing game, platform, or username." }, { status: 400 });
  }

  // Crecoard's own key — stored server-side, never exposed to clients
  const apiKey = process.env.TRACKER_GG_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Tracker.gg integration is not configured on this server. Set TRACKER_GG_API_KEY in your environment." },
      { status: 503 }
    );
  }

  // Serve from cache if fresh
  const cacheKey = `${game}:${platform}:${username.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const url = `${TRN_BASE}/${game}/standard/profile/${platform}/${encodeURIComponent(username)}`;

  let trnRes: Response;
  try {
    trnRes = await fetch(url, {
      headers: { "TRN-Api-Key": apiKey, "Accept": "application/json" },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach Tracker.gg API." }, { status: 502 });
  }

  if (!trnRes.ok) {
    const text = await trnRes.text().catch(() => "");
    if (trnRes.status === 401) return NextResponse.json({ error: "Tracker.gg authentication failed. The server key may be invalid or expired — contact the site admin." }, { status: 401 });
    if (trnRes.status === 403) return NextResponse.json({ error: "Tracker.gg key does not have permission for this endpoint. Contact the site admin." }, { status: 403 });
    if (trnRes.status === 429) return NextResponse.json({ error: "Rate limited by Tracker.gg. Try again in a moment." }, { status: 429 });
    if (trnRes.status === 404) return NextResponse.json({ error: "Player not found. Check the username and platform." }, { status: 404 });
    return NextResponse.json({ error: `Tracker.gg error ${trnRes.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const json = await trnRes.json();
  const data = json?.data;

  if (!data) {
    return NextResponse.json({ error: "Unexpected response from Tracker.gg." }, { status: 502 });
  }

  // Extract platform info
  const platformInfo = data.platformInfo ?? {};
  const resolvedUsername: string = platformInfo.platformUserHandle ?? username;
  const avatarUrl: string | undefined = platformInfo.avatarUrl;

  // Find overview segment
  const overview = (data.segments ?? []).find(
    (s: { type: string }) => s.type === "overview"
  );
  const rawStats: Record<string, {
    displayName: string;
    displayValue: string;
    percentile?: number;
    metadata?: { iconUrl?: string; tierName?: string };
  }> = overview?.stats ?? {};

  const wantedKeys = GAME_STATS[game] ?? Object.keys(rawStats).slice(0, 6);
  const stats: TrackerGGStat[] = wantedKeys
    .filter((k) => rawStats[k])
    .map((k) => ({
      key:        k,
      label:      rawStats[k].displayName,
      value:      rawStats[k].displayValue,
      percentile: rawStats[k].percentile,
    }));

  // Primary rank
  const rankKey  = RANK_STAT[game];
  const rankStat = rankKey ? rawStats[rankKey] : undefined;
  const rankLabel   = rankStat?.metadata?.tierName ?? rankStat?.displayValue;
  const rankIconUrl = rankStat?.metadata?.iconUrl;

  const result: TrackerGGData = {
    username:     resolvedUsername,
    avatarUrl,
    rankLabel,
    rankIconUrl,
    accentColor:  GAME_ACCENT[game],
    stats,
    fetchedAt:    Date.now(),
  };

  // Store in cache
  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });

  return NextResponse.json(result);
}
