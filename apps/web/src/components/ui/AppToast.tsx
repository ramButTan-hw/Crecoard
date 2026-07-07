"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Info } from "lucide-react";

/**
 * Minimal action-feedback toasts (publish, copies, mode switches). Separate
 * from the chat notification Toaster — these are transient confirmations.
 */

interface AppToastEntry {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

export function appToast(message: string, kind: AppToastEntry["kind"] = "info"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("crecoard:toast", { detail: { message, kind } }));
}

let nextId = 1;

export function AppToaster() {
  const [toasts, setToasts] = useState<AppToastEntry[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { message?: string; kind?: AppToastEntry["kind"] };
      if (!d?.message) return;
      const id = nextId++;
      setToasts((t) => [...t.slice(-2), { id, message: d.message!, kind: d.kind ?? "info" }]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener("crecoard:toast", onToast);
    return () => window.removeEventListener("crecoard:toast", onToast);
  }, []);

  if (toasts.length === 0 || typeof document === "undefined") return null;

  // Portal to <body> so the toast lives in the top-level stacking context —
  // otherwise a transformed/overflow ancestor traps it below modals (settings,
  // etc.), which is why reminder toasts weren't showing over open panels.
  return createPortal(
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-[10050] flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="cr-anim-rise flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-xl"
          style={{ background: "var(--surface-raised)", "--cr-dur": "0.25s" } as React.CSSProperties}
        >
          {t.kind === "success" && <Check size={13} className="text-green-400" />}
          {t.kind === "error" && <AlertTriangle size={13} className="text-red-400" />}
          {t.kind === "info" && <Info size={13} className="text-[var(--text-muted)]" />}
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  );
}
