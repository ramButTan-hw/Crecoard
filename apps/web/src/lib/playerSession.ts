"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getSelfIdentity } from "@/lib/collaboration";
import { usePlayerStore, type PlayerClaim } from "@/store/playerStore";
import { useBoardStore, type BlockItem, type BoardLevelItem } from "@/store/boardStore";

/**
 * Live listening/watching sessions for playlist items.
 *
 * A host broadcasts {track index, playing, position} over a Supabase realtime
 * channel (`player-session:{serverId}:{itemId}`); listeners apply it to their
 * local copy of the item through the global player. Sessions are keyed by
 * item id, which is shared between a server's draft and :live snapshot — so
 * the owner hosting from the draft syncs members viewing the live board.
 *
 * The engine is a module-level singleton (not component state) so that
 * joining a session survives board switches: the mini-player keeps following
 * the host even when the playlist item itself is unmounted. Components use
 * usePlayerSession() as a thin view/controller.
 *
 * Position/play sync needs a controllable platform (YouTube, SoundCloud,
 * audio files). Other platforms (Spotify et al.) sync at track granularity.
 */

export interface SessionStatus {
  /** A host is currently present on this item's channel. */
  active: boolean;
  hostName: string | null;
  /** Everyone on the channel who joined (host + listeners). */
  participants: number;
  joined: boolean;
  isHost: boolean;
}

const IDLE_STATUS: SessionStatus = { active: false, hostName: null, participants: 0, joined: false, isHost: false };

interface StateMsg { t: "state"; idx: number; playing: boolean; pos: number; at: number }
type SessionMsg = StateMsg | { t: "sync-req" } | { t: "ended" };

interface PresenceMeta { userId: string; name: string; host: boolean; canHost: boolean; joinedAt: number }

