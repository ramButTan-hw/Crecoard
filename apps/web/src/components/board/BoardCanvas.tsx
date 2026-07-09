"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutGrid, Palette, Share2, Clipboard,
  ScanSearch, SquarePlus, Layers, Package, X,
  ZoomIn, ZoomOut, Camera,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { nanoid } from "nanoid";
import { useBoardStore, useActiveBoard, DEFAULT_BOX_STYLE } from "@/store/boardStore";
import { ITEM_DEFINITIONS } from "./ItemPalette";
import { BoardItemWidget } from "./BoardItemWidget";
import { LiveWallpaper, hasLiveWallpaper } from "./LiveWallpaper";
import { useCollab } from "@/lib/useCollabSession";
import { runDueRecurringResets } from "@/lib/recurringBlocks";
import { exportBoardImage } from "@/lib/boardImage";
import { registerBlockShotHost, type BlockShotRequest } from "@/lib/blockShot";
import { BlockShot } from "./BlockShot";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { CursorState } from "@/lib/collaboration";
import { BoardBox } from "./BoardBox";
import { cn } from "@/lib/utils";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/boardConstants";
import { useCanEditBoard, useServerBoard, useServerBoardData, roleAllowed } from "@/contexts/ServerBoardContext";

// ─── Remote cursor overlay ────────────────────────────────────────────────────

function CursorSvg({ color }: { color: string }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}>
      <path d="M 0 0 L 0 16 L 3.5 12 L 7 20 L 9 19 L 5.5 11 L 11 11 Z" fill={color} stroke="white" strokeWidth="0.8" />
    </svg>
  );
}

