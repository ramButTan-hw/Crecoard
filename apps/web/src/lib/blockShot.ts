"use client";

// ─── Offscreen block shots ────────────────────────────────────────────────────
// Archive pictures must show what's INSIDE a block, but most archive saves
// happen while the block is collapsed (context menu, auto-resets) — the
// expanded view isn't mounted. This module bridges lib code to a React host:
// BoardCanvas registers itself and, per request, mounts a hidden <BlockShot>
// (inside the full provider tree, so every item type renders) which rasterizes
// the block's items in their expanded layout and resolves with a PNG data URL.

export interface BlockShotRequest {
  boardId: string;
  boxId: string;
  resolve: (dataUrl: string | null) => void;
}

let host: ((req: BlockShotRequest) => void) | null = null;
// Serialize requests — the host renders one shot at a time
let chain: Promise<unknown> = Promise.resolve();

export function registerBlockShotHost(fn: (req: BlockShotRequest) => void): () => void {
  host = fn;
  return () => { if (host === fn) host = null; };
}

/** Render the block's contents offscreen and capture them. Null when no host is mounted or the capture fails. */
export function requestBlockShot(boardId: string, boxId: string): Promise<string | null> {
  const run = () =>
    new Promise<string | null>((resolve) => {
      if (!host) { resolve(null); return; }
      host({ boardId, boxId, resolve });
    });
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
