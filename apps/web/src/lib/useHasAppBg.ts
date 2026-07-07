"use client";

import { useEffect, useState } from "react";
import { useBoardStore } from "@/store/boardStore";

/**
 * Whether a custom app background image is set — but only AFTER the component
 * has mounted on the client.
 *
 * `appBg` is initialised from localStorage in the board store, so its value
 * differs between the server (always empty) and the client (may have a saved
 * image). Reading it during SSR / the first client render and feeding it into
 * markup (e.g. `background: hasAppBg ? "transparent" : "var(--surface-raised)"`)
 * produces a React hydration mismatch. Gating on mount keeps the server markup
 * and the first client render identical; the real value is applied on the next
 * render once the component has mounted.
 */
export function useHasAppBg(): boolean {
  const savedAppBg = useBoardStore((s) => !!s.appBg.image);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted && savedAppBg;
}
