"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { useBoardStore } from "@/store/boardStore";
import { ItemRenderer } from "@/components/items/ItemRenderer";
import { getDefaultLayout } from "./ExpandedBlock";

const PAD = 40;

/**
 * Hidden one-shot renderer behind lib/blockShot.ts: draws the block's items in
 * their expanded layout far offscreen, rasterizes the result, then the host
 * unmounts it. Rendered by BoardCanvas so the full provider tree (user, server,
 * chat, …) is available to every item type. Items render read-only (isFinished).
 */
export function BlockShot({ boardId, boxId, onDone }: {
  boardId: string;
  boxId: string;
  onDone: (dataUrl: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBoardStore((s) =>
    (s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId])?.boxes.find((b) => b.id === boxId)
  );
  const bg = box?.style.backgroundColor ?? "#25262b";

  useEffect(() => {
    if (!box) { onDone(null); return; }
    let cancelled = false;
    // Give fonts and item content a beat to settle before rasterizing
    const t = setTimeout(async () => {
      const node = ref.current;
      if (!node || cancelled) { onDone(null); return; }
      try {
        const px = node.offsetWidth * node.offsetHeight > 4_000_000 ? 1 : 2;
        const dataUrl = await toPng(node, { pixelRatio: px, backgroundColor: bg });
        if (!cancelled) onDone(dataUrl);
      } catch {
        if (!cancelled) onDone(null);
      }
    }, 700);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!box) return null;

  const layouts = box.items.map((item, idx) => ({ item, l: getDefaultLayout(item, idx) }));
  const width = Math.max(360, ...layouts.map(({ l }) => l.x + l.w)) + PAD;
  const height = Math.max(220, ...layouts.map(({ l }) => l.y + l.h)) + PAD;
  const s = box.style;
  const vars = Object.fromEntries(
    box.items
      .filter((i) => i.type === "api" && i.apiLabel && i.apiCachedValue !== undefined)
      .map((i) => [i.apiLabel!, i.apiCachedValue!] as [string, number])
  );

  return createPortal(
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "fixed", left: -30000, top: 0,
        width, height,
        backgroundColor: bg,
        fontFamily: s.fontFamily, fontSize: s.fontSize, color: s.fontColor,
        pointerEvents: "none", overflow: "hidden",
      }}
    >
      {s.wallpaperUrl && (
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${s.wallpaperUrl})`,
            backgroundSize: s.wallpaperSize ?? "cover",
            backgroundPosition: s.wallpaperPosition ?? "center",
            opacity: s.wallpaperOpacity,
          }}
        />
      )}
      {layouts.map(({ item, l }) => (
        <div key={item.id} style={{ position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h, overflow: "hidden" }}>
          <ItemRenderer item={item} boardId={boardId} boxId={boxId} vars={vars} isFinished containerW={l.w} containerH={l.h} />
        </div>
      ))}
    </div>,
    document.body
  );
}
