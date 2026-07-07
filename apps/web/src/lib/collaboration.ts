/**
 * Collaboration layer — real-time room presence, cursor sync, and board op broadcasting.
 *
 * Uses Supabase Realtime:
 *   - Broadcast channel  → cursors + board mutations (ephemeral, no DB write)
 *   - Presence tracking  → who is in the room (auto-cleaned on disconnect)
 *
 * All functions accept a RealtimeChannel object returned by joinRoom — never
 * call supabase.channel(name) twice for the same name or you'll get duplicate
 * subscriptions on every render.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CollabPresence {
  userId: string;
  displayName: string;
  /** CSS hex color assigned to this member */
  color: string;
  joinedAt: string; // ISO 8601
}

export interface CursorState {
  userId: string;
  displayName: string;
  color: string;
  /** Canvas coordinates (before zoom) */
  x: number;
  y: number;
}

export interface ProfileListEntry {
  id: string;
  text: string;
  checked: boolean;
}

export type FontFamily = "sans" | "serif" | "mono" | "hand";
export type LineHeight = "tight" | "normal" | "relaxed";
export type LetterSpacing = "normal" | "wide" | "wider";

export type ProfileBlockItem =
  | {
      id: string; type: "text"; content: string;
      fontSize?: number;
      fontFamily?: FontFamily;
      fontWeight?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      color?: string;
      align?: "left" | "center" | "right";
      lineHeight?: LineHeight;
      letterSpacing?: LetterSpacing;
    }
  | {
      id: string; type: "list"; title: string; entries: ProfileListEntry[];
      fontSize?: number;
      fontFamily?: FontFamily;
      color?: string;
    };

export interface ProfileBlock {
  id: string;
  color: string;
  bgImage?: string;
  bgOpacity?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  items: ProfileBlockItem[];
}

export interface SelfIdentity {
  userId: string;
  displayName: string;
  username?: string;
  color: string;
  avatarUrl?: string;
  bannerUrl?: string;
  status?: string;
  statusEmoji?: string;
  bio?: string;
  pronouns?: string;
  favoriteBoardId?: string;
  profileBoard?: { blocks: ProfileBlock[]; bg?: string; bgImage?: string };
}

/** A board-level mutation broadcast from one collaborator to others. */
export interface BoardOp {
  op: string;
  senderId: string;
  boardId: string;
  [key: string]: unknown;
}

export interface TimerSyncState {
  running: boolean;
  remaining: number;
  elapsed: number;
  phase: "work" | "break" | "long-break";
  cycleCount: number;
  /** performance.now() snapshot at broadcast time — used for drift correction */
  sentAt: number;
}

export interface CollabTableRow {
  itemId: string;
  boardId: string;
  rowId: string;
  cells: Record<string, string | boolean>;
  deleted?: boolean;
}

// ─── Self-identity ────────────────────────────────────────────────────────────

const COLLAB_COLORS = [
  "#d59ee8", "#eb459e", "#57f287", "#fee75c",
  "#ed4245", "#00b0f4", "#faa61a", "#9c84ef",
];

export function getSelfIdentity(): SelfIdentity {
  if (typeof window === "undefined") return { userId: "ssr", displayName: "You", color: COLLAB_COLORS[0] };
  const stored = localStorage.getItem("plancraft-user-identity");
  if (stored) { try { return JSON.parse(stored) as SelfIdentity; } catch {} }
  // Use crypto.randomUUID() for a proper UUID — avoids collision on concurrent tabs
  const userId = crypto.randomUUID();
  const color = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
  const identity: SelfIdentity = { userId, displayName: "Anonymous", color };
  localStorage.setItem("plancraft-user-identity", JSON.stringify(identity));
  return identity;
}

export function updateSelfIdentity(patch: Partial<Omit<SelfIdentity, "userId">>): void {
  if (typeof window === "undefined") return;
  const identity = getSelfIdentity();
  localStorage.setItem("plancraft-user-identity", JSON.stringify({ ...identity, ...patch }));
}

// ─── Room management ──────────────────────────────────────────────────────────

/**
 * Join a collaboration room for a board.
 *
 * Creates a single Supabase Realtime channel, subscribes with presence tracking,
 * and returns the channel object. All other collab functions accept this channel
 * object — never call supabase.channel() again for the same board.
 */
