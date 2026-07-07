"use client";

import { useEffect, useState } from "react";

/**
 * Current visual-viewport height in px, tracked live so full-screen mobile UIs can
 * shrink to sit above the on-screen keyboard (iOS overlays the keyboard rather than
 * resizing the layout viewport, which otherwise hides a bottom-anchored composer).
 * Returns null when disabled or when the VisualViewport API is unavailable — callers
 * should fall back to their normal (e.g. 100%/h-full) sizing.
 */
export function useVisualViewportHeight(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.visualViewport) {
      setHeight(null);
      return;
    }
    const vv = window.visualViewport;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return height;
}
