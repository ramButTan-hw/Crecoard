import type { BlockItem, BoardLevelItem } from "@/store/boardStore";

// ─── Multi-platform embed resolver ───────────────────────────────────────────
// Pure helpers shared by the playlist item UI (ItemRenderer) and the global
// PlayerHost (components/player/PlayerHost.tsx), which owns the actual media
// elements so playback survives board switches.

export interface EmbedResult {
  kind: "iframe" | "audio" | "link";
  url: string;
  platform: string;
  /** CSS aspect-ratio string for the player container, e.g. "16/9" or undefined for fixed-height */
  aspectRatio?: string;
  /** Fixed pixel height (use instead of aspectRatio for compact embeds like Spotify track) */
  fixedHeight?: number;
  /** True when the URL is a playlist/album (not a single track) */
  isPlaylist?: boolean;
  /** Spotify URI (spotify:track:…) — drives the Spotify iFrame API controller for play/pause/seek */
  spotifyUri?: string;
}

export function resolveEmbed(raw: string, autoplay: boolean): EmbedResult {
  const url = raw.trim();

  // origin is required for YouTube's postMessage API to send state events back
  const ytOrigin = typeof window !== "undefined" ? `&origin=${encodeURIComponent(window.location.origin)}` : "";

  // YouTube playlist
  const ytPlaylistMatch = url.match(/youtube\.com\/(?:playlist\?|watch\?[^#]*)list=([A-Za-z0-9_-]+)/);
  if (ytPlaylistMatch) return {
    kind: "iframe",
    url: `https://www.youtube.com/embed/videoseries?list=${ytPlaylistMatch[1]}&autoplay=${autoplay ? 1 : 0}&rel=0&enablejsapi=1${ytOrigin}`,
    platform: "YouTube",
    aspectRatio: "16/9",
    isPlaylist: true,
  };

  // YouTube / YouTube Music (individual videos)
  const ytPats = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com|music\.youtube\.com)\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of ytPats) {
    const m = url.match(p);
    if (m) return {
      kind: "iframe",
      url: `https://www.youtube.com/embed/${m[1]}?autoplay=${autoplay ? 1 : 0}&rel=0&enablejsapi=1${ytOrigin}`,
      platform: "YouTube",
      aspectRatio: "16/9",
    };
  }

  // Spotify — embed URL for display, URI for the iFrame API controller (playback control)
  const spMatch = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
  if (spMatch) return {
    kind: "iframe",
    url: `https://open.spotify.com/embed/${spMatch[1]}/${spMatch[2]}`,
    platform: "Spotify",
    fixedHeight: spMatch[1] === "track" || spMatch[1] === "episode" ? 152 : 352,
    isPlaylist: spMatch[1] !== "track" && spMatch[1] !== "episode",
    spotifyUri: `spotify:${spMatch[1]}:${spMatch[2]}`,
  };

  // SoundCloud
  if (/soundcloud\.com/.test(url)) return {
    kind: "iframe",
    url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=${autoplay}&hide_related=true&show_comments=false&visual=true&color=%23d59ee8`,
    platform: "SoundCloud",
    fixedHeight: 166,
  };

  // Apple Music
  const amMatch = url.match(/music\.apple\.com\/([a-z]{2})\/(album|playlist|song|artist)\/([^/?]+)(?:\/([^/?]+))?/);
  if (amMatch) return {
    kind: "iframe",
    url: `https://embed.music.apple.com/${amMatch[1]}/${amMatch[2]}/${amMatch[3]}${amMatch[4] ? "/" + amMatch[4] : ""}`,
    platform: "Apple Music",
    fixedHeight: 175,
  };

  // Deezer
  const dzMatch = url.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist)\/(\d+)/);
  if (dzMatch) return {
    kind: "iframe",
    url: `https://widget.deezer.com/widget/dark/${dzMatch[1]}/${dzMatch[2]}${autoplay ? "?autoplay=true" : ""}`,
    platform: "Deezer",
    fixedHeight: 300,
  };

  // Tidal (no public embed — link out)
  if (/tidal\.com/.test(url)) return { kind: "link", url, platform: "Tidal" };

  // Bandcamp (no reliable embed URL from page URL — link out)
  if (/bandcamp\.com/.test(url)) return { kind: "link", url, platform: "Bandcamp" };

  // Amazon Music (no embed — link out)
  if (/music\.amazon/.test(url)) return { kind: "link", url, platform: "Amazon Music" };

  // Direct audio file
  if (/\.(mp3|ogg|wav|m4a|flac|aac|opus)(\?.*)?$/i.test(url)) return {
    kind: "audio",
    url,
    platform: "Audio file",
  };

  // Generic iframe attempt for everything else
  if (url.startsWith("http")) return { kind: "iframe", url, platform: "Web", aspectRatio: "16/9" };

  return { kind: "link", url, platform: "Unknown" };
}