function CollabCursors({ cursors, zoom }: { cursors: CursorState[]; zoom: number }) {
  return (
    <>
      {cursors.map(c => (
        <div key={c.userId} className="absolute pointer-events-none" style={{ left: c.x, top: c.y, zIndex: 9999 }}>
          <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top left" }}>
            <CursorSvg color={c.color} />
            <div
              className="absolute top-4 left-3.5 rounded px-1.5 py-0.5 text-white font-semibold whitespace-nowrap"
              style={{ background: c.color, fontSize: 11, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
            >
              {c.displayName}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Alignment guides ────────────────────────────────────────────────────────

const ALIGN_THRESHOLD = 8; // canvas px

function AlignmentGuides({ boxes, items }: { boxes: import("@/store/boardStore").Box[]; items: import("@/store/boardStore").BoardLevelItem[] }) {
  const dragPos = useBoardStore((s) => s.dragPos);
  const draggingId = useBoardStore((s) => s.draggingBlockId);
  const resizeState = useBoardStore((s) => s.resizeState);
  const itemDrag = useBoardStore((s) => s.itemDragRect);

  const guideXs = new Set<number>();
  const guideYs = new Set<number>();

  // Whatever is currently moving — a dragged box, a resizing box, or a
  // dragged board-level item — expressed as one rect.
  let moving: { id: string; x: number; y: number; w: number; h: number } | null = null;
  if (dragPos && draggingId) {
    const b = boxes.find((x) => x.id === draggingId);
    if (b) moving = { id: draggingId, x: dragPos.x, y: dragPos.y, w: b.width, h: b.height };
  } else if (resizeState) {
    moving = { id: resizeState.id, x: resizeState.x, y: resizeState.y, w: resizeState.width, h: resizeState.height };
  } else if (itemDrag) {
    moving = { id: itemDrag.id, x: itemDrag.x, y: itemDrag.y, w: itemDrag.width, h: itemDrag.height };
  }

  if (moving) {
    const targets = [
      ...boxes.filter((b) => b.id !== moving!.id && !b.deckOwnerId).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
      ...items.filter((i) => i.id !== moving!.id).map((i) => ({ x: i.boardX, y: i.boardY, w: i.boardW, h: i.boardH })),
    ];
    const mXs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
    const mYs = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
    for (const t of targets) {
      const tXs = [t.x, t.x + t.w / 2, t.x + t.w];
      const tYs = [t.y, t.y + t.h / 2, t.y + t.h];
      for (const sx of mXs) for (const tx of tXs) if (Math.abs(sx - tx) < ALIGN_THRESHOLD) guideXs.add(tx);
      for (const sy of mYs) for (const ty of tYs) if (Math.abs(sy - ty) < ALIGN_THRESHOLD) guideYs.add(ty);
    }
  }

  if (guideXs.size === 0 && guideYs.size === 0) return null;

  return (
    <>
      {[...guideXs].map((x) => (
        <div key={`gx-${x}`} className="pointer-events-none absolute top-0 bottom-0"
          style={{ left: x, width: 1, background: "rgba(99,153,255,0.75)", zIndex: 9000 }} />
      ))}
      {[...guideYs].map((y) => (
        <div key={`gy-${y}`} className="pointer-events-none absolute left-0 right-0"
          style={{ top: y, height: 1, background: "rgba(99,153,255,0.75)", zIndex: 9000 }} />
      ))}
    </>
  );
}

// ─── Empty board first-run ────────────────────────────────────────────────────

function EmptyBoardState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex w-[340px] flex-col items-center gap-3 rounded-2xl border border-[var(--border)] px-6 py-7 text-center shadow-2xl"
        style={{ background: "var(--surface-raised)" }}>
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {canEdit ? "This board is empty" : "Nothing here yet"}
        </p>
        {canEdit ? (
          <>
            <p className="text-xs text-[var(--text-muted)]">
              Drag items in from the left palette, or press
              <kbd className="mx-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px]">⌘K</kbd>
              to add anything.
            </p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("crecoard:open-templates"))}
              className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Start from a template
            </button>
          </>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">The owner hasn't published anything to this board.</p>
        )}
      </div>
    </div>
  );
}

// ─── Member capability strip ──────────────────────────────────────────────────
// Members land on live boards with no idea what they may touch — surface it
// once per server (dismissible), derived from the actual items + permissions.

function MemberCapabilities({ board, serverId, viewerRole, viewerRoleIds }: {
  board: import("@/store/boardStore").Board;
  serverId: string;
  viewerRole: import("@/types/server").MemberRole | null;
  viewerRoleIds: string[];
}) {
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem(`crecoard-caps-seen-${serverId}`) === "1");
  if (dismissed || viewerRole !== "member") return null;

  const allItems = [
    ...(board.boardItems ?? []),
    ...board.boxes.flatMap((bx) => bx.items),
  ];
  const caps: string[] = [];
  if (allItems.some((i) => i.type === "chat")) caps.push("chat");
  if (allItems.some((i) => i.type === "playlist" && roleAllowed(viewerRole, viewerRoleIds, i.perms?.fns?.["queue-add"]))) caps.push("add songs");
  if (allItems.some((i) => ["suggestion", "guestbook", "poll"].includes(i.type) && roleAllowed(viewerRole, viewerRoleIds, i.perms?.contribute))) caps.push("post ideas & vote");
  if (caps.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--border)] py-1.5 pl-3.5 pr-1.5 text-xs shadow-lg"
        style={{ background: "var(--surface-raised)" }}>
        <span className="text-[var(--text-secondary)]">
          You can {caps.length > 1 ? caps.slice(0, -1).join(", ") + " and " + caps[caps.length - 1] : caps[0]} here
        </span>
        <button
          onClick={() => { setDismissed(true); try { localStorage.setItem(`crecoard-caps-seen-${serverId}`, "1"); } catch {} }}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export function BoardCanvas() {
  const personalBoard = useActiveBoard();
  const serverBoard = useServerBoardData();
  const { serverId, boardId: serverBoardId, viewerRole, viewerRoleIds } = useServerBoard();
  // In server context use the server board; in personal context use the personal board
  const board = serverId ? serverBoard : personalBoard;
  const {
    showGrid, zoom, panOffset, selectBox, activeBoardId,
    addBox, pasteBox, copiedBox, toggleGrid, setZoom,
    setPanOffset, addBoardItem, selectBoardItem,
    removeBox, duplicateBox, setExpandedBox, zoomAtCanvasCenter,
  } = useBoardStore();
  const isMobile = useIsMobile();
  // Mutations target the correct board ID regardless of which namespace it lives in
  const boardId = serverBoardId ?? activeBoardId;
  const selectedBoardItemId = useBoardStore((s) => s.selectedBoardItemId);
  const draggingBlockId = useBoardStore((s) => s.draggingBlockId);
  const selectedBoxId = useBoardStore((s) => s.selectedBoxId);
  const expandedBoxId = useBoardStore((s) => s.expandedBoxId);
  const canEditBoard = useCanEditBoard();
  const isFinished = board?.isFinished ?? false;
  // Members in a server board see no grid and can't open context menu
  const effectiveShowGrid = showGrid && canEditBoard;
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { cursors, onCursorMove, broadcastOp } = useCollab();

  // ── Offscreen block shots (archive pictures of a collapsed block's contents) ──
  // BoardCanvas hosts them so the hidden render sits inside the full provider tree.
  const [blockShot, setBlockShot] = useState<BlockShotRequest | null>(null);
  useEffect(() => registerBlockShotHost(setBlockShot), []);

  // ── Recurring block resets ────────────────────────────────────────────────
  // Run lazily on whichever editing client has the board open: once on open,
  // then every minute so a board left open overnight still resets at midnight.
  useEffect(() => {
    if (!boardId || !canEditBoard || isFinished) return;
    void runDueRecurringResets(boardId, broadcastOp);
    const t = setInterval(() => void runDueRecurringResets(boardId, broadcastOp), 60_000);
    return () => clearInterval(t);
  }, [boardId, canEditBoard, isFinished, broadcastOp]);

  // ── Stale-closure guards for keyboard handlers (M5) ──────────────────────
  const boxesRef = useRef(board?.boxes ?? []);
  useEffect(() => { boxesRef.current = board?.boxes ?? []; }, [board?.boxes]);
  const expandedRef = useRef(expandedBoxId);
  useEffect(() => { expandedRef.current = expandedBoxId; }, [expandedBoxId]);

  // ── Pan-on-drag state ─────────────────────────────────────────────────────
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const panMoved = useRef(false);

  // Board-level context menu
  const [boardCtx, setBoardCtx] = useState<{
    screenX: number; screenY: number;
    canvasX: number; canvasY: number;
  } | null>(null);

  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    if (!viewportRef.current) return { x: canvasX, y: canvasY };
    const rect = viewportRef.current.getBoundingClientRect();
    return {
      x: panOffset.x + canvasX * zoom + rect.left,
      y: panOffset.y + canvasY * zoom + rect.top,
    };
  }, [zoom, panOffset]);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    if (!viewportRef.current) return { x: 0, y: 0 };
    const rect = viewportRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    };
  }, [zoom, panOffset]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (panMoved.current) { panMoved.current = false; return; }
      if (e.target === canvasRef.current) { selectBox(null); selectBoardItem(null); }
    },
    [selectBox, selectBoardItem]
  );

  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const isPannable = target === canvasRef.current || target.hasAttribute("data-pannable");
    if (!isPannable) return;

    const state = useBoardStore.getState();
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: state.panOffset.x,
      offsetY: state.panOffset.y,
    };
    panMoved.current = false;
    setPanning(true);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - panStart.current.x;
      const dy = ev.clientY - panStart.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMoved.current = true;
      setPanOffset({ x: panStart.current.offsetX + dx, y: panStart.current.offsetY + dy });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setPanOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    onCursorMove(x, y);
  }, [clientToCanvas, onCursorMove]);

  const handleBoardContextMenu = useCallback((e: React.MouseEvent) => {
    // Only fire on the raw canvas background, not on block children
    if (e.target !== canvasRef.current) return;
    if (isFinished || !canEditBoard) return;
    e.preventDefault();
    e.stopPropagation();
    selectBox(null);
    const { x: canvasX, y: canvasY } = clientToCanvas(e.clientX, e.clientY);
    setBoardCtx({ screenX: e.clientX, screenY: e.clientY, canvasX, canvasY });
  }, [isFinished, canEditBoard, selectBox, clientToCanvas]);

  // Ease programmatic camera moves (fit / focus) — direct manipulation like
  // wheel-zoom and panning stays immediate.
  const animateViewChange = useCallback(() => {
    const el = document.querySelector("[data-board-canvas]") as HTMLElement | null;
    if (!el) return;
    el.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
    window.setTimeout(() => { el.style.transition = ""; }, 400);
  }, []);

  // ── Fit content to viewport ───────────────────────────────────────────────
  const handleFitContent = useCallback(() => {
    if (!viewportRef.current) return;
    animateViewChange();
    const boxes = board?.boxes ?? [];
    const items = board?.boardItems ?? [];
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;

    if (boxes.length === 0 && items.length === 0) {
      const newZoom = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
      setZoom(newZoom);
      setPanOffset({ x: (vw - CANVAS_WIDTH * newZoom) / 2, y: (vh - CANVAS_HEIGHT * newZoom) / 2 });
      return;
    }

    const PAD = 60;
    const xs = [
      ...boxes.map(b => b.x), ...boxes.map(b => b.x + b.width),
      ...items.map(b => b.boardX), ...items.map(b => b.boardX + b.boardW),
    ];
    const ys = [
      ...boxes.map(b => b.y), ...boxes.map(b => b.y + b.height),
      ...items.map(b => b.boardY), ...items.map(b => b.boardY + b.boardH),
    ];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const contentW = Math.max(...xs) - minX;
    const contentH = Math.max(...ys) - minY;

    const newZoom = Math.min(1.5, Math.max(0.05,
      Math.min(vw / (contentW + PAD * 2), vh / (contentH + PAD * 2))
    ));
    setZoom(newZoom);
    setPanOffset({
      x: vw / 2 - (minX + contentW / 2) * newZoom,
      y: vh / 2 - (minY + contentH / 2) * newZoom,
    });
  }, [board, setZoom, setPanOffset, animateViewChange]);

  // Restore this board's remembered view (zoom + pan) when switching boards, so
  // moving in and out of boards preserves where you were. Only auto-fit the first
  // time a board is opened; save the view on leave. (Also re-fit via the explicit
  // plancraft:fit-board event below.)
  useEffect(() => {
    const saved = useBoardStore.getState().boardViews[boardId];
    let raf = 0;
    if (saved) {
      setZoom(saved.zoom);
      setPanOffset(saved.panOffset);
    } else {
      raf = requestAnimationFrame(() => handleFitContent());
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      useBoardStore.getState().rememberBoardView(boardId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    const handler = () => requestAnimationFrame(() => handleFitContent());
    window.addEventListener("plancraft:fit-board", handler);
    return () => window.removeEventListener("plancraft:fit-board", handler);
  }, [handleFitContent]);

  // Center the canvas on a box or board-level item and select it (chat links).
  const handleFocusBox = useCallback((targetId: string) => {
    animateViewChange();
    if (!viewportRef.current) return;
    const box = (board?.boxes ?? []).find((x) => x.id === targetId);
    const item = box ? undefined : (board?.boardItems ?? []).find((x) => x.id === targetId);
    const r = box
      ? { x: box.x, y: box.y, w: box.width, h: box.height }
      : item
        ? { x: item.boardX ?? 0, y: item.boardY ?? 0, w: item.boardW ?? 320, h: item.boardH ?? 220 }
        : null;
    if (!r) return;
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;
    const PAD = 140;
    const newZoom = Math.min(1.2, Math.max(0.1, Math.min(vw / (r.w + PAD * 2), vh / (r.h + PAD * 2))));
    setZoom(newZoom);
    setPanOffset({ x: vw / 2 - (r.x + r.w / 2) * newZoom, y: vh / 2 - (r.y + r.h / 2) * newZoom });
    if (box) selectBox(targetId);
    else selectBoardItem(targetId);
  }, [board, setZoom, setPanOffset, selectBox, selectBoardItem]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.boxId as string | undefined;
      if (id) requestAnimationFrame(() => handleFocusBox(id));
    };
    window.addEventListener("crecoard:focus-box", handler);
    return () => window.removeEventListener("crecoard:focus-box", handler);
  }, [handleFocusBox]);

  // Ctrl/Cmd + wheel → zoom toward cursor
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const state = useBoardStore.getState();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const oldZoom = state.zoom;
      const newZoom = parseFloat(Math.max(state.minZoom, Math.min(3, oldZoom + delta)).toFixed(2));
      const ratio = newZoom / oldZoom;
      setZoom(newZoom);
      setPanOffset({
        x: cursorX - (cursorX - state.panOffset.x) * ratio,
        y: cursorY - (cursorY - state.panOffset.y) * ratio,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // board?.id: server boards render a skeleton (no viewportRef) until data loads,
    // so re-run once the real canvas mounts — otherwise ctrl/⌘+wheel zoom never binds.
  }, [setZoom, setPanOffset, board?.id]);

  // ── Touch gestures: one-finger pan (on empty canvas) + two-finger pinch-zoom ──
  // Box/item dragging stays with dnd-kit's TouchSensor (200ms press-and-hold), so a
  // quick swipe pans instead of dragging. touch-action:none on the viewport stops
  // the browser hijacking the gestures for native scroll/zoom.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    let mode: "none" | "pan" | "pinch" = "none";
    let sx = 0, sy = 0;
    let sPan = { x: 0, y: 0 };
    let sDist = 0, sZoom = 1, sMid = { x: 0, y: 0 };

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    // Pannable surfaces: the canvas background, opt-in elements, and the viewport
    // itself — the letterbox area around a zoomed-out canvas. Without the viewport,
    // a mostly-covered board has almost nowhere to pan from on a phone.
    const pannable = (target: EventTarget | null) =>
      target instanceof Element && (target === el || target === canvasRef.current || target.hasAttribute("data-pannable"));

    let lastTap = { t: 0, x: 0, y: 0 };

    const onStart = (e: TouchEvent) => {
      const state = useBoardStore.getState();
      if (e.touches.length === 2) {
        mode = "pinch";
        sDist = dist(e.touches);
        sZoom = state.zoom;
        sMid = mid(e.touches);
        sPan = { ...state.panOffset };
        panMoved.current = true;
        e.preventDefault();
      } else if (e.touches.length === 1 && pannable(e.target)) {
        const t = e.touches[0];
        // Double-tap on empty space → zoom to 100% at the tap point; again → fit.
        const now = Date.now();
        if (now - lastTap.t < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
          e.preventDefault();
          lastTap = { t: 0, x: 0, y: 0 };
          mode = "none";
          if (state.zoom < 0.98) {
            const rect = el.getBoundingClientRect();
            const ax = t.clientX - rect.left;
            const ay = t.clientY - rect.top;
            const ratio = 1 / state.zoom;
            setZoom(1);
            setPanOffset({
              x: ax - (ax - state.panOffset.x) * ratio,
              y: ay - (ay - state.panOffset.y) * ratio,
            });
          } else {
            handleFitContent();
          }
          return;
        }
        lastTap = { t: now, x: t.clientX, y: t.clientY };
        mode = "pan";
        sx = t.clientX;
        sy = t.clientY;
        sPan = { ...state.panOffset };
        panMoved.current = false;
      } else {
        mode = "none";
      }
    };

    const onMove = (e: TouchEvent) => {
      if (mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const m = mid(e.touches);
        const raw = sZoom * (dist(e.touches) / (sDist || 1));
        const newZoom = parseFloat(Math.max(useBoardStore.getState().minZoom, Math.min(3, raw)).toFixed(3));
        const ratio = newZoom / sZoom;
        const ax = sMid.x - rect.left;
        const ay = sMid.y - rect.top;
        setZoom(newZoom);
        setPanOffset({
          x: ax - (ax - sPan.x) * ratio + (m.x - sMid.x),
          y: ay - (ay - sPan.y) * ratio + (m.y - sMid.y),
        });
      } else if (mode === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMoved.current = true;
        e.preventDefault();
        setPanOffset({ x: sPan.x + dx, y: sPan.y + dy });
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) { mode = "none"; return; }
      if (e.touches.length === 1) {
        // Dropped from two fingers to one → continue panning with the remaining finger.
        mode = "pan";
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        sPan = { ...useBoardStore.getState().panOffset };
      }
    };

    // iOS Safari runs its own page pinch-zoom through proprietary gesture events,
    // ignoring touch-action for the page-level gesture — suppress it inside the
    // board viewport so our pinch handler is the only zoom.
    const stopGesture = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("gesturestart", stopGesture);
    el.addEventListener("gesturechange", stopGesture);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", stopGesture);
      el.removeEventListener("gesturechange", stopGesture);
    };
    // board?.id: re-bind after the loading skeleton is replaced by the real canvas
    // (server boards), so touch pan/pinch attach to the viewport.
  }, [setZoom, setPanOffset, handleFitContent, board?.id]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;

      const ctrl = e.ctrlKey || e.metaKey;

      // Escape → close expanded block
      if (e.key === "Escape") {
        setExpandedBox(null);
        return;
      }

      // Arrow navigation when a block is expanded (M5: read from refs to avoid stale closures)
      if (expandedRef.current && boxesRef.current.length > 0) {
        const visibleBoxes = boxesRef.current.filter((b) => !b.deckOwnerId);
        const sorted = [...visibleBoxes].sort((a, b) => a.zIndex - b.zIndex);
        const idx = sorted.findIndex((b) => b.id === expandedRef.current);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = sorted[idx + 1] ?? sorted[0];
          if (next) setExpandedBox(next.id);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prev = sorted[idx - 1] ?? sorted[sorted.length - 1];
          if (prev) setExpandedBox(prev.id);
          return;
        }
      }

      // Ctrl/Cmd +/- → zoom (M4: use real viewport center, not hardcoded 1200/700)
      if (ctrl && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const state = useBoardStore.getState();
        const rect = viewportRef.current?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 600;
        const cy = rect ? rect.height / 2 : 400;
        const newZoom = parseFloat(Math.max(state.minZoom, Math.min(3, state.zoom + 0.1)).toFixed(2));
        const ratio = newZoom / state.zoom;
        setZoom(newZoom);
        setPanOffset({
          x: cx - (cx - state.panOffset.x) * ratio,
          y: cy - (cy - state.panOffset.y) * ratio,
        });
        return;
      }
      if (ctrl && e.key === "-") {
        e.preventDefault();
        const state = useBoardStore.getState();
        const rect = viewportRef.current?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 600;
        const cy = rect ? rect.height / 2 : 400;
        const newZoom = parseFloat(Math.max(state.minZoom, Math.min(3, state.zoom - 0.1)).toFixed(2));
        const ratio = newZoom / state.zoom;
        setZoom(newZoom);
        setPanOffset({
          x: cx - (cx - state.panOffset.x) * ratio,
          y: cy - (cy - state.panOffset.y) * ratio,
        });
        return;
      }
      // Ctrl/Cmd+0 → reset zoom to 1 centered on viewport (M4)
      if (ctrl && e.key === "0") {
        e.preventDefault();
        const state = useBoardStore.getState();
        const rect = viewportRef.current?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 600;
        const cy = rect ? rect.height / 2 : 400;
        const newZoom = 1;
        const ratio = newZoom / state.zoom;
        setZoom(newZoom);
        setPanOffset({
          x: cx - (cx - state.panOffset.x) * ratio,
          y: cy - (cy - state.panOffset.y) * ratio,
        });
        return;
      }

      // Delete / Backspace — only when not in an input and not dragging (H7)
      if (!isEditable && (e.key === "Delete" || e.key === "Backspace")) {
        const state = useBoardStore.getState();
        if (state.draggingBlockId) return; // don't delete while dragging
        if (state.selectedBoxId) {
          const boxId = state.selectedBoxId;
          removeBox(boardId, boxId);
          broadcastOp({ op: "removeBox", boardId, boxId });
        }
        return;
      }

      // Ctrl/Cmd+D → duplicate selected box (M6: guard by edit permission)
      if (ctrl && e.key === "d") {
        e.preventDefault();
        if (!canEditBoard) return; // read-only members cannot duplicate
        const state = useBoardStore.getState();
        if (state.selectedBoxId) {
          duplicateBox(boardId, state.selectedBoxId);
        }
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardId, removeBox, duplicateBox, setExpandedBox, setZoom, setPanOffset, canEditBoard, broadcastOp]);

  if (!board) {
    // Board content is on its way (server board being fetched) — ghost layout
    // instead of a blank void so the switch feels instant.
    return (
      <div className="relative h-full w-full flex-1 overflow-hidden" aria-busy="true">
        {[
          { left: "12%", top: "14%", width: 300, height: 210 },
          { left: "42%", top: "10%", width: 260, height: 170 },
          { left: "66%", top: "24%", width: 300, height: 230 },
          { left: "18%", top: "54%", width: 360, height: 190 },
          { left: "54%", top: "60%", width: 280, height: 170 },
        ].map((g, i) => (
          <div key={i} className="cr-skeleton absolute" style={{ ...g, animationDelay: `${i * 130}ms` }} />
        ))}
      </div>
    );
  }

  const bgSize = board.backgroundSize ?? "cover";

  const defaultItemSizes: Partial<Record<string, [number, number]>> = {
    text: [280, 120], list: [280, 200], timer: [200, 200],
    graph: [360, 260], table: [500, 300], calendar: [400, 340],
    image: [280, 200], embed: [360, 260], widget: [360, 260],
    api: [280, 180], variable: [200, 80], playlist: [280, 300],
    chat: [320, 420],
  };

  const boardMenuItems = [
    {
      label: "Add block here",
      icon: <SquarePlus size={14} />,
      shortcut: "A",
      onClick: () => {
        if (!boardCtx) return;
        const boxData = {
          x: Math.max(0, Math.round(boardCtx.canvasX / 20) * 20 - 140),
          y: Math.max(0, Math.round(boardCtx.canvasY / 20) * 20 - 110),
          width: 280, height: 220,
          locked: false, title: "New block",
          isExpanded: false, items: [],
          style: { ...DEFAULT_BOX_STYLE },
        };
        const newBoxId = addBox(boardId, boxData);
        broadcastOp({ op: "addBox", boardId, boxId: newBoxId, box: boxData });
      },
    },
    {
      label: "Add item here",
      icon: <Package size={14} />,
      children: ITEM_DEFINITIONS.filter(d => !d.serverOnly || serverId !== null).map((def) => ({
        label: def.label,
        icon: def.icon,
        onClick: () => {
          if (!boardCtx) return;
          const [itemW, itemH] = defaultItemSizes[def.type] ?? [280, 200];
          const snapV = (v: number) => Math.round(v / 20) * 20;
          const boardItemId = nanoid();
          const boardItem = {
            ...def.defaultItem(),
            id: boardItemId,
            showInCollapsed: false as const,
            boardX: Math.max(0, snapV(boardCtx.canvasX - itemW / 2)),
            boardY: Math.max(0, snapV(boardCtx.canvasY - itemH / 2)),
            boardW: itemW,
            boardH: itemH,
          };
          addBoardItem(boardId, boardItem);
          broadcastOp({ op: "addBoardItem", boardId, item: boardItem });
        },
      })),
    },
    ...(copiedBox ? [{
      label: "Paste block here",
      icon: <Clipboard size={14} />,
      shortcut: "⌘V",
      onClick: () => {
        if (!boardCtx) return;
        pasteBox(boardId, boardCtx.canvasX - 140, boardCtx.canvasY - 110);
      },
    }] : []),
    "separator" as const,
    {
      label: showGrid ? "Hide grid" : "Show grid",
      icon: <LayoutGrid size={14} />,
      onClick: () => toggleGrid(),
    },
    {
      label: "Fit content to view",
      icon: <ScanSearch size={14} />,
      shortcut: "⌘0",
      onClick: handleFitContent,
    },
    {
      label: "Save board as image",
      icon: <Camera size={14} />,
      onClick: () => {
        void exportBoardImage(boardId)
          .then((ok) => { if (!ok) window.alert("Nothing to capture — the board is empty."); })
          .catch(() => window.alert("Couldn't capture the board as an image."));
      },
    },
    "separator" as const,
    {
      label: "Board theme",
      icon: <Palette size={14} />,
      onClick: () => {
        document.querySelector<HTMLButtonElement>("[data-theme-btn]")?.click();
      },
    },
    {
      label: "Share board",
      icon: <Share2 size={14} />,
      onClick: () => {
        document.querySelector<HTMLButtonElement>("[data-share-btn]")?.click();
      },
    },
    {
      label: "Select all blocks",
      icon: <Layers size={14} />,
      onClick: () => {},
      disabled: true,
    },
  ];

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Theme background — fixed behind the canvas, doesn't pan or zoom */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: board.themeBgColor ?? "var(--surface)" }}
      />
      {board.themeBgImage && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${board.themeBgImage})`,
            backgroundSize: board.themeBgSize ?? "cover",
            backgroundPosition: "center",
            opacity: board.themeBgOpacity ?? 1,
          }}
        />
      )}

      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ zIndex: 2, cursor: panning ? "grabbing" : undefined, touchAction: "none", overscrollBehavior: "none" }}
        onMouseDown={handlePanMouseDown}
        onMouseMove={handleMouseMove}
      >
        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          onContextMenu={handleBoardContextMenu}
          data-board-canvas
          className="relative"
          style={{
            position: "absolute",
            width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
            transformOrigin: "0 0",
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            cursor: panning ? "grabbing" : "grab",
          }}
        >
          {/* ── Background layers: move & scale with canvas ── */}
          <div aria-hidden className="absolute inset-0 pointer-events-none"
            style={{ backgroundColor: board.backgroundColor ?? "#1a1b1e" }} />
          {/* Live wallpaper — fills the board area, moves & scales with the canvas */}
          {hasLiveWallpaper(board) && (
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
              <LiveWallpaper board={board} />
            </div>
          )}
          {!hasLiveWallpaper(board) && board.backgroundImage && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${board.backgroundImage})`,
                backgroundSize: bgSize,
                backgroundPosition: board.backgroundPosition ?? "center",
                backgroundRepeat: bgSize === "auto" ? "no-repeat" : undefined,
                opacity: board.backgroundOpacity ?? 1,
                filter: board.backgroundFilter || undefined,
              }}
            />
          )}
          {(board.backgroundOverlayOpacity ?? 0) > 0 && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: board.backgroundOverlayColor ?? "#000000",
                opacity: board.backgroundOverlayOpacity,
              }}
            />
          )}
          {effectiveShowGrid && (
            <div aria-hidden className={cn("absolute inset-0 pointer-events-none", zoom >= 0.55 ? "board-grid" : "board-grid-major")} />
          )}

          {board.boxes.filter(box => !box.deckOwnerId).map((box) => (
            <BoardBox
              key={box.id}
              box={box}
              boardId={boardId}
              isDragging={draggingBlockId === box.id}
            />
          ))}

          {/* Empty canvas hint */}
          {board.boxes.length === 0 && (board.boardItems ?? []).length === 0 && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: 13, opacity: 0.5 }}>Right-click to add a block · Drag items from the left panel</p>
            </div>
          )}

          {(board.boardItems ?? []).map((item) => (
            <BoardItemWidget
              key={item.id}
              item={item}
              boardId={boardId}
              isFinished={isFinished}
              isSelected={selectedBoardItemId === item.id}
            />
          ))}

          <AlignmentGuides boxes={board.boxes} items={board.boardItems ?? []} />
          <CollabCursors cursors={cursors} zoom={zoom} />
        </div>
      </div>

      {board.boxes.length === 0 && (board.boardItems?.length ?? 0) === 0 && (
        <EmptyBoardState canEdit={canEditBoard} />
      )}
      {serverId && <MemberCapabilities board={board} serverId={serverId} viewerRole={viewerRole} viewerRoleIds={viewerRoleIds} />}

      {/* Fit-to-content + (mobile) zoom controls */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 md:left-auto md:right-3">
        {isMobile && (
          <div className="flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg">
            <button
              onClick={() => zoomAtCanvasCenter(zoom - 0.25)}
              title="Zoom out"
              className="flex h-8 w-8 items-center justify-center text-[var(--text-muted)] transition-colors active:bg-[var(--surface-overlay)]"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => zoomAtCanvasCenter(1)}
              title="Reset zoom"
              className="min-w-[42px] px-1 text-center text-[11px] font-medium tabular-nums text-[var(--text-muted)] active:bg-[var(--surface-overlay)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => zoomAtCanvasCenter(zoom + 0.25)}
              title="Zoom in"
              className="flex h-8 w-8 items-center justify-center text-[var(--text-muted)] transition-colors active:bg-[var(--surface-overlay)]"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        )}
        <button
          onClick={handleFitContent}
          title="Fit content to view"
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 text-[11px] font-medium text-[var(--text-muted)] shadow-lg transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]",
            isMobile ? "h-8" : "py-1.5",
          )}
        >
          <ScanSearch size={12} />
          Fit
        </button>
      </div>

      {boardCtx && (
        <ContextMenu
          x={boardCtx.screenX}
          y={boardCtx.screenY}
          items={boardMenuItems}
          onClose={() => setBoardCtx(null)}
        />
      )}

      {blockShot && (
        <BlockShot
          boardId={blockShot.boardId}
          boxId={blockShot.boxId}
          onDone={(url) => { blockShot.resolve(url); setBlockShot(null); }}
        />
      )}
    </div>
  );
}