interface Entry {
  channel: RealtimeChannel;
  ready: Promise<void>;
  observers: Set<(s: SessionStatus) => void>;
  active: boolean;
  hostName: string | null;
  participants: number;
  /** Pending "session over" timer while the host is gone (grace for handoff). */
  endGrace: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();

// Presence key must be unique per tab (not per user) so one user's tabs don't
// clobber each other's presence meta.
const tabKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

let participation: {
  key: string;
  serverId: string;
  itemId: string;
  role: "host" | "listener";
  claim: PlayerClaim;
  canHost: boolean;
  joinedAt: number;
  heartbeat: ReturnType<typeof setInterval> | null;
} | null = null;

const keyOf = (serverId: string, itemId: string) => `${serverId}::${itemId}`;
const supabaseReady = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL;

// ─── Item helpers (store-based so the engine works with the item unmounted) ──

function lookupItem(claim: PlayerClaim): BlockItem | BoardLevelItem | undefined {
  const s = useBoardStore.getState();
  const board = s.boards.find((b) => b.id === claim.boardId) ?? s.serverBoards[claim.boardId];
  if (!board) return undefined;
  if (claim.boxId) return board.boxes.find((b) => b.id === claim.boxId)?.items.find((i) => i.id === claim.itemId);
  return board.boardItems?.find((i) => i.id === claim.itemId);
}

function patchItem(claim: PlayerClaim, patch: Partial<BlockItem>) {
  const s = useBoardStore.getState();
  if (claim.boxId) s.updateItem(claim.boardId, claim.boxId, claim.itemId, patch);
  else s.updateBoardItem(claim.boardId, claim.itemId, patch as Partial<BoardLevelItem>);
}

function currentIdxOf(item: BlockItem | BoardLevelItem): number {
  const len = item.playlistTracks?.length ?? 0;
  return Math.min(item.playlistCurrentIndex ?? 0, Math.max(0, len - 1));
}

// ─── State build/apply ────────────────────────────────────────────────────────

function buildState(): StateMsg | null {
  if (!participation) return null;
  const item = lookupItem(participation.claim);
  if (!item) return null;
  const ps = usePlayerStore.getState();
  const playing = ps.playing === true;
  const p = ps.position;
  const pos = p ? (playing ? p.sec + (Date.now() - p.at) / 1000 : p.sec) : 0;
  return { t: "state", idx: currentIdxOf(item), playing, pos, at: Date.now() };
}

function applyState(s: StateMsg) {
  if (!participation || participation.role !== "listener") return;
  const { claim } = participation;
  const item = lookupItem(claim);
  if (!item) return;
  // userIntent (→ autoplay) only when the host is actually playing — otherwise a
  // listener joining a paused session would blip audio until the first pause.
  usePlayerStore.getState().claimPlayer(claim, { steal: true, userIntent: s.playing });
  if (s.idx !== currentIdxOf(item)) {
    // Track change remounts the media; the next heartbeat aligns the position.
    patchItem(claim, { playlistCurrentIndex: s.idx });
    return;
  }
  const ps = usePlayerStore.getState();
  const c = ps.controls;
  if (!c) return; // platform without an API — track-level sync only
  if (s.playing && ps.playing !== true) c.play();
  else if (!s.playing && ps.playing === true) c.pause();
  const expected = s.playing ? s.pos + (Date.now() - s.at) / 1000 : s.pos;
  const local = ps.position;
  if (local) {
    const localNow = ps.playing === true ? local.sec + (Date.now() - local.at) / 1000 : local.sec;
    if (Math.abs(localNow - expected) > 3) c.seek(expected);
  } else if (s.playing && s.pos > 3) {
    c.seek(expected);
  }
}

// ─── Channel lifecycle ────────────────────────────────────────────────────────

function acquire(serverId: string, itemId: string): Entry {
  const key = keyOf(serverId, itemId);
  let entry = entries.get(key);
  if (entry) return entry;

  const channel = supabase.channel(`player-session:${serverId}:${itemId}`, {
    config: { presence: { key: tabKey } },
  });

  channel.on("presence", { event: "sync" }, () => {
    const e = entries.get(key);
    if (!e) return;
    const state = channel.presenceState<PresenceMeta>();
    const byKey = Object.entries(state).flatMap(([k, metas]) => {
      const m = metas[metas.length - 1];
      return m ? [{ k, m }] : [];
    });
    const host = byKey.find((x) => x.m.host)?.m ?? null;
    e.active = !!host;
    e.hostName = host?.name ?? null;
    e.participants = byKey.length;

    if (host) {
      if (e.endGrace) { clearTimeout(e.endGrace); e.endGrace = null; }
    } else if (participation?.key === key && participation.role === "listener") {
      // Host left. Deterministic handoff: the longest-tenured listener who may
      // host promotes itself; everyone else gives the handoff a grace window
      // before treating the session as over (playback keeps going locally).
      const candidates = byKey
        .filter((x) => x.m.canHost && !x.m.host)
        .sort((a, b) => (a.m.joinedAt - b.m.joinedAt) || (a.k < b.k ? -1 : 1));
      if (candidates[0]?.k === tabKey && participation.canHost) {
        promoteToHost();
      } else if (!e.endGrace) {
        e.endGrace = setTimeout(() => {
          const cur = entries.get(key);
          if (cur) cur.endGrace = null;
          if (!cur?.active && participation?.key === key && participation.role === "listener") {
            clearParticipation();
          }
        }, 8000);
      }
    }
    notify(key);
  });

  channel.on("broadcast", { event: "session" }, ({ payload }) => {
    const msg = payload as SessionMsg;
    if (!msg || participation?.key !== key) return;
    if (msg.t === "state") applyState(msg);
    else if (msg.t === "sync-req" && participation.role === "host") sendState();
    else if (msg.t === "ended" && participation.role === "listener") clearParticipation();
  });

  const ready = new Promise<void>((resolve) => {
    channel.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
  });

  entry = { channel, ready, observers: new Set(), active: false, hostName: null, participants: 0, endGrace: null };
  entries.set(key, entry);
  return entry;
}

/** Listener self-promotion after the host disappears (deterministic election). */
function promoteToHost() {
  if (!participation || participation.role !== "listener") return;
  const entry = entries.get(participation.key);
  if (!entry) return;
  participation.role = "host";
  participation.heartbeat = setInterval(sendState, 4000);
  usePlayerStore.getState().setSession({ itemId: participation.itemId, role: "host" });
  const identity = getSelfIdentity();
  void entry.channel.track({
    userId: identity.userId, name: identity.displayName,
    host: true, canHost: true, joinedAt: participation.joinedAt,
  } satisfies PresenceMeta);
  sendState();
  notify(participation.key);
}

function releaseIfUnused(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  if (entry.observers.size === 0 && participation?.key !== key) {
    entries.delete(key);
    void supabase.removeChannel(entry.channel);
  }
}

function notify(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  const joined = participation?.key === key;
  const status: SessionStatus = {
    active: entry.active || (joined && participation!.role === "host"),
    hostName: entry.hostName,
    participants: entry.participants,
    joined,
    isHost: joined && participation!.role === "host",
  };
  for (const cb of entry.observers) cb(status);
}

function sendState() {
  if (!participation || participation.role !== "host") return;
  const entry = entries.get(participation.key);
  const state = buildState();
  if (!entry || !state) return;
  void entry.channel.send({ type: "broadcast", event: "session", payload: state });
}

function clearParticipation() {
  if (!participation) return;
  const { key, heartbeat } = participation;
  if (heartbeat) clearInterval(heartbeat);
  const entry = entries.get(key);
  if (entry?.endGrace) { clearTimeout(entry.endGrace); entry.endGrace = null; }
  participation = null;
  usePlayerStore.getState().setSession(null);
  notify(key);
  releaseIfUnused(key);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function observeSession(serverId: string, itemId: string, cb: (s: SessionStatus) => void): () => void {
  if (!supabaseReady()) { cb(IDLE_STATUS); return () => {}; }
  const key = keyOf(serverId, itemId);
  const entry = acquire(serverId, itemId);
  entry.observers.add(cb);
  notify(key);
  return () => {
    entry.observers.delete(cb);
    releaseIfUnused(key);
  };
}

export function startSession(serverId: string, itemId: string, claim: PlayerClaim): void {
  if (!supabaseReady()) return;
  leaveSession();
  const key = keyOf(serverId, itemId);
  const entry = acquire(serverId, itemId);
  const joinedAt = Date.now();
  participation = {
    key, serverId, itemId, role: "host", claim, canHost: true, joinedAt,
    heartbeat: setInterval(sendState, 4000),
  };
  usePlayerStore.getState().setSession({ itemId, role: "host" });
  const identity = getSelfIdentity();
  void entry.ready.then(() => {
    void entry.channel.track({ userId: identity.userId, name: identity.displayName, host: true, canHost: true, joinedAt } satisfies PresenceMeta);
    sendState();
  });
  notify(key);
}

export function joinSession(serverId: string, itemId: string, claim: PlayerClaim, canHost = false): void {
  if (!supabaseReady()) return;
  leaveSession();
  const key = keyOf(serverId, itemId);
  const entry = acquire(serverId, itemId);
  const joinedAt = Date.now();
  participation = { key, serverId, itemId, role: "listener", claim, canHost, joinedAt, heartbeat: null };
  usePlayerStore.getState().setSession({ itemId, role: "listener" });
  const identity = getSelfIdentity();
  void entry.ready.then(() => {
    void entry.channel.track({ userId: identity.userId, name: identity.displayName, host: false, canHost, joinedAt } satisfies PresenceMeta);
    void entry.channel.send({ type: "broadcast", event: "session", payload: { t: "sync-req" } satisfies SessionMsg });
  });
  notify(key);
}

export function leaveSession(): void {
  if (!participation) return;
  const entry = entries.get(participation.key);
  if (entry) {
    if (participation.role === "host") {
      void entry.channel.send({ type: "broadcast", event: "session", payload: { t: "ended" } satisfies SessionMsg });
    }
    void entry.channel.untrack();
  }
  clearParticipation();
}

/** Host-side immediate push (call on local track/play changes; heartbeat covers the rest). */
export function announceSessionState(): void {
  sendState();
}

// ─── React hook (thin view/controller over the singleton) ───────────────────

export function usePlayerSession(serverId: string | null, itemId: string) {
  const [status, setStatus] = useState<SessionStatus>(IDLE_STATUS);

  useEffect(() => {
    if (!serverId) { setStatus(IDLE_STATUS); return; }
    return observeSession(serverId, itemId, setStatus);
  }, [serverId, itemId]);

  return {
    ...status,
    start: (claim: PlayerClaim) => { if (serverId) startSession(serverId, itemId, claim); },
    join: (claim: PlayerClaim, canHost = false) => { if (serverId) joinSession(serverId, itemId, claim, canHost); },
    leave: leaveSession,
  };
}
