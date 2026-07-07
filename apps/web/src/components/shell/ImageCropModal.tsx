"use client";

import { useRef, useState, useEffect, useId } from "react";
import { X } from "lucide-react";

interface ImageCropModalProps {
  src: string;
  shape: "circle" | "rect";
  previewW?: number;
  previewH?: number;
  outputW?: number;
  outputH?: number;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
}

export function ImageCropModal({
  src, shape,
  previewW = 300, previewH = 300,
  outputW = 256,
  onApply, onClose,
}: ImageCropModalProps) {
  // SVG mask needs a unique id; useId colons are invalid in SVG attribute values
  const uid = useId().replace(/:/g, "_");

  // ── Padding: no horizontal pad for wide-landscape banners, 60px otherwise ───
  const padX = previewH < previewW / 2 ? 0 : 60;
  const padY = 60;
  const cW = previewW + 2 * padX;
  const cH = previewH + 2 * padY;

  const imgRef    = useRef<HTMLImageElement | null>(null);
  const natRef    = useRef({ w: 0, h: 0 });
  const scaleRef  = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef   = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const [nat,    setNat]    = useState({ w: 0, h: 0 });
  const [scale,  setScale]  = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const applyScale  = (v: number) => { scaleRef.current = v; setScale(v); };
  const applyOffset = (v: { x: number; y: number }) => { offsetRef.current = v; setOffset(v); };

  // Clamp so the image always covers the crop area (previewW × previewH).
  // offset is relative to the crop center.
  const clamp = (ox: number, oy: number, sc: number) => {
    const n = natRef.current;
    if (n.w === 0) return { x: 0, y: 0 };
    const hw = Math.max(0, (n.w * sc) / 2 - previewW / 2);
    const hh = Math.max(0, (n.h * sc) / 2 - previewH / 2);
    return { x: Math.min(hw, Math.max(-hw, ox)), y: Math.min(hh, Math.max(-hh, oy)) };
  };

  // Load image; start at the scale that fills the FULL viewport (cW×cH), so the
  // area outside the crop circle always shows image content instead of black.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      natRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      // Use cW/cH (viewport) not previewW/previewH so image fills the dark surround
      const fill = Math.max(cW / img.naturalWidth, cH / img.naturalHeight);
      applyScale(fill);
      applyOffset({ x: 0, y: 0 });
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
  }, [src, previewW, previewH, cW, cH]);

  // Global drag handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      applyOffset(clamp(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy, scaleRef.current));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // minScale fills the viewport so image always covers the dark surround area
  const minScale = nat.w > 0 ? Math.max(cW / nat.w, cH / nat.h) : 1;
  const maxScale = minScale * 5;

  // Normalized zoom factor [1..5] for the slider — same range regardless of image size
  const zoomFactor = minScale > 0 ? Math.min(5, Math.max(1, scale / minScale)) : 1;

  // When slider moves: maintain the visible center by scaling offset proportionally
  const onSlider = (factor: number) => {
    const newScale = minScale * factor;
    const ratio = newScale / scaleRef.current;
    const off = offsetRef.current;
    applyScale(newScale);
    applyOffset(clamp(off.x * ratio, off.y * ratio, newScale));
  };

  // Output exactly what's inside the crop area, scaled uniformly to output size
  const apply = () => {
    const img = imgRef.current;
    if (!img || natRef.current.w === 0) return;
    const sc  = scaleRef.current;
    const off = offsetRef.current;
    const n   = natRef.current;
    const outRatio = outputW / previewW;
    const outH = Math.round(previewH * outRatio);
    const canvas = document.createElement("canvas");
    canvas.width  = outputW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(outputW / 2, outH / 2, outputW / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    const dispW = n.w * sc, dispH = n.h * sc;
    // imgL/imgT: image position relative to crop-area top-left (0,0)
    const imgL = previewW / 2 + off.x - dispW / 2;
    const imgT = previewH / 2 + off.y - dispH / 2;
    ctx.drawImage(img, imgL * outRatio, imgT * outRatio, dispW * outRatio, dispH * outRatio);
    onApply(canvas.toDataURL("image/jpeg", 0.93));
  };

  // ── Derived display values ───────────────────────────────────────────────────
  const cropCx = padX + previewW / 2;   // crop-area center X in container
  const cropCy = padY + previewH / 2;   // crop-area center Y in container
  const cropR  = Math.min(previewW, previewH) / 2;

  const dispW = nat.w * scale;
  const dispH = nat.h * scale;
  const imgDisplayL = cropCx + offset.x - dispW / 2;
  const imgDisplayT = cropCy + offset.y - dispH / 2;

  const modalW = Math.max(cW + 48, 400);

  return (
    <>
      <div className="fixed inset-0 z-[1010] bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[1011] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col"
        style={{ background: "var(--surface-raised)", width: modalW, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Edit Image</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Crop viewport: image fills this area at minimum zoom, dark overlay cuts out crop shape */}
        <div
          className="mx-auto select-none overflow-hidden"
          style={{ width: cW, height: cH, background: "#080808", cursor: "grab", position: "relative", borderRadius: 8 }}
          onMouseDown={(e) => {
            e.preventDefault();
            dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
          }}
        >
          {nat.w > 0 && (
            <>
              <img
                src={src} alt="" draggable={false}
                style={{ position: "absolute", left: imgDisplayL, top: imgDisplayT, width: dispW, height: dispH, maxWidth: "none", maxHeight: "none", pointerEvents: "none", userSelect: "none" }}
              />
              {/* Dark overlay with crop cutout + bright boundary ring */}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <defs>
                  <mask id={uid}>
                    <rect width="100%" height="100%" fill="white" />
                    {shape === "circle"
                      ? <circle cx={cropCx} cy={cropCy} r={cropR} fill="black" />
                      : <rect x={padX} y={padY} width={previewW} height={previewH} rx={3} fill="black" />
                    }
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="black" fillOpacity="0.55" mask={`url(#${uid})`} />
                {shape === "circle"
                  ? <circle cx={cropCx} cy={cropCy} r={cropR} fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.7" />
                  : <rect x={padX} y={padY} width={previewW} height={previewH} rx={3} fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.7" />
                }
              </svg>
            </>
          )}
        </div>

        {/* Zoom slider: factor 1× (cover) → 5× (max zoom), consistent across all images */}
        <div className="flex items-center gap-3 mt-5 px-1">
          <MagnifyIcon size={13} />
          <input
            type="range" min={1} max={5} step="any"
            value={zoomFactor}
            onChange={(e) => onSlider(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: "var(--accent)" }}
          />
          <MagnifyIcon size={19} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors">
            Cancel
          </button>
          <button onClick={apply} className="rounded-lg px-5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-88" style={{ background: "var(--accent)" }}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}

function MagnifyIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0 text-[var(--text-muted)]">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
