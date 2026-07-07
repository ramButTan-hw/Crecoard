"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet for mobile. On small screens the desktop side panels (item palette,
 * block/item settings) render inside this instead of as fixed-width columns.
 * Slides up, dims the background, closes on backdrop tap or Escape.
 */
export function MobileSheet({
  open, onClose, title, children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [render, setRender] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setRender(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!render) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end">
      <div
        className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[82vh] flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl pb-safe transition-transform duration-200",
          visible ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body
  );
}
