import type { Modifier } from "@dnd-kit/core";
import { GRID_MINOR } from "./boardConstants";

// Magnetic snapping: instead of quantizing every frame (which feels clunky), the
// item moves freely and only "clicks" to a gridline when it comes within
// SNAP_THRESHOLD of one. Hold ⌘/Ctrl to move completely freely.

export const SNAP_STEP = GRID_MINOR;   // snap to the visible minor grid (20px)
export const SNAP_THRESHOLD = 5;       // canvas px within which the pull kicks in

// Global bypass — true while ⌘ or Ctrl is held. Tracked here so both the dnd-kit
// modifier and the manual pointer handlers (box/item resize) share one source.
let bypass = false;
if (typeof window !== "undefined") {
  const sync = (e: KeyboardEvent) => { bypass = e.metaKey || e.ctrlKey; };
  window.addEventListener("keydown", sync, true);
  window.addEventListener("keyup", sync, true);
  window.addEventListener("blur", () => { bypass = false; });
}
export function snapBypassed(): boolean {
  return bypass;
}

/** Snap `v` to the nearest gridline only when within threshold (and enabled); else free. */
export function magnetize(v: number, enabled = true): number {
  if (!enabled || bypass) return v;
  const nearest = Math.round(v / SNAP_STEP) * SNAP_STEP;
  return Math.abs(v - nearest) <= SNAP_THRESHOLD ? nearest : v;
}

// ─── Alignment (snap an item's edges/centers to other items' edges/centers) ─────

export const ALIGN_THRESHOLD = 8; // canvas px — matches the guide-line display
export interface Rect { x: number; y: number; w: number; h: number }

/** Snap one axis: try to align the rect's near/center/far edge to a target line. */
function snapAxis(pos: number, size: number, lines: number[]): number | null {
  const edges = [pos, pos + size / 2, pos + size]; // near, center, far
  let best: { d: number; pos: number } | null = null;
  for (const e of edges) {
    for (const t of lines) {
      const d = Math.abs(e - t);
      if (d <= ALIGN_THRESHOLD && (!best || d < best.d)) best = { d, pos: pos + (t - e) };
    }
  }
  return best ? best.pos : null;
}

/**
 * Snap a moving rect's origin to the alignment lines of other rects (edges + centers).
 * Falls back to magnetic grid per axis when nothing aligns. ⌘/Ctrl bypasses both.
 */
export function snapPosition(rect: Rect, targets: Rect[], gridEnabled: boolean): { x: number; y: number } {
  if (bypass) return { x: rect.x, y: rect.y };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of targets) {
    xs.push(t.x, t.x + t.w / 2, t.x + t.w);
    ys.push(t.y, t.y + t.h / 2, t.y + t.h);
  }
  const ax = snapAxis(rect.x, rect.w, xs);
  const ay = snapAxis(rect.y, rect.h, ys);
  return {
    x: ax ?? magnetize(rect.x, gridEnabled),
    y: ay ?? magnetize(rect.y, gridEnabled),
  };
}

/**
 * dnd-kit modifier for box dragging. If `getAlign` returns the dragging box's rect
 * + sibling rects, snaps to alignment lines first (grid fallback); otherwise plain
 * magnetic grid. Works in canvas space (transform is scaled by zoom).
 */
export function createSnapToGrid(
  zoom: number,
  enabled: boolean,
  getAlign?: (activeId: string) => { rect: Rect; targets: Rect[] } | null,
): Modifier {
  return ({ transform, active }) => {
    if (bypass) return transform;
    if (getAlign && active) {
      const info = getAlign(String(active.id));
      if (info) {
        const proposed: Rect = {
          ...info.rect,
          x: info.rect.x + transform.x / zoom,
          y: info.rect.y + transform.y / zoom,
        };
        const snapped = snapPosition(proposed, info.targets, enabled);
        return { ...transform, x: (snapped.x - info.rect.x) * zoom, y: (snapped.y - info.rect.y) * zoom };
      }
    }
    if (!enabled) return transform;
    return {
      ...transform,
      x: magnetize(transform.x / zoom) * zoom,
      y: magnetize(transform.y / zoom) * zoom,
    };
  };
}