export async function joinRoom(
  boardId: string
): Promise<{ boardId: string; channel: RealtimeChannel }> {
  const { userId, displayName, color } = getSelfIdentity();

  const channel = supabase.channel(`room:${boardId}`, {
    config: { presence: { key: userId } },
  });

  await new Promise<void>((resolve) => {
    // Presence tracking requires SUBSCRIBED status before track() can be called
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            userId,
            displayName,
            color,
            joinedAt: new Date().toISOString(),
          } satisfies CollabPresence);
        } catch {
          // Track failure is non-fatal — channel is still usable for broadcasts
        }
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Resolve anyway so the UI never hangs offline
        resolve();
      }
    });
    // Failsafe: resolve after 6 seconds even if Supabase never responds
    setTimeout(resolve, 6_000);
  });

  return { boardId, channel };
}

/**
 * Leave a collaboration room — untracks presence and removes the channel.
 */
export async function leaveRoom(channel: RealtimeChannel): Promise<void> {
  try {
    await channel.untrack();
  } catch { /* ignore — channel may already be closed */ }
  await supabase.removeChannel(channel);
}

// ─── Presence ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to who is currently in the room.
 * Fires immediately with the current presence state, then on every sync event.
 */
export function subscribeToPresence(
  channel: RealtimeChannel,
  cb: (members: CollabPresence[]) => void
): () => void {
  const fireSync = () => {
    const raw = channel.presenceState<CollabPresence>();
    cb(Object.values(raw).flat());
  };

  channel.on("presence", { event: "sync" }, fireSync);
  // Fire immediately in case the sync event already fired before this handler registered
  fireSync();

  return () => {}; // channel is torn down entirely by leaveRoom
}

// ─── Cursors ──────────────────────────────────────────────────────────────────

/**
 * Broadcast your cursor position to all room members.
 */
export async function broadcastCursor(
  channel: RealtimeChannel,
  cursor: CursorState
): Promise<void> {
  await channel.send({ type: "broadcast", event: "cursor", payload: cursor });
}

/**
 * Subscribe to remote cursor moves.
 * Maintains a per-user map so stale cursors from the same user are replaced.
 */
export function subscribeToCursors(
  channel: RealtimeChannel,
  cb: (cursors: CursorState[]) => void
): () => void {
  const map = new Map<string, CursorState>();

  channel.on(
    "broadcast",
    { event: "cursor" },
    ({ payload }: { payload: CursorState }) => {
      map.set(payload.userId, payload);
      cb(Array.from(map.values()));
    }
  );

  return () => {};
}

// ─── Board ops (command-sourcing) ─────────────────────────────────────────────

/**
 * Broadcast a store mutation to all peers in the room.
 * Peers receive the op and call the same store action locally.
 * Never broadcast ops that contain local-only state (selection, zoom, etc.).
 */
export async function broadcastBoardOp(
  channel: RealtimeChannel,
  op: BoardOp
): Promise<void> {
  await channel.send({ type: "broadcast", event: "board:op", payload: op });
}

/**
 * Subscribe to board ops broadcast by other peers.
 */
export function subscribeToBoardOps(
  channel: RealtimeChannel,
  cb: (op: BoardOp) => void
): () => void {
  channel.on(
    "broadcast",
    { event: "board:op" },
    ({ payload }: { payload: BoardOp }) => {
      cb(payload);
    }
  );
  return () => {};
}

// ─── Timer sync ───────────────────────────────────────────────────────────────

export async function broadcastTimerState(
  channel: RealtimeChannel,
  itemId: string,
  state: TimerSyncState
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: `timer:${itemId}`,
    payload: { ...state, sentAt: performance.now() },
  });
}

export function subscribeToTimerSync(
  channel: RealtimeChannel,
  itemId: string,
  cb: (state: TimerSyncState) => void
): () => void {
  channel.on(
    "broadcast",
    { event: `timer:${itemId}` },
    ({ payload }: { payload: TimerSyncState }) => {
      const driftSecs = (performance.now() - payload.sentAt) / 1000;
      cb({
        ...payload,
        remaining: Math.max(0, payload.remaining - (payload.running ? driftSecs : 0)),
        elapsed: payload.elapsed + (payload.running ? driftSecs : 0),
      });
    }
  );
  return () => {};
}

// ─── Collaborative table rows ─────────────────────────────────────────────────

export async function broadcastTableRow(
  channel: RealtimeChannel,
  row: CollabTableRow
): Promise<void> {
  await channel.send({
    type: "broadcast",
    event: `table:${row.itemId}`,
    payload: row,
  });
}

export function subscribeToTableRows(
  channel: RealtimeChannel,
  itemId: string,
  cb: (row: CollabTableRow) => void
): () => void {
  channel.on(
    "broadcast",
    { event: `table:${itemId}` },
    ({ payload }: { payload: CollabTableRow }) => {
      cb(payload);
    }
  );
  return () => {};
}
