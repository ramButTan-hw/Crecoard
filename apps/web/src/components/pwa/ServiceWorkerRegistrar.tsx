"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only) so Crecoard is installable and has
 * an offline fallback. Dev is skipped to avoid interfering with HMR.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => { void navigator.serviceWorker.register("/sw.js").catch(() => {}); };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
