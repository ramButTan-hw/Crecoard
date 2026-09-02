"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Maximize2, LayoutGrid } from "lucide-react";
import { Box, useBoardStore } from "@/store/boardStore";
import { useCanEditBoard } from "@/contexts/ServerBoardContext";
import { ItemRenderer } from "@/components/items/ItemRenderer";
import { cn } from "@/lib/utils";

const AUTO_MS = 3500;
const EJECT_THRESHOLD = 40; // px outside carousel before eject fires

// ─── Slide content ────────────────────────────────────────────────────────────

function SlideContent({ box, boardId }: { box: Box; boardId: string }) {
  const s = box.style;
  const vars = {};
  const summaryItems = box.items.filter(i => i.showInCollapsed);

  const wallpaperStyle: React.CSSProperties = s.wallpaperUrl
    ? { backgroundImage: `url(${s.wallpaperUrl})`, backgroundSize: s.wallpaperSize ?? "cover", backgroundPosition: s.wallpaperPosition ?? "center" }
    : { backgroundColor: s.backgroundColor };

  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", ...wallpaperStyle }} />
      <div className="relative z-10 h-full overflow-hidden select-none pointer-events-none" style={{ padding: s.padding }}>
        {summaryItems.length === 0 && box.items.length === 0 ? (
          <div className="flex h-full items-center justify-center opacity-30 text-xs">
            {box.title || "Empty slide"}
          </div>
        ) : (
          <div className="flex flex-col gap-1 h-full overflow-hidden">
            {box.title && <div className="text-[11px] font-semibold opacity-60 truncate mb-1">{box.title}</div>}
            {summaryItems.map(item => (
              <ItemRenderer key={item.id} item={item} boardId={boardId} boxId={box.id} vars={vars} collapsed isFinished />
            ))}
            {box.items.length > 0 && summaryItems.length === 0 && (
              <div className="text-[11px] opacity-40 text-center mt-2">{box.items.length} item{box.items.length !== 1 ? "s" : ""}</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeckBox({ deck, boardId }: { deck: Box; boardId: string }) {
  const board = useBoardStore(s => s.boards.find(b => b.id === boardId) ?? s.serverBoards[boardId]);
  const canEditBoard = useCanEditBoard();
  const { setDeckFocus, ejectSlide, disbandDeck, setExpandedBox, selectBox, bringToFront, moveBox } = useBoardStore();
  const zoom = useBoardStore(s => s.zoom);

  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(320);

  // Unbounded virtual focus — drives the CSS transform. Modulo into real index.
  const vFocusRef = useRef(deck.deckFocusIndex ?? 0);
  const [vFocus, setVFocusRaw] = useState(deck.deckFocusIndex ?? 0);
  const setVFocus = (v: number) => { vFocusRef.current = v; setVFocusRaw(v); };

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  const slideIds = deck.deckSlideIds ?? [];
  const slides = slideIds.map(id => board?.boxes.find(b => b.id === id)).filter((b): b is Box => !!b);
  const n = slides.length;
  const realFocus = n > 0 ? ((vFocus % n) + n) % n : 0;

  // Read deck settings with defaults
  const transition  = deck.deckTransition  ?? "slide";
  const layout      = deck.deckLayout      ?? "centered";
  const autoPlay    = deck.deckAutoPlay    ?? true;
  const autoMs      = deck.deckAutoPlayMs  ?? 3500;
  const showArrows  = deck.deckShowArrows  ?? true;
  const showDots    = deck.deckShowDots    ?? true;
  const showPeek    = deck.deckShowPeek    ?? true;
  const peekScale   = deck.deckPeekScale   ?? 0.82;
  const peekOpacity = deck.deckPeekOpacity ?? 0.5;
  const peekBlur    = deck.deckPeekBlur    ?? false;

  // Carousel geometry — layout affects slide width and stride
  const slideW = Math.round(stageW * (layout === "flat" ? 0.78 : 0.62));
  const stride = layout === "flat" ? stageW * 0.82 : stageW * 0.70;

  // Track stage width via ResizeObserver
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setStageW(entries[0].contentRect.width));
    ro.observe(el);
    setStageW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Auto-advance timer
  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(0);
    startRef.current = Date.now();
  };

  useEffect(() => {
    if (hovered || n <= 1 || !autoPlay) { resetTimer(); return; }
    startRef.current = Date.now();
    setProgress(0);

    progressRef.current = setInterval(() => {
      setProgress(Math.min((Date.now() - startRef.current) / autoMs, 1));
    }, 50);

    timerRef.current = setTimeout(() => {
      const v = vFocusRef.current + 1;
      setVFocus(v);
      setDeckFocus(boardId, deck.id, ((v % n) + n) % n);
      startRef.current = Date.now();
      setProgress(0);
    }, autoMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, vFocus, n, boardId, deck.id]);

  const go = (dir: 1 | -1) => {
    const v = vFocusRef.current + dir;
    setVFocus(v);
    setDeckFocus(boardId, deck.id, ((v % n) + n) % n);
    resetTimer();
  };

  const goTo = (realIdx: number) => {
    let delta = realIdx - realFocus;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    setVFocus(vFocusRef.current + delta);
    setDeckFocus(boardId, deck.id, realIdx);
    resetTimer();
  };

  const openSlide = () => {
    const slide = slides[realFocus];
    if (!slide) return;
    selectBox(slide.id);
    bringToFront(boardId, slide.id);
    setExpandedBox(slide.id);
  };

  // Drag center slide out to eject it back to the canvas
  const handleCenterMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (board?.isFinished || !canEditBoard) return;
    e.stopPropagation();
    const slideId = deck.deckSlideIds?.[realFocus];
    const containerEl = containerRef.current;
    if (!slideId || !containerEl) return;

    let ejected = false;

    const onMove = (ev: MouseEvent) => {
      if (ejected) return;
      const rect = containerEl.getBoundingClientRect();
      const outsideX = ev.clientX < rect.left - EJECT_THRESHOLD || ev.clientX > rect.right + EJECT_THRESHOLD;
      const outsideY = ev.clientY < rect.top - EJECT_THRESHOLD || ev.clientY > rect.bottom + EJECT_THRESHOLD;
      if (outsideX || outsideY) {
        ejected = true;
        // Eject slide back to canvas
        ejectSlide(boardId, deck.id, realFocus);
        // Place it at the cursor position in canvas coords
        const canvasEl = document.querySelector('[data-board-canvas]') as HTMLElement | null;
        if (canvasEl) {
          const cr = canvasEl.getBoundingClientRect();
          const cx = Math.max(0, Math.round((ev.clientX - cr.left) / zoom / 20) * 20 - slideW / zoom / 2);
          const cy = Math.max(0, Math.round((ev.clientY - cr.top) / zoom / 20) * 20 - 40);
          moveBox(boardId, slideId, cx, cy);
        }
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  };

  if (n === 0) {
    return <div className="flex h-full w-full items-center justify-center text-xs opacity-40">Empty carousel</div>;
  }

  // Render 5 virtual slots: vFocus-2 … vFocus+2
  // Key by virtual position so React keeps DOM nodes stable → transforms animate via CSS transition
  const slots = [vFocus - 2, vFocus - 1, vFocus, vFocus + 1, vFocus + 2];

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label */}
      <div className="absolute top-2 left-3 z-30 flex items-center gap-1.5 pointer-events-none select-none opacity-50">
        <LayoutGrid size={11} />
        <span className="text-[11px] font-semibold tracking-wider uppercase">{n} slides</span>
      </div>

      {/* Controls */}
      <div className={cn("absolute top-2 right-2 z-30 flex items-center gap-1 transition-opacity duration-200", hovered ? "opacity-100" : "opacity-0")}>
        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openSlide(); }}
          title="Expand slide" className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/70 hover:text-white backdrop-blur-sm transition-colors">
          <Maximize2 size={11} />
        </button>
        <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); disbandDeck(boardId, deck.id); }}
          title="Disband carousel" className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/70 hover:text-white backdrop-blur-sm transition-colors">
          <X size={11} />
        </button>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative flex-1 overflow-hidden" style={{ margin: "28px 0 32px" }}>
        {stageW > 0 && slots.map(vp => {
          const idx = ((vp % n) + n) % n;
          const slide = slides[idx];
          if (!slide) return null;
          const offset = vp - vFocus;
          const isCenter = offset === 0;
          const isAdjacent = Math.abs(offset) === 1;
          const visible = isCenter || (showPeek && isAdjacent);

          // --- layout/transition-specific style ---
          const adjScale   = layout === "flat" ? 1 : layout === "stack" ? 0.88 : peekScale;
          const adjOpacity = layout === "flat" ? 0.7 : layout === "stack" ? 0.55 : peekOpacity;

          const tx = stageW / 2 - slideW / 2 + offset * stride;

          // Stack layout: side slides stack behind the center (smaller offset, more shadow)
          const stackTx = layout === "stack"
            ? stageW / 2 - slideW / 2 + Math.sign(offset) * Math.min(Math.abs(offset), 1) * 16
            : tx;

          let transform = "";
          let opacity = isCenter ? 1 : visible ? adjOpacity : 0;

          if (transition === "fade") {
            // Fade: slides don't translate at all, just fade
            transform = `translateX(${stageW / 2 - slideW / 2}px) scale(${isCenter ? 1 : adjScale})`;
            opacity = isCenter ? 1 : visible ? adjOpacity : 0;
          } else if (transition === "scale") {
            transform = `translateX(${isCenter ? stageW / 2 - slideW / 2 : tx}px) scale(${isCenter ? 1 : isAdjacent ? 0.7 : 0.5})`;
          } else if (transition === "flip") {
            // Flip: center is straight-on; adjacents are rotated
            const ry = isCenter ? 0 : offset > 0 ? -35 : 35;
            transform = `translateX(${layout === "stack" ? stackTx : tx}px) perspective(800px) rotateY(${ry}deg) scale(${isCenter ? 1 : adjScale})`;
          } else {
            // Slide (default)
            transform = `translateX(${layout === "stack" ? stackTx : tx}px) scale(${isCenter ? 1 : adjScale})`;
          }

          const zIndex = isCenter ? 20 : isAdjacent ? 10 - Math.abs(offset) : 0;
          const shadow = layout === "stack" && !isCenter
            ? "0 2px 8px rgba(0,0,0,0.4)"
            : isCenter
              ? "0 12px 40px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.4)"
              : "0 4px 12px rgba(0,0,0,0.25)";
          const blur = !isCenter && peekBlur && showPeek ? "blur(2px)" : undefined;
          const s = slide.style;

          const easing = transition === "flip"
            ? "transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)"
            : transition === "fade"
              ? "opacity 0.42s ease"
              : "transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.42s ease";

          return (
            <div
              key={`vp${vp}`}
              onMouseDown={isCenter ? handleCenterMouseDown : undefined}
              onClick={isCenter
                ? e => { e.stopPropagation(); openSlide(); }
                : e => { e.stopPropagation(); go(offset > 0 ? 1 : -1); }
              }
              style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: slideW,
                transform,
                transformOrigin: "center center",
                opacity,
                zIndex,
                boxShadow: shadow,
                filter: blur,
                borderRadius: s.borderRadius,
                border: `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}`,
                overflow: "hidden",
                cursor: isCenter ? "grab" : "pointer",
                transition: easing + ", box-shadow 0.3s ease",
                pointerEvents: visible ? "auto" : "none",
                fontFamily: s.fontFamily,
                fontSize: s.fontSize,
                color: s.fontColor,
              }}
            >
              <SlideContent box={slide} boardId={boardId} />
              {isCenter && hovered && !board?.isFinished && canEditBoard && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/60 pointer-events-none select-none backdrop-blur-sm">
                  drag out to release
                </div>
              )}
            </div>
          );
        })}

        {/* Arrows */}
        {n > 1 && showArrows && (
          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); go(-1); }}
            className={cn("absolute left-2 z-40 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-sm shadow-lg transition-opacity duration-200", hovered ? "opacity-100" : "opacity-0")}
            style={{ top: "50%", transform: "translateY(-50%)" }}>
            <ChevronLeft size={16} />
          </button>
        )}
        {n > 1 && showArrows && (
          <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); go(1); }}
            className={cn("absolute right-2 z-40 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-sm shadow-lg transition-opacity duration-200", hovered ? "opacity-100" : "opacity-0")}
            style={{ top: "50%", transform: "translateY(-50%)" }}>
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Dots + progress bar */}
      {showDots && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-1 pb-2">
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); goTo(i); }}
                className="rounded-full transition-all duration-300"
                style={{ width: i === realFocus ? 16 : 6, height: 6, background: i === realFocus ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)" }} />
            ))}
          </div>
          {n > 1 && autoPlay && (
            <div className="w-16 h-0.5 rounded-full overflow-hidden bg-white/10">
              <div className="h-full rounded-full bg-white/50" style={{ width: `${progress * 100}%`, transition: "none" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
