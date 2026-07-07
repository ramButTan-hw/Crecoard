"use client";

/**
 * LiveWallpaper — an animated board background: a looping video, or one of the
 * visualizer effects (aurora, starfield, particles, rain, …) reused as a
 * decorative, always-procedural wallpaper. Rendered as a fixed viewport layer
 * behind the board in BoardCanvas; only shown when a live wallpaper is set.
 */

import type { Board, BlockItem } from "@/store/boardStore";
import { VisualizerItem } from "@/components/items/VisualizerItem";

export function hasLiveWallpaper(board: Board | undefined | null): boolean {
  return !!(board && (board.backgroundVideo || board.backgroundLiveEffect));
}

export function LiveWallpaper({ board }: { board: Board }) {
  if (board.backgroundVideo) {
    return (
      <video
        src={board.backgroundVideo}
        autoPlay loop muted playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ opacity: board.backgroundOpacity ?? 1, filter: board.backgroundFilter || undefined }}
      />
    );
  }
  if (board.backgroundLiveEffect) {
    // Reuse the visualizer engine, procedurally (no audio), transparent so the
    // theme background color shows through behind the effect.
    const synthetic = {
      type: "visualizer",
      visualizerEffect: board.backgroundLiveEffect,
      visualizerColor: board.backgroundLiveColor || "#d59ee8",
      visualizerColor2: board.backgroundLiveColor2 || "#48cfa6",
      visualizerBgType: "transparent",
      visualizerAudioSource: "off",
      visualizerGlow: true,
    } as unknown as BlockItem;
    return (
      <div className="pointer-events-none absolute inset-0" style={{ opacity: board.backgroundOpacity ?? 1 }}>
        <VisualizerItem item={synthetic} upd={() => {}} />
      </div>
    );
  }
  return null;
}
