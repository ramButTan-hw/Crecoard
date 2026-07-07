"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Upload, ChevronDown, Check } from "lucide-react";
import { GOOGLE_FONTS, loadGoogleFont, loadUserFont } from "@/lib/fonts";
import { useBoardStore } from "@/store/boardStore";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Sans", "Serif", "Display", "Handwriting", "Mono", "Uploaded"] as const;
type Category = (typeof CATEGORIES)[number];

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
  compact?: boolean; // narrower trigger button for inline toolbars
}

export function FontPicker({ value, onChange, compact }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { userFonts, addUserFont } = useBoardStore();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Re-register user fonts on mount (they live in memory; lost on refresh but restored from store)
  useEffect(() => {
    userFonts.forEach((f) => loadUserFont(f.name, f.dataUrl));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  type AnyFont = { name: string; category: string };
  const uploadedDefs: AnyFont[] = userFonts.map((f) => ({ name: f.name, category: "Uploaded" }));
  const allFonts: AnyFont[] = [...GOOGLE_FONTS, ...uploadedDefs];

  const filtered = allFonts.filter((f) => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || f.category === category;
    return matchSearch && matchCat;
  });

  const handleSelect = async (font: AnyFont) => {
    if (font.category === "Uploaded") {
      const uf = userFonts.find((f) => f.name === font.name);
      if (uf) await loadUserFont(font.name, uf.dataUrl);
    } else {
      loadGoogleFont(font.name);
    }
    onChange(font.name);
    setOpen(false);
    setSearch("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      addUserFont({ name: baseName, dataUrl });
      await loadUserFont(baseName, dataUrl);
      onChange(baseName);
      setOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const displayName = value || "Font";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors",
          compact ? "px-1.5 py-0.5 max-w-[90px]" : "px-2 py-1.5 w-full"
        )}
      >
        <span className="flex-1 truncate text-left" style={{ fontFamily: value }}>{displayName}</span>
        <ChevronDown size={11} className="flex-shrink-0 text-[var(--text-muted)]" />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute z-[200] mt-1 w-72 rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col"
          style={{ background: "var(--surface-raised)", maxHeight: 420 }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 flex-shrink-0">
            <Search size={12} className="text-[var(--text-muted)] flex-shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Search fonts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-[var(--border)] flex-shrink-0 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  category === cat
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Font list */}
          <div className="flex-1 overflow-y-auto py-1 min-h-0">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">No fonts found</p>
            ) : (
              filtered.map((font) => (
                <FontRow
                  key={font.name}
                  font={font}
                  selected={value === font.name}
                  onSelect={() => handleSelect(font)}
                />
              ))
            )}
          </div>

          {/* Upload custom font */}
          <div className="border-t border-[var(--border)] p-2 flex-shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--accent)] transition-colors"
            >
              <Upload size={12} />
              Upload font (.ttf, .otf, .woff, .woff2)
            </button>
            <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFileUpload} />
          </div>
        </div>
      )}
    </div>
  );
}

// Lazily loads the Google Font when the row scrolls into view
function FontRow({ font, selected, onSelect }: { font: { name: string; category: string }; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || font.category === "Uploaded") return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadGoogleFont(font.name);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [font]);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors",
        selected ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-overlay)]"
      )}
    >
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-[var(--text-muted)] leading-none">{font.name}</span>
        <span
          className="text-sm text-[var(--text-primary)] leading-snug truncate"
          style={{ fontFamily: font.name }}
        >
          The quick brown fox
        </span>
      </div>
      {selected && <Check size={12} className="flex-shrink-0 text-[var(--accent)]" />}
    </button>
  );
}