export const PLATFORM_COLORS: Record<string, string> = {
  YouTube: "#ff0000",
  Spotify: "#1db954",
  SoundCloud: "#ff5500",
  "Apple Music": "#fc3c44",
  Deezer: "#a238ff",
  Tidal: "#00ffff",
  Bandcamp: "#1da0c3",
  "Amazon Music": "#00a8e0",
};

export function getStaticThumbnail(trackUrl: string): string | null {
  const ytId = trackUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/
  )?.[1];
  if (ytId) return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  return null;
}

/** True when the app can programmatically control playback for this platform. */
export function platformControllable(platform: string): boolean {
  return platform === "YouTube" || platform === "SoundCloud" || platform === "Audio file" || platform === "Spotify";
}

/**
 * Next track index respecting shuffle/loop; null when playback should stop
 * (end of list without loop, or nothing to advance to).
 */
export function advancePlaylistIndex(item: BlockItem | BoardLevelItem, dir: 1 | -1): number | null {
  const tracks = item.playlistTracks ?? [];
  if (tracks.length === 0) return null;
  const current = Math.min(item.playlistCurrentIndex ?? 0, tracks.length - 1);
  if (dir === 1 && item.playlistShuffle && tracks.length > 1) {
    let next = current;
    while (next === current) next = Math.floor(Math.random() * tracks.length);
    return next;
  }
  if (item.playlistLoop) return (current + dir + tracks.length) % tracks.length;
  const next = current + dir;
  if (next < 0) return current === 0 ? null : 0;
  if (next > tracks.length - 1) return null;
  return next;
}

// ─── Per-function permissions ─────────────────────────────────────────────────
// Granular allowlists stored in item.perms.fns — same semantics as the other
// ItemPerms sets (undefined = everyone, [] = owner-only, [ids] = those roles).

export interface ItemFnDef {
  id: string;
  label: string;
  description: string;
}

/** Per-item-type function permission schemas (shown in the item Permission modal). */
export const ITEM_FN_SCHEMAS: Record<string, ItemFnDef[]> = {
  playlist: [
    { id: "playback",     label: "Playback",       description: "Play, pause, skip, and pick tracks" },
    { id: "queue-add",    label: "Add tracks",     description: "Add new tracks to the queue" },
    { id: "queue-remove", label: "Remove tracks",  description: "Remove tracks from the queue" },
    { id: "import",       label: "Import playlists", description: "Bulk-import externals (YouTube playlists)" },
    { id: "volume",       label: "Volume",         description: "Change the player volume" },
    { id: "modes",        label: "Loop & shuffle", description: "Toggle loop and shuffle modes" },
    { id: "session-host", label: "Host live session", description: "Start and control a synced listening session" },
  ],
};

/** Stable key identifying one rendered playlist instance. */
export function playerKeyOf(boardId: string, boxId: string, itemId: string): string {
  return `${boardId}::${boxId}::${itemId}`;
}
