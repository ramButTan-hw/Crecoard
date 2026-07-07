"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Edit3, Copy, Trash2, Lock, Unlock,
  CopyPlus, Clipboard, ArrowUpToLine, ArrowDownToLine,
  SquareDashedMousePointer, Maximize2, CheckSquare, CheckCircle2,
  LayoutGrid, Plus, ShieldCheck, RefreshCw, Archive, History,
} from "lucide-react";
import { Box, BlockItem, BoxRecurrence, useBoardStore, suppressUndo } from "@/store/boardStore";
import { useCanEditBoard, useServerBoard } from "@/contexts/ServerBoardContext";
import { BoxPermissionModal } from "./PermissionModal";
import { RecurrenceModal } from "./RecurrenceModal";
import { BlockArchiveModal } from "./BlockArchiveModal";
import { saveBlockArchive } from "@/lib/blockArchive";
import { instantiateTemplate } from "@/lib/recurringBlocks";
import { useCollab } from "@/lib/useCollabSession";
import { ItemRenderer } from "@/components/items/ItemRenderer";
import { DeckBox } from "./DeckBox";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { magnetize, snapPosition } from "@/lib/snapToGrid";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/boardConstants";
import { cn } from "@/lib/utils";

const MIN_W = 160;
const MIN_H = 100;

// Quick-pick block colors shown in the right-click menu (first = default surface)
const BLOCK_COLORS = [
  "#25262b", "#a2695f", "#b08d42", "#a8a23f", "#6aa84f",
  "#45a09a", "#4a6fa8", "#9a63c9", "#a85a80",
];

// ─── Collapsed item card (absolute-positioned, draggable + resizable) ──────────

function CollapsedItemCard({
  item, idx, boardId, boxId, boxW, padding, isFinished, canEdit, zoom,
}: {
  item: BlockItem; idx: number;
  boardId: string; boxId: string;
  boxW: number; padding: number;
  isFinished: boolean; canEdit: boolean; zoom: number;
}) {
  const { moveCollapsedItem, resizeCollapsedItem } = useBoardStore();
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const colItemCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { return () => { colItemCleanupRef.current?.(); }; }, []);

  const defaultW = Math.max(80, boxW - padding * 2 - 8);
  const x = item.collapsedX ?? padding;
  const y = item.collapsedY ?? (padding + idx * 46);
  const w = item.collapsedW ?? defaultW;
  const h = item.collapsedH ?? (item.type === "chat" ? 64 : 40);

  const displayX = livePos?.x ?? x;
  const displayY = livePos?.y ?? y;
  const displayW = liveSize?.w ?? w;
  const displayH = liveSize?.h ?? h;

  const handleDragStart = (e: React.PointerEvent) => {
    if (isFinished || !canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    // Clean up any previous listener set before registering new ones
    colItemCleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setLivePos({ x: Math.max(0, x + dx), y: Math.max(0, y + dy) });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      colItemCleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      moveCollapsedItem(boardId, boxId, item.id, Math.max(0, Math.round(x + dx)), Math.max(0, Math.round(y + dy)));
      setLivePos(null);
      cleanup();
    };
    colItemCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    if (isFinished || !canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    // Clean up any previous listener set before registering new ones
    colItemCleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setLiveSize({ w: Math.max(60, w + dx), h: Math.max(20, h + dy) });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      colItemCleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      resizeCollapsedItem(boardId, boxId, item.id, Math.max(60, Math.round(w + dx)), Math.max(20, Math.round(h + dy)));
      setLiveSize(null);
      cleanup();
    };
    colItemCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="absolute group/ci"
      style={{
        left: displayX, top: displayY,
        width: displayW, height: displayH,
        overflow: "hidden",
        cursor: isFinished ? "default" : "move",
        zIndex: 1,
      }}
      onPointerDown={!isFinished && canEdit ? handleDragStart : undefined}
    >
      <ItemRenderer item={item} boardId={boardId} boxId={boxId} vars={{}} collapsed isFinished={isFinished || !canEdit} containerW={displayW} containerH={displayH} />

      {/* Type badge — appears on hover so user knows what each mini-card is */}
      <div className="absolute top-0.5 left-0.5 z-20 pointer-events-none opacity-0 group-hover/ci:opacity-90 transition-opacity duration-150">
        <span className="rounded-sm px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white"
          style={{ background: "rgba(0,0,0,0.55)" }}>
          {item.type}
        </span>
      </div>

      {!isFinished && canEdit && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 opacity-0 group-hover/ci:opacity-60 transition-opacity"
          style={{
            cursor: "se-resize",
            background: "linear-gradient(135deg, transparent 50%, var(--accent) 50%)",
            zIndex: 10,
          }}
          onPointerDown={handleResizeStart}
        />
      )}
    </div>
  );
}

