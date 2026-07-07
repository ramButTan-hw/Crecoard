import { create } from "zustand";
import { playerKeyOf } from "@/lib/playlist";

/**
 * Global music/video player state. The actual media elements live in
 * PlayerHost (mounted once in AppShell) so playback survives board switches;
 * playlist items are remote controls that "claim" the player.
 *
 * The queue/track/volume state itself stays on the playlist item in the board
 * store (single source of truth) — this store only tracks WHICH item owns the
 * player and where its on-screen slot is.
 */

export interface PlayerClaim {
  boardId: string;
  boxId: string; // "" for board-level items
  itemId: string;
  /** Viewer's granular perms snapshot, evaluated by the claiming item */
  canPlayback: boolean;
  canVolume: boolean;
}

interface SlotEntry {
  el: HTMLElement;
  /** False when the viewer lacks interact permission — media gets pointer-events:none */
  interactive: boolean;
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
}

interface PlayerStore {
  claim: PlayerClaim | null;
  /** True once the user explicitly started playback via app controls — from then on track changes autoplay. */
  userStarted: boolean;
  /** true/false when the platform reports state (YouTube/SoundCloud/audio); null = unknown (Spotify et al.) */
  playing: boolean | null;
  /** On-screen embed slots keyed by playerKeyOf(...) — PlayerHost pins media over the claimed one. */
  slots: Record<string, SlotEntry>;
  /** Last reported playback position of the current media (registered by PlayerHost bridges). */
  position: { sec: number; at: number } | null;
  /** Imperative controls for the current media — null for platforms without an API (Spotify et al.). */
  controls: PlayerControls | null;
  /** Mirror of the live-session participation (set by lib/playerSession) — for LIVE badges. */
  session: { itemId: string; role: "host" | "listener" } | null;

  /**
   * Take ownership of the player. Without `steal`, only succeeds when the
   * player is free, already ours, or idle (not actively playing) — so a
   * playlist mounting on a new board doesn't cut off music from another one.
   */
  claimPlayer: (claim: PlayerClaim, opts?: { steal?: boolean; userIntent?: boolean }) => void;
  releasePlayer: () => void;
  registerSlot: (key: string, el: HTMLElement, interactive: boolean) => void;
  unregisterSlot: (key: string, el: HTMLElement) => void;
  setPlaying: (v: boolean | null) => void;
  setPosition: (p: { sec: number; at: number } | null) => void;
  setControls: (c: PlayerControls | null) => void;
  setSession: (s: { itemId: string; role: "host" | "listener" } | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  claim: null,
  userStarted: false,
  playing: null,
  slots: {},
  position: null,
  controls: null,
  session: null,

  claimPlayer: (claim, opts) => {
    const { claim: cur, playing } = get();
    const curKey = cur ? playerKeyOf(cur.boardId, cur.boxId, cur.itemId) : null;
    const newKey = playerKeyOf(claim.boardId, claim.boxId, claim.itemId);
    const sameOwner = curKey === newKey;
    if (!sameOwner && !opts?.steal && cur && playing === true) return; // don't cut off active music
    set((s) => ({
      claim,
      userStarted: sameOwner ? (s.userStarted || !!opts?.userIntent) : !!opts?.userIntent,
      playing: sameOwner ? s.playing : null,
    }));
  },

  releasePlayer: () => set({ claim: null, userStarted: false, playing: null }),

  registerSlot: (key, el, interactive) =>
    set((s) => ({ slots: { ...s.slots, [key]: { el, interactive } } })),

  unregisterSlot: (key, el) =>
    set((s) => {
      if (s.slots[key]?.el !== el) return s; // a newer slot already replaced it
      const next = { ...s.slots };
      delete next[key];
      return { slots: next };
    }),

  setPlaying: (v) => set({ playing: v }),
  setPosition: (p) => set({ position: p }),
  setControls: (c) => set({ controls: c }),
  setSession: (s) => set({ session: s }),
}));
