"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

// GIPHY's old public beta key ("dc6zaTOxFJmzC") is now permanently banned (403),
// so a real key must be supplied via env. Get one free at developers.giphy.com.
const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";

interface GifResult {
  id: string;
  previewUrl: string;
  gifUrl: string;
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = async (q: string) => {
    setLoading(true);
    setError(false);
    if (!GIPHY_KEY) { setError(true); setGifs([]); setLoading(false); return; }
    try {
      const url = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=g`;
      const res = await fetch(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: { data?: any[]; meta?: { status?: number } } = await res.json().catch(() => ({}));
      if (!res.ok || (json.meta?.status ?? 200) >= 400) { setError(true); setGifs([]); return; }
      setGifs(
        (json.data ?? []).map((item) => ({
          id: item.id as string,
          previewUrl:
            (item.images?.fixed_height_small?.url as string) ??
            (item.images?.fixed_height?.url as string) ??
            "",
          gifUrl:
            (item.images?.fixed_height?.url as string) ??
            (item.images?.original?.url as string) ??
            "",
        }))
      );
    } catch {
      setError(true);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGifs("");
  }, []);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(val), 400);
  };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] shadow-2xl"
      style={{ width: 300, height: 380, background: "var(--surface-raised)" }}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="flex-1 text-xs font-bold text-[var(--text-primary)]">GIFs</span>
        <button
          onClick={onClose}
          className="rounded-lg p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 px-3 py-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-2.5 py-1.5">
          <Search size={12} className="flex-shrink-0 text-[var(--text-muted)]" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Search GIFs…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); fetchGifs(""); }}
              className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* GIF grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-[var(--text-muted)]">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-5 text-center">
            <p className="text-xs text-[var(--text-muted)]">GIF search is unavailable</p>
            <p className="text-[10px] text-[var(--text-muted)] opacity-60">A GIPHY API key needs to be configured.</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-[var(--text-muted)]">No results</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.gifUrl)}
                className="overflow-hidden rounded-lg transition-opacity hover:opacity-75 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <img
                  src={gif.previewUrl}
                  alt="gif"
                  className="h-[90px] w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attribution */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-3 py-1 text-right">
        <span className="text-[10px] text-[var(--text-muted)]">Powered by GIPHY</span>
      </div>
    </div>
  );
}
