"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Twitch, Users, ExternalLink, RefreshCw, CalendarClock } from "lucide-react";
import { BlockItem, TwitchData, useBoardStore } from "@/store/boardStore";
import { communityStyle, CommunityAppearanceSection } from "@/components/items/CommunityItems";

const TWITCH_PURPLE = "#9146FF";
const STALE_MS = 60 * 1000;      // refetch if data older than this
const POLL_MS = 60 * 1000;       // live-status refresh cadence while mounted

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchTwitch(channel: string, schedule: boolean): Promise<TwitchData> {
  const res = await fetch("/api/integrations/twitch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, schedule }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to fetch Twitch status.");
  return json as TwitchData;
}

// ─── Time helpers ───────────────────────────────────────────────────────────────

function liveFor(startedAt?: string): string {
  if (!startedAt) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function untilStream(startTime: string): string {
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  if (days >= 1) return `in ${days}d`;
  const hours = Math.floor(mins / 60);
  if (hours >= 1) return `in ${hours}h`;
  return `in ${mins}m`;
}

function fmtViewers(n?: number): string {
  if (n == null) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);
}

// ─── Component ──────────────────────────────────────────────────────────────────

interface Props {
  item: BlockItem;
  boardId: string;
  boxId: string;
  collapsed?: boolean;
  isFinished?: boolean;
  onUpdate?: (patch: Partial<BlockItem>) => void;
}

export function TwitchItem({ item, boardId, boxId, collapsed, isFinished, onUpdate }: Props) {
  const updateItem = useBoardStore((s) => s.updateItem);
  const updateBoardItem = useBoardStore((s) => s.updateBoardItem);

  const upd = useCallback((patch: Partial<BlockItem>) => {
    if (onUpdate) { onUpdate(patch); return; }
    if (boxId) updateItem(boardId, boxId, item.id, patch);
    else updateBoardItem(boardId, item.id, patch);
  }, [onUpdate, updateItem, updateBoardItem, boardId, boxId, item.id]);

  const channel = item.twitchChannel;
  const data = item.twitchData;
  const showSchedule = item.twitchShowSchedule !== false;
  const purple = item.communityAccent || TWITCH_PURPLE;
  const { container } = communityStyle(item, TWITCH_PURPLE);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(!channel);
  const [draft, setDraft] = useState(channel ?? "");

  const load = useCallback(async (ch: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTwitch(ch, showSchedule);
      upd({ twitchData: result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [upd, showSchedule]);

  // Initial / channel-change fetch when stale.
  useEffect(() => {
    if (!channel || showSetup) return;
    const stale = !data || Date.now() - data.fetchedAt > STALE_MS;
    if (stale && !loading) void load(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // Periodic live-status refresh while mounted.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!channel || showSetup) return;
    const id = setInterval(() => { void loadRef.current(channel); }, POLL_MS);
    return () => clearInterval(id);
  }, [channel, showSetup]);

  // ── Collapsed view ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs truncate">
        <Twitch size={11} className="flex-shrink-0" style={{ color: purple }} />
        <span className="font-bold truncate">{data?.displayName ?? channel ?? "Twitch"}</span>
        {data?.isLive ? (
          <span className="flex items-center gap-1 flex-shrink-0 text-red-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {fmtViewers(data.viewerCount)}
          </span>
        ) : (
          <span className="flex-shrink-0 text-[var(--text-muted)]">Offline</span>
        )}
      </div>
    );
  }

  // ── Setup form ──────────────────────────────────────────────────────────────
  if (showSetup || !channel) {
    const save = () => {
      const ch = draft.trim().toLowerCase().replace(/^@/, "");
      if (!ch) return;
      upd({ twitchChannel: ch, twitchData: undefined });
      setShowSetup(false);
      void load(ch);
    };
    return (
      <div className="flex h-full w-full flex-col justify-center gap-2 p-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: purple }}>
          <Twitch size={14} /> Twitch channel
        </div>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          placeholder="channel name"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
        />
        <div className="flex gap-1.5">
          <button onClick={save} className="flex-1 rounded px-2 py-1.5 text-xs font-medium text-white" style={{ background: purple }}>Track</button>
          {channel && <button onClick={() => setShowSetup(false)} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>}
        </div>
      </div>
    );
  }

  const channelUrl = `https://twitch.tv/${channel}`;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-[var(--border)]" style={{ background: "var(--surface-raised)", ...container }}>
      {/* Header — data-item-drag: grabbing it moves the item on the board canvas */}
      <div data-item-drag className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 flex-shrink-0" style={{ borderLeftWidth: 3, borderLeftColor: purple }}>
        <Twitch size={13} style={{ color: purple }} className="flex-shrink-0" />
        <span className="flex-1 truncate text-xs font-bold">{data?.displayName ?? channel}</span>
        {data?.isLive ? (
          <span className="flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-black tracking-wide text-red-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
          </span>
        ) : (
          <span className="rounded bg-[var(--surface-overlay)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">OFFLINE</span>
        )}
        {!isFinished && (
          <button onClick={() => { setDraft(channel); setShowSetup(true); }} title="Change channel" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <RefreshCw size={11} className={loading ? "animate-spin" : undefined} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <div className="p-3 text-xs text-[var(--text-muted)]">
            <p className="mb-2">{error}</p>
            <button onClick={() => void load(channel)} className="rounded border border-[var(--border)] px-2 py-1 hover:text-[var(--text-primary)]">Retry</button>
          </div>
        ) : data?.isLive ? (
          <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="block group">
            {data.thumbnailUrl && (
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${data.thumbnailUrl}?t=${Math.floor(data.fetchedAt / 60000)}`} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                {data.viewerCount != null && (
                  <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    <Users size={9} /> {fmtViewers(data.viewerCount)}
                  </span>
                )}
              </div>
            )}
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-[var(--accent)]">{data.title || "Untitled stream"}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                {data.gameName && <span className="truncate">{data.gameName}</span>}
                {data.startedAt && <span className="flex-shrink-0">· {liveFor(data.startedAt)}</span>}
              </div>
            </div>
          </a>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
            {data?.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.profileImageUrl} alt="" className="h-12 w-12 rounded-full" />
            )}
            <p className="text-xs font-semibold">{data?.displayName ?? channel}</p>
            {data?.nextStream ? (
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <CalendarClock size={11} className="flex-shrink-0" />
                <span className="truncate">
                  {data.nextStream.title || data.nextStream.category || "Next stream"} · {untilStream(data.nextStream.startTime)}
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">Currently offline</p>
            )}
            <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-[11px] font-medium hover:underline" style={{ color: purple }}>
              Visit channel <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style panel ─────────────────────────────────────────────────────────────────

export function TwitchStylePanel({ item, upd }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void }) {
  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Channel</p>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-colors"
          placeholder="channel name"
          value={item.twitchChannel ?? ""}
          onChange={(e) => upd({ twitchChannel: e.target.value.trim().toLowerCase().replace(/^@/, "") || undefined, twitchData: undefined })}
        />
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">The board shows live/offline status and refreshes automatically.</p>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Behaviour</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={item.twitchShowSchedule !== false} onChange={(e) => upd({ twitchShowSchedule: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-[var(--text-secondary)]">Show next scheduled stream when offline</span>
        </label>
      </div>
      <CommunityAppearanceSection item={item} upd={upd} />
    </div>
  );
}