interface BoardBoxProps {
  box: Box;
  boardId: string;
  isDragging: boolean;
}

export function BoardBox({ box, boardId, isDragging }: BoardBoxProps) {
  const {
    selectBox, removeBox, updateBox, updateBoxStyle, resizeBox, moveBox, bringToFront, sendToBack,
    duplicateBox, copyBox, pasteBox, copiedBox, setExpandedBox, setResizeState, replaceBoxItems,
  } = useBoardStore();
  const zoom = useBoardStore(s => s.zoom);
  const isFinished = useBoardStore(s =>
    (s.boards.find(b => b.id === boardId) ?? s.serverBoards[boardId])?.isFinished ?? false
  );
  const canEdit = useCanEditBoard();
  const { serverId, viewerRole, isDraftMode } = useServerBoard();
  const { broadcastOp } = useCollab();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState(box.title);
  const [isHovered, setIsHovered] = useState(false);

  // ─── Drag ───────────────────────────────────────────────────────────────────
  // Same pointer-based movement as board-level items (BoardItemWidget): live
  // magnetic snapping to neighbors, alignment guides via dragPos, commit on up.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${box.id}`,
    data: { kind: "block-drop-zone" },
    disabled: isFinished,
  });

  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => { return () => { dragCleanupRef.current?.(); }; }, []);

  const canDrag = !box.locked && !isFinished && canEdit && (!serverId || isDraftMode);

  const beginMove = useCallback((startX: number, startY: number) => {
    dragCleanupRef.current?.();
    const origX = box.x;
    const origY = box.y;
    // Align to neighbors (boxes + board items) — captured once, positions are
    // static for the duration of the drag. Grid stays as an opt-in fallback.
    const st0 = useBoardStore.getState();
    const board0 = st0.boards.find((b) => b.id === boardId) ?? st0.serverBoards[boardId];
    const targets = board0 ? [
      ...board0.boxes.filter((b) => b.id !== box.id && !b.deckOwnerId).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
      ...(board0.boardItems ?? []).map((i) => ({ x: i.boardX, y: i.boardY, w: i.boardW, h: i.boardH })),
    ] : [];
    const snapped = (dx: number, dy: number) => {
      const p = snapPosition({ x: origX + dx, y: origY + dy, w: box.width, h: box.height }, targets, useBoardStore.getState().showGrid);
      return { x: Math.max(0, p.x), y: Math.max(0, p.y) };
    };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      moved = true;
      const p = snapped(dx, dy);
      setLivePos(p);
      useBoardStore.getState().setDragPos(p);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const st = useBoardStore.getState();
      st.setDragPos(null);
      st.setDraggingBlock(null);
      dragCleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      if (moved) {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        const p = snapped(dx, dy);
        const newX = Math.round(Math.max(0, Math.min(CANVAS_WIDTH - box.width, p.x)));
        const newY = Math.round(Math.max(0, Math.min(CANVAS_HEIGHT - box.height, p.y)));
        const state = useBoardStore.getState();
        const board = state.boards.find((b) => b.id === boardId) ?? state.serverBoards[boardId];
        // Dropping a block onto another block merges them into a deck (slideshow).
        const cx = newX + box.width / 2;
        const cy = newY + box.height / 2;
        const target = board && !box.deckOwnerId ? board.boxes.find((b) =>
          b.id !== box.id && !b.deckOwnerId &&
          cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height
        ) : undefined;
        if (target) {
          if (target.isDeck) state.addToDeck(boardId, target.id, box.id);
          else state.createDeck(boardId, box.id, target.id);
        } else {
          moveBox(boardId, box.id, newX, newY);
          broadcastOp({ op: "moveBox", boardId, boxId: box.id, x: newX, y: newY });
        }
      }
      setLivePos(null);
      cleanup();
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [boardId, box.id, box.x, box.y, box.width, box.height, box.deckOwnerId, zoom, moveBox, broadcastOp]);

  const handleBoxPointerDown = useCallback((e: React.PointerEvent) => {
    // Same interaction grammar as board-level items: interactive elements and
    // scrollable content win; anywhere else arms a 6px movement threshold so
    // plain clicks still select/expand.
    if (e.button !== 0 || !canDrag) return;
    const el = e.target as HTMLElement;
    if (el.closest('button,a,input,textarea,select,[contenteditable="true"],[data-nodrag],iframe,video,audio')) return;
    let n: HTMLElement | null = el;
    while (n && n !== e.currentTarget) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) &&
          (n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)) return;
      n = n.parentElement;
    }
    const sx = e.clientX, sy = e.clientY;
    const arm = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      disarm();
      document.getSelection()?.removeAllRanges();
      selectBox(box.id);
      bringToFront(boardId, box.id);
      useBoardStore.getState().setDraggingBlock(box.id);
      beginMove(sx, sy);
    };
    const disarm = () => {
      window.removeEventListener("pointermove", arm);
      window.removeEventListener("pointerup", disarm);
    };
    window.addEventListener("pointermove", arm);
    window.addEventListener("pointerup", disarm);
  }, [canDrag, box.id, boardId, selectBox, bringToFront, beginMove]);

  // ─── Resize ─────────────────────────────────────────────────────────────────
  const resizing = useRef(false);
  const resizeOrigin = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });
  const [liveBox, setLiveBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { resizeCleanupRef.current?.(); };
  }, []);

  const makeResizeHandler = useCallback(
    (edges: { n?: boolean; s?: boolean; e?: boolean; w?: boolean }) =>
      (e: React.MouseEvent) => {
        if (box.locked || isFinished) return;
        e.stopPropagation(); e.preventDefault();
        resizing.current = true;
        resizeOrigin.current = { mx: e.clientX, my: e.clientY, x: box.x, y: box.y, w: box.width, h: box.height };
        const snapEnabled = useBoardStore.getState().showGrid;
        const snap = (v: number) => magnetize(v, snapEnabled);

        const compute = (ev: MouseEvent) => {
          const dx = (ev.clientX - resizeOrigin.current.mx) / zoom;
          const dy = (ev.clientY - resizeOrigin.current.my) / zoom;
          let { x, y, w, h } = resizeOrigin.current;
          if (edges.e) w = Math.max(MIN_W, snap(w + dx));
          if (edges.s) h = Math.max(MIN_H, snap(h + dy));
          if (edges.w) { const nw = Math.max(MIN_W, snap(w - dx)); x = snap(x + w - nw); w = nw; }
          if (edges.n) { const nh = Math.max(MIN_H, snap(h - dy)); y = snap(y + h - nh); h = nh; }
          return { x: Math.max(0, x), y: Math.max(0, y), w, h };
        };

        const onMove = (ev: MouseEvent) => {
          if (!resizing.current) return;
          const { x, y, w, h } = compute(ev);
          setLiveBox({ x, y, w, h });
          setResizeState({ id: box.id, x, y, width: w, height: h });
        };
        const cleanup = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          resizeCleanupRef.current = null;
        };
        const onUp = (ev: MouseEvent) => {
          resizing.current = false;
          const { x, y, w, h } = compute(ev);
          moveBox(boardId, box.id, x, y);
          resizeBox(boardId, box.id, w, h);
          broadcastOp({ op: "resizeMoveBox", boardId, boxId: box.id, x, y, width: w, height: h });
          setLiveBox(null);
          setResizeState(null);
          cleanup();
        };
        resizeCleanupRef.current = cleanup;
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      },
    [boardId, box.id, box.x, box.y, box.width, box.height, box.locked, isFinished, zoom, moveBox, resizeBox, setResizeState, broadcastOp]
  );

  // ─── Context menu handler ────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isFinished) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) {
      // Members get a minimal "Open block" menu only
      setCtxMenu({ x: e.clientX, y: e.clientY });
      return;
    }
    selectBox(box.id);
    bringToFront(boardId, box.id);
    broadcastOp({ op: "bringToFront", boardId, boxId: box.id });
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [isFinished, canEdit, selectBox, bringToFront, boardId, box.id, broadcastOp]);

  const handleCtxMenuClose = useCallback(() => setCtxMenu(null), []);

  // Suppress the tap-to-expand click that fires after a drag (touch especially),
  // so "hold to move" doesn't also expand the box / open its editor.
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) { draggedRef.current = true; return; }
    if (draggedRef.current) {
      const t = setTimeout(() => { draggedRef.current = false; }, 60);
      return () => clearTimeout(t);
    }
  }, [isDragging]);

  const commitRename = useCallback(() => {
    const title = renameInput.trim();
    if (title) {
      updateBox(boardId, box.id, { title });
      broadcastOp({ op: "updateBox", boardId, boxId: box.id, patch: { title } });
    }
    setIsRenaming(false);
  }, [boardId, box.id, renameInput, updateBox, broadcastOp]);

  // ─── Block color / recurring reset / archive ────────────────────────────────
  const setBlockColor = (backgroundColor: string) => {
    // A wallpaper image renders on top of the background color — clear it so the pick shows
    const style = { backgroundColor, wallpaperUrl: "" };
    updateBoxStyle(boardId, box.id, style);
    broadcastOp({ op: "updateBoxStyle", boardId, boxId: box.id, style });
    setCtxMenu(null);
  };

  const applyRecurrence = (recurrence: BoxRecurrence | undefined) => {
    updateBox(boardId, box.id, { recurrence });
    broadcastOp({ op: "updateBox", boardId, boxId: box.id, patch: { recurrence } });
  };

  const archiveNow = () => {
    void saveBlockArchive({
      boardId, boxId: box.id, title: box.title,
      periodStart: null, periodEnd: null,
      kind: "manual", pinned: true, items: box.items,
    }).then((res) => {
      if (!res.ok && res.reason === "limit")
        window.alert("Archive limit reached for this block — delete or export old snapshots first.");
    });
  };

  const restoreFromArchive = (items: BlockItem[]) => {
    // Never destructive: the outgoing contents are archived before being replaced
    if (box.items.length > 0)
      void saveBlockArchive({
        boardId, boxId: box.id, title: box.title,
        periodStart: null, periodEnd: null,
        kind: "manual", pinned: false, items: box.items,
      });
    const fresh = instantiateTemplate(items);
    replaceBoxItems(boardId, box.id, fresh);
    broadcastOp({ op: "replaceBoxItems", boardId, boxId: box.id, items: fresh });
  };

  // ─── Derived styles ──────────────────────────────────────────────────────────
  // Merge collapsedStyle overrides on top of the base style when rendering on the canvas
  const s: typeof box.style = box.collapsedStyle
    ? { ...box.style, ...box.collapsedStyle }
    : box.style;
  const displayW = liveBox?.w ?? box.width;
  const displayH = liveBox?.h ?? box.height;
  const displayX = livePos?.x ?? liveBox?.x ?? box.x;
  const displayY = livePos?.y ?? liveBox?.y ?? box.y;

  const wallpaperStyle: React.CSSProperties = s.wallpaperUrl
    ? {
        backgroundImage: `url(${s.wallpaperUrl})`,
        backgroundSize: s.wallpaperSize ?? "cover",
        backgroundPosition: s.wallpaperPosition ?? "center",
        backgroundRepeat: (s.wallpaperSize ?? "cover") === "auto" ? "no-repeat" : undefined,
        opacity: s.wallpaperOpacity,
      }
    : { backgroundColor: s.backgroundColor, opacity: s.wallpaperOpacity };

  const shadowMap: Record<string, string> = {
    none: "none", sm: "0 1px 3px rgba(0,0,0,0.3)", md: "0 4px 12px rgba(0,0,0,0.4)", lg: "0 8px 24px rgba(0,0,0,0.5)",
  };

  const isGlow = s.borderStyle === "glow";
  const borderCSS = box.isDeck ? "none" : isGlow ? "none" : `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}`;
  const glowCSS = !box.isDeck && isGlow
    ? `0 0 ${s.borderWidth * 6}px ${s.borderColor}, 0 0 ${s.borderWidth * 14}px ${s.borderColor}66`
    : null;
  const hoverShadow = isHovered && !isDragging ? "0 6px 20px rgba(0,0,0,0.45)" : null;
  const boxShadowCSS = [glowCSS, box.isDeck ? null : shadowMap[s.shadow], hoverShadow].filter(Boolean).join(", ") || "none";

  const summaryItems = box.items.filter((i) => i.showInCollapsed);
  const draggingBlockId = useBoardStore(s => s.draggingBlockId);
  // Live "drop to merge" hover — true while another block's drag center is over
  // this box (same center-inside test the drop commit uses).
  const mergeHover = useBoardStore((st) => {
    if (!st.draggingBlockId || st.draggingBlockId === box.id || !st.dragPos) return false;
    const board = st.boards.find((b) => b.id === boardId) ?? st.serverBoards[boardId];
    const d = board?.boxes.find((b) => b.id === st.draggingBlockId);
    if (!d || d.deckOwnerId) return false;
    const cx = st.dragPos.x + d.width / 2;
    const cy = st.dragPos.y + d.height / 2;
    return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
  });

  const allListEntries = box.items.filter(i => i.type === "list").flatMap(i => i.listItems ?? []);
  const rollupTotal = allListEntries.length;
  const rollupChecked = allListEntries.filter(e => e.checked).length;
  const rollupPct = rollupTotal > 0 ? (rollupChecked / rollupTotal) * 100 : 0;
  const isDeckMergeTarget = mergeHover && !box.isDeck;

  // ─── Read-only context menu (members) ───────────────────────────────────────
  const readOnlyMenuItems = [
    {
      label: "Open block",
      icon: <Maximize2 size={14} />,
      onClick: () => setExpandedBox(box.id),
    },
  ];

  // ─── Block context menu items ────────────────────────────────────────────────
  const blockMenuItems = [
    {
      label: "Open block",
      icon: <Maximize2 size={14} />,
      onClick: () => setExpandedBox(box.id),
    },
    {
      label: "Rename",
      icon: <Edit3 size={14} />,
      onClick: () => { setRenameInput(box.title); setIsRenaming(true); },
    },
    ...(!box.isDeck ? [{
      label: "Block color",
      custom: (
        <div className="flex items-center gap-1.5" role="group" aria-label="Block color">
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setBlockColor(c)}
              title="Set block color"
              className="h-[18px] w-[18px] rounded-full border transition-transform hover:scale-125"
              style={{
                background: c,
                borderColor: s.backgroundColor === c && !s.wallpaperUrl ? "var(--accent)" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
      ),
    }] : []),
    "separator" as const,
    {
      label: "Duplicate",
      icon: <CopyPlus size={14} />,
      shortcut: "⌘D",
      onClick: () => duplicateBox(boardId, box.id),
    },
    {
      label: "Copy block",
      icon: <Copy size={14} />,
      shortcut: "⌘C",
      onClick: () => copyBox(boardId, box.id),
    },
    ...(copiedBox ? [{
      label: "Paste as new block",
      icon: <Clipboard size={14} />,
      shortcut: "⌘V",
      onClick: () => pasteBox(boardId, box.x + 32, box.y + 32),
    }] : []),
    "separator" as const,
    {
      label: box.locked ? "Unlock block" : "Lock block",
      icon: box.locked ? <Unlock size={14} /> : <Lock size={14} />,
      onClick: () => {
        const locked = !box.locked;
        updateBox(boardId, box.id, { locked });
        broadcastOp({ op: "updateBox", boardId, boxId: box.id, patch: { locked } });
      },
    },
    {
      label: "Bring to front",
      icon: <ArrowUpToLine size={14} />,
      onClick: () => {
        bringToFront(boardId, box.id);
        broadcastOp({ op: "bringToFront", boardId, boxId: box.id });
      },
    },
    {
      label: "Send to back",
      icon: <ArrowDownToLine size={14} />,
      onClick: () => {
        sendToBack(boardId, box.id);
        broadcastOp({ op: "sendToBack", boardId, boxId: box.id });
      },
    },
    ...(!box.isDeck ? [
      "separator" as const,
      {
        label: box.recurrence ? "Recurring reset…" : "Make recurring…",
        icon: <RefreshCw size={14} />,
        onClick: () => setRecurrenceOpen(true),
      },
      {
        label: "Save to archive",
        icon: <Archive size={14} />,
        onClick: archiveNow,
      },
      {
        label: "View archive…",
        icon: <History size={14} />,
        onClick: () => setArchiveOpen(true),
      },
    ] : []),
    "separator" as const,
    {
      label: "Reset size",
      icon: <SquareDashedMousePointer size={14} />,
      onClick: () => {
        resizeBox(boardId, box.id, 280, 220);
        broadcastOp({ op: "resizeBox", boardId, boxId: box.id, width: 280, height: 220 });
      },
    },
    "separator" as const,
    {
      label: "Delete block",
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => {
        removeBox(boardId, box.id);
        broadcastOp({ op: "removeBox", boardId, boxId: box.id });
      },
    },
    ...(serverId && viewerRole === "owner" ? [
      "separator" as const,
      {
        label: "Set permissions",
        icon: <ShieldCheck size={14} />,
        onClick: () => { setCtxMenu(null); setPermModalOpen(true); },
      },
    ] : []),
  ];

  return (
    <>
      <div
        ref={setDropRef}
        onPointerDown={handleBoxPointerDown}
        className={cn(
          "board-box absolute group transition-[transform,box-shadow] duration-150",
          isDragging && "scale-[0.98]",
          isDragging && "dragging",
          (isOver || mergeHover) && !isDragging && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-transparent",
          !canEdit && !isFinished && "ring-1 ring-inset ring-[var(--border)]"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          left: displayX, top: displayY,
          width: displayW, height: displayH,
          zIndex: box.zIndex,
          border: liveBox ? "2px solid var(--accent)" : borderCSS,
          borderRadius: s.borderRadius,
          boxShadow: boxShadowCSS,
          fontFamily: s.fontFamily, fontSize: s.fontSize,
          color: s.fontColor,
          fontWeight: s.fontWeight === "bold" ? 700 : s.fontWeight === "medium" ? 500 : 400,
          overflow: "hidden",
          cursor: box.locked || isFinished || !canEdit ? "default" : "pointer",
          position: "absolute",
          display: "flex",
          flexDirection: "column",
        }}
        onDoubleClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boxId: box.id } }));
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (draggedRef.current) { draggedRef.current = false; return; } // ignore click after a drag
          // Select/raise is an EDIT affordance (locked boards skip it), but OPENING
          // a block is a USE action — a finished/locked board is meant to be used,
          // so opening always works. Locking only prevents move/resize/delete/edit.
          if (!isFinished) {
            selectBox(box.id);
            bringToFront(boardId, box.id);
          }
          if (!box.isDeck) setExpandedBox(box.id);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Dimension readout while resizing */}
        {liveBox && (
          <div aria-hidden style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 30, pointerEvents: "none",
            background: "rgba(0,0,0,0.62)", backdropFilter: "blur(6px)",
            color: "#fff", fontFamily: "ui-monospace, monospace",
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            whiteSpace: "nowrap", letterSpacing: "0.06em",
          }}>
            {Math.round(liveBox.w)} × {Math.round(liveBox.h)}
          </div>
        )}

        {/* Wallpaper layer */}
        {!box.isDeck && <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", zIndex: 0, ...wallpaperStyle }} />}

        {/* Animated glow — extra shadow layer pulsing its opacity (compositor-safe) */}
        {isGlow && s.glowAnimate && glowCSS && (
          <div aria-hidden className="cr-glow-pulse-layer" style={{ position: "absolute", inset: 0, borderRadius: "inherit", boxShadow: glowCSS, zIndex: 0 }} />
        )}

        {/* Hover inner ring */}
        {isHovered && !isDragging && (
          <div aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10 pointer-events-none z-10" />
        )}

        {/* Drop zone highlights — isOver = dnd-kit palette drag; mergeHover = block drag */}
        {isDeckMergeTarget && (
          <div aria-hidden className="absolute inset-0 z-10 rounded-[inherit] border-2 border-dashed border-purple-400 bg-purple-400/10 flex items-center justify-center pointer-events-none">
            <span className="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white shadow">Drop to create slideshow</span>
          </div>
        )}
        {isOver && !box.isDeck && (
          <div aria-hidden className="absolute inset-0 z-10 rounded-[inherit] border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/10 flex items-center justify-center pointer-events-none">
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white shadow">Drop to add item</span>
          </div>
        )}
        {mergeHover && box.isDeck && (
          <div aria-hidden className="absolute inset-0 z-10 rounded-[inherit] border-2 border-dashed border-purple-400 bg-purple-400/10 flex items-center justify-center pointer-events-none">
            <span className="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white shadow">Drop to add slide</span>
          </div>
        )}

        {/* Block title bottom bar — full-width with gradient */}
        {isRenaming ? (
          <input
            autoFocus
            value={renameInput}
            onChange={e => setRenameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setIsRenaming(false); }}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            className="absolute bottom-2 left-3 z-20 w-[65%] rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white outline-none ring-1 ring-[var(--accent)]"
            style={{ backdropFilter: "blur(4px)" }}
          />
        ) : (box.title || rollupTotal > 0) ? (
          <div
            aria-hidden
            className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-1.5 pointer-events-none select-none opacity-70 group-hover:opacity-100 transition-opacity duration-150"
            style={{ background: "linear-gradient(to top, var(--surface-overlay), transparent)" }}
          >
            <span className="truncate text-[11px] font-semibold" style={{ color: s.fontColor }}>
              {box.title}
            </span>
            {rollupTotal > 0 && (
              <span
                className="flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ml-2"
                style={{ color: rollupPct === 100 ? "var(--accent)" : s.fontColor, opacity: rollupPct === 100 ? 0.9 : 0.55 }}
              >
                <CheckCircle2 size={10} />
                {rollupChecked}/{rollupTotal}
              </span>
            )}
          </div>
        ) : null}

        {/* Lock / recurring badges */}
        {(box.locked || box.recurrence) && !isFinished && (
          <div className="absolute top-2 left-2 z-20 pointer-events-none flex items-center gap-1">
            {box.locked && <Lock size={11} className="text-[var(--accent)] opacity-70" />}
            {box.recurrence && <RefreshCw size={11} className="text-[var(--accent)] opacity-70" />}
          </div>
        )}

        {/* Expand trigger pill — appears on hover. Opening is a use action, so it
            shows on finished/locked boards too (only editing is locked). */}
        {!box.isDeck && (
          <div
            aria-hidden
            className="absolute top-2 right-2 z-20 pointer-events-none opacity-0 group-hover:opacity-80 transition-opacity duration-150"
          >
            <div className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}>
              <Maximize2 size={9} />
              Open
            </div>
          </div>
        )}

        {/* Rollup badge moved to bottom bar — removed from top-right */}

        {/* Content */}
        {box.isDeck ? (
          <div className="relative z-10 flex-1 overflow-hidden">
            <DeckBox deck={box} boardId={boardId} />
          </div>
        ) : (
          <div className="relative z-10 flex-1 overflow-hidden">
            {summaryItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center pointer-events-none" style={{ padding: s.padding }}>
                {box.items.length === 0 ? (
                  !isFinished && (
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold opacity-40" style={{ background: "rgba(255,255,255,0.07)", color: s.fontColor }}>
                      <Plus size={12} />
                      Add items
                    </div>
                  )
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.07)", color: s.fontColor }}>
                    <LayoutGrid size={11} className="opacity-60" />
                    <span className="opacity-70">{box.items.length} item{box.items.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative w-full h-full">
                {summaryItems.map((item, idx) => (
                  <CollapsedItemCard
                    key={item.id}
                    item={item}
                    idx={idx}
                    boardId={boardId}
                    boxId={box.id}
                    boxW={displayW}
                    padding={s.padding}
                    isFinished={isFinished}
                    canEdit={canEdit}
                    zoom={zoom}
                  />
                ))}
                {box.items.length > summaryItems.length && (
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold opacity-65" style={{ background: "rgba(255,255,255,0.08)" }}>
                      +{box.items.length - summaryItems.length} more
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 8-directional resize handles — hidden for server members */}
        {!isFinished && !box.locked && canEdit && (<>
          <div onMouseDown={makeResizeHandler({ n: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0,    left:8,   right:8,  height:6,  cursor:"n-resize",  zIndex:15 }} className="group/edge-n">
            <div className="absolute top-0 left-2 right-2 h-px bg-[var(--accent)] opacity-0 group-hover/edge-n:opacity-50 transition-opacity" />
          </div>
          <div onMouseDown={makeResizeHandler({ s: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:8,   right:8,  height:6,  cursor:"s-resize",  zIndex:15 }} className="group/edge-s">
            <div className="absolute bottom-0 left-2 right-2 h-px bg-[var(--accent)] opacity-0 group-hover/edge-s:opacity-50 transition-opacity" />
          </div>
          <div onMouseDown={makeResizeHandler({ w: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:8,   left:0,   bottom:8, width:6,   cursor:"w-resize",  zIndex:15 }} className="group/edge-w">
            <div className="absolute left-0 top-2 bottom-2 w-px bg-[var(--accent)] opacity-0 group-hover/edge-w:opacity-50 transition-opacity" />
          </div>
          <div onMouseDown={makeResizeHandler({ e: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:8,   right:0,  bottom:8, width:6,   cursor:"e-resize",  zIndex:15 }} className="group/edge-e">
            <div className="absolute right-0 top-2 bottom-2 w-px bg-[var(--accent)] opacity-0 group-hover/edge-e:opacity-50 transition-opacity" />
          </div>
          <div onMouseDown={makeResizeHandler({ n:true, w:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0,    left:0,  width:10, height:10, cursor:"nw-resize", zIndex:16 }} />
          <div onMouseDown={makeResizeHandler({ n:true, e:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0,    right:0, width:10, height:10, cursor:"ne-resize", zIndex:16 }} />
          <div onMouseDown={makeResizeHandler({ s:true, w:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0,  width:10, height:10, cursor:"sw-resize", zIndex:16 }} />
          <div onMouseDown={makeResizeHandler({ s:true, e:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, right:0, width:16, height:16, cursor:"se-resize", zIndex:16 }} className="group/se">
            <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" style={{ position:"absolute", bottom:3, right:3, pointerEvents:"none" }} className="opacity-20 group-hover/se:opacity-65 transition-opacity">
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <circle cx="4.5" cy="8.5" r="1.5" fill="currentColor" />
              <circle cx="8.5" cy="4.5" r="1.5" fill="currentColor" />
            </svg>
          </div>
        </>)}
      </div>

      {/* Context menu — portaled to body so it's never clipped by canvas transform */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={canEdit ? blockMenuItems : readOnlyMenuItems}
          onClose={handleCtxMenuClose}
        />
      )}

      {recurrenceOpen && (
        <RecurrenceModal
          box={box}
          onApply={applyRecurrence}
          onEditTemplate={() => {
            // Swapping the template in/out is mode plumbing, not content edits — keep it out of undo
            suppressUndo(() => useBoardStore.getState().beginTemplateEdit(boardId, box.id));
            setExpandedBox(box.id);
          }}
          onClose={() => setRecurrenceOpen(false)}
        />
      )}

      {archiveOpen && (
        <BlockArchiveModal boardId={boardId} box={box} onRestore={restoreFromArchive} onClose={() => setArchiveOpen(false)} />
      )}

      {permModalOpen && (
        <BoxPermissionModal
          targetLabel={box.title || "Untitled"}
          initialPerms={box.perms}
          onSave={(perms) => {
            updateBox(boardId, box.id, { perms });
            broadcastOp({ op: "updateBox", boardId, boxId: box.id, patch: { perms } });
          }}
          onClose={() => setPermModalOpen(false)}
        />
      )}
    </>
  );
}
