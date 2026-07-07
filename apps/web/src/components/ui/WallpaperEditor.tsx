"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface WallpaperEditorProps {
  url: string;
  size: string;
  position: string;
  opacity: number;
  backgroundColor?: string;
  onSizeChange: (v: string) => void;
  onPositionChange: (v: string) => void;
  onOpacityChange: (v: number) => void;
}

function parsePosition(pos: string): [number, number] {
  if (!pos || pos === "center") return [50, 50];
  const kx: Record<string, number> = { left: 0, center: 50, right: 100 };
  const ky: Record<string, number> = { top: 0, center: 50, bottom: 100 };
  const parts = pos.trim().split(/\s+/);
  if (parts.length === 1) return [kx[parts[0]] ?? 50, 50];
  const x = parts[0].endsWith("%") ? parseFloat(parts[0]) : (kx[parts[0]] ?? 50);
  const y = parts[1].endsWith("%") ? parseFloat(parts[1]) : (ky[parts[1]] ?? 50);
  return [x, y];
}

function parseZoom(size: string): number | null {
  if (size?.endsWith("%")) return Math.max(10, parseFloat(size));
  return null;
}

const SIZE_PRESETS = [
  { id: "cover",   label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "auto",    label: "Original" },
] as const;

export function WallpaperEditor({
  url, size, position, opacity,
  backgroundColor = "#1a1b1e",
  onSizeChange, onPositionChange, onOpacityChange,
}: WallpaperEditorProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, px: 50, py: 50 });

  const zoomPct = parseZoom(size);
  const isPreset = zoomPct === null;
  const zoomValue = zoomPct ?? 100;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const [px, py] = parsePosition(position);
    dragRef.current = { x: e.clientX, y: e.clientY, px, py };
    setDragging(true);

    const sens = isPreset ? 0.4 : Math.max(0.05, 40 / zoomValue);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      const nx = Math.max(0, Math.min(100, dragRef.current.px - dx * sens));
      const ny = Math.max(0, Math.min(100, dragRef.current.py - dy * sens));
      onPositionChange(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const base = zoomPct ?? 100;
    const delta = e.deltaY > 0 ? -10 : 10;
    onSizeChange(`${Math.max(10, Math.min(500, base + delta))}%`);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Interactive preview */}
      <div
        className="relative h-36 w-full overflow-hidden rounded-lg border border-[var(--border)] select-none"
        style={{ backgroundColor, cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `url(${url})`,
            backgroundSize: size || "cover",
            backgroundPosition: position || "center",
            backgroundRepeat: "no-repeat",
            opacity,
            pointerEvents: "none",
          }}
        />
        <div className="absolute bottom-1.5 inset-x-0 flex justify-center pointer-events-none">
          <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/60 backdrop-blur-sm">
            Drag · Scroll to zoom
          </span>
        </div>
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-[11px] text-[var(--text-muted)]">Zoom</span>
        <input
          type="range" min={10} max={500} step={5}
          value={zoomValue}
          onChange={(e) => onSizeChange(`${e.target.value}%`)}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-10 text-right text-[11px] text-[var(--text-muted)]">{zoomValue}%</span>
      </div>

      {/* Preset buttons + reset position */}
      <div className="flex gap-1.5">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { onSizeChange(p.id); onPositionChange("center"); }}
            className={cn(
              "flex-1 rounded border py-1 text-[11px] transition-colors",
              isPreset && size === p.id
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          title="Reset position to center"
          onClick={() => onPositionChange("50% 50%")}
          className="rounded border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--text-muted)] transition-colors"
        >
          ⌖
        </button>
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-[11px] text-[var(--text-muted)]">Opacity</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="w-10 text-right text-[11px] text-[var(--text-muted)]">{Math.round(opacity * 100)}%</span>
      </div>
    </div>
  );
}
