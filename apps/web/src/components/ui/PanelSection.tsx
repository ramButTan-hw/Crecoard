"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Collapsible style-panel section ──────────────────────────────────────────
// Shared accordion section for the right-side style panels (Timer, Table, …).
// Previously each panel stacked every section fully expanded, so a 12-section
// panel was a wall of scrolling. These collapse, remember their state per `id`,
// and give every panel a consistent header.

const KEY = "crecoard-panel-sections";

function readOpen(id: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const map = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
    return id in map ? map[id] : fallback;
  } catch {
    return fallback;
  }
}

function writeOpen(id: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
    map[id] = open;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function PanelSection({
  title, id, defaultOpen = false, right, children,
}: {
  title: string;
  /** Stable key for remembering open state, e.g. "timer-typography". */
  id: string;
  defaultOpen?: boolean;
  /** Optional trailing content in the header (a count, a small toggle). */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  const toggle = () => setOpen((v) => { const n = !v; writeOpen(id, n); return n; });
  return (
    <section className="border-b border-[var(--border)]">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-overlay)]/50"
      >
        <ChevronRight size={12} className={cn("shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-90")} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{title}</span>
        {right}
      </button>
      {open && <div className="flex flex-col gap-2 px-3 pb-3 pt-0.5 text-xs">{children}</div>}
    </section>
  );
}
