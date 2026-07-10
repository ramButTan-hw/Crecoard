"use client";

import { useEffect } from "react";
import { initAccessibility } from "@/lib/accessibility";

/** Applies stored accessibility prefs on every page (mounted from the root layout). */
export function AccessibilityInit() {
  useEffect(() => {
    initAccessibility();
    // Cross-tab: another tab changing settings updates this one too
    const onStorage = (e: StorageEvent) => { if (e.key === "plancraft-user-prefs") initAccessibility(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
