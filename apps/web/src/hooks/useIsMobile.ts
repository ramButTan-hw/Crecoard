"use client";

import { useEffect, useState } from "react";

/**
 * True on small / touch-first screens. SSR-safe: returns false on the server and
 * during the first client render, then resolves on mount (so layout doesn't flash
 * the mobile UI for desktop hydration).
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}
