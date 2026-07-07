"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  /** Right-aligned hint, e.g. a keyboard shortcut */
  hint?: string;
  /** Extra match text beyond the label */
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
}

/**
 * ⌘K command palette. Pure view — the host builds the command list, so the
 * palette stays dumb about app state.
 */
export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const scored = commands
      .map((c) => {
        const hay = `${c.label} ${c.keywords ?? ""} ${c.section}`.toLowerCase();
        if (!hay.includes(q)) return null;
        return { c, score: c.label.toLowerCase().startsWith(q) ? 0 : hay.indexOf(q) };
      })
      .filter((x): x is { c: PaletteCommand; score: number } => x !== null);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((x) => x.c);
  }, [commands, query]);

  // Group while preserving filtered order
  const sections = useMemo(() => {
    const out: { section: string; items: { cmd: PaletteCommand; index: number }[] }[] = [];
    filtered.forEach((cmd, index) => {
      const last = out[out.length - 1];
      if (last && last.section === cmd.section) last.items.push({ cmd, index });
      else out.push({ section: cmd.section, items: [{ cmd, index }] });
    });
    return out;
  }, [filtered]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-cmd-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (cmd: PaletteCommand) => { onClose(); cmd.run(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const cmd = filtered[active]; if (cmd) run(cmd); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div
      className="fixed inset-0 z-[9000] flex justify-center"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="cr-anim-scale mt-[12vh] flex h-fit w-[520px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl"
        style={{ background: "var(--surface-raised)", "--cr-dur": "0.18s" } as React.CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search size={15} className="shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command — add items, switch boards, settings…"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">No matching commands.</p>
          )}
          {sections.map((sec) => (
            <div key={sec.section + sec.items[0].index}>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{sec.section}</p>
              {sec.items.map(({ cmd, index }) => (
                <button
                  key={cmd.id}
                  data-cmd-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(cmd)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors",
                    index === active ? "bg-[var(--accent)]/12 text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  )}
                >
                  {cmd.icon && <span className="shrink-0 text-[var(--text-muted)]">{cmd.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <kbd className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{cmd.hint}</kbd>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
