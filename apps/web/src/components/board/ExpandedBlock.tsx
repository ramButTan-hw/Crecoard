"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PARA_STYLES, TextAnimationSection, ItemEntranceSection } from "@/components/items/ItemRenderer";
import { animClassFor } from "@/lib/animSpec";
import { applyImageUpload } from "@/lib/storage";
import {
  DndContext, DragEndEvent, MouseSensor, TouchSensor,
  useSensor, useSensors, useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  X, Pin, Grid3X3, Upload, AlignLeft, AlignCenter, AlignRight, Trash2,
  CopyPlus, ArrowUp, ArrowDown, RefreshCw, LayoutGrid, Minus, Plus,
  Lock, LockOpen, Eye, EyeOff, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useBoardStore, useActiveBoard, suppressUndo,
  BlockItem, Box, ItemType, BoxStyle, isContributableType,
} from "@/store/boardStore";
import { useCanEditBoard, useServerBoard, useServerBoardData, roleAllowed } from "@/contexts/ServerBoardContext";
import { ItemPermissionModal } from "./PermissionModal";
import { ContextMenu, ContextMenuEntry } from "@/components/ui/ContextMenu";
import { ItemRenderer, ListStylePanel, GraphStylePanel, EmbedStylePanel, TimerStylePanel, ApiStylePanel, CalendarStylePanel, TableStylePanel, PlaylistStylePanel, KanbanStylePanel, ChatStylePanel, ImageStylePanel, chatChannelsInUse } from "@/components/items/ItemRenderer";
import { SuggestionStylePanel, GuestbookStylePanel, PollStylePanel } from "@/components/items/CommunityItems";
import { FlashcardStylePanel, QuizStylePanel } from "@/components/items/StudyItems";
import { VisualizerStylePanel } from "@/components/items/VisualizerItem";
import { TwitchStylePanel } from "@/components/items/TwitchItem";
import { FontPicker } from "@/components/ui/FontPicker";
import { loadGoogleFont } from "@/lib/fonts";
import { ITEM_DEFINITIONS } from "./ItemPalette";
import { WallpaperEditor } from "@/components/ui/WallpaperEditor";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/boardConstants";

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const MIN_W = 180;
const MIN_H = 60;

const DEFAULT_SIZES: Record<ItemType, { w: number; h: number }> = {
  text:     { w: 320, h: 100 },
  list:     { w: 300, h: 200 },
  embed:    { w: 420, h: 260 },
  timer:    { w: 240, h: 110 },
  image:    { w: 320, h: 220 },
  graph:    { w: 420, h: 300 },
  api:      { w: 380, h: 240 },
  calendar: { w: 460, h: 380 },
  table:    { w: 520, h: 320 },
  widget:   { w: 480, h: 340 },
  playlist: { w: 420, h: 420 },
  kanban:   { w: 700, h: 460 },
  chat:     { w: 380, h: 440 },
  filebank:     { w: 360, h: 340 },
  suggestion:   { w: 340, h: 320 },
  guestbook:    { w: 340, h: 340 },
  poll:         { w: 340, h: 280 },
  "embed-card": { w: 320, h: 220 },
  "external":   { w: 300, h: 300 },
  twitch:       { w: 320, h: 300 },
  flashcard:    { w: 360, h: 300 },
  quiz:         { w: 380, h: 340 },
  visualizer:   { w: 420, h: 300 },
};

function getDefaultLayout(item: BlockItem, idx: number) {
  const sz = DEFAULT_SIZES[item.type] ?? { w: 280, h: 120 };
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  return {
    x: item.expandedX ?? snap(40 + col * (sz.w + 32)),
    y: item.expandedY ?? snap(40 + row * (sz.h + 32)),
    w: item.expandedW ?? sz.w,
    h: item.expandedH ?? sz.h,
  };
}

// ─── Resize handle ───────────────────────────────────────────────────────────

function ResizeHandle({ onPointerDown, isText, big }: { onPointerDown: (e: React.PointerEvent) => void; isText: boolean; big?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const size = big ? 28 : 18; // larger touch target on mobile
  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="touch-none"
      style={{
        position: "absolute", right: 0, bottom: 0, width: size, height: size,
        cursor: "se-resize", zIndex: 20, opacity: hovered || big ? 0.9 : 0.35,
        background: "linear-gradient(135deg, transparent 50%, var(--accent) 50%)",
        borderRadius: isText ? 0 : "0 0 10px 0",
        transition: "opacity 0.15s",
      }}
    />
  );
}

// ─── Draggable item card ──────────────────────────────────────────────────────

function ItemCard({
  item, boardId, boxId, vars, isFinished, layout,
  zoom, isFocused, anyFocused,
  onDelete, onTogglePin, isSelected, onSelect,
  onDuplicate, onMoveUp, onMoveDown, onResetLayout,
  onToggleFocus, onToggleSettingsLock,
}: {
  item: BlockItem;
  boardId: string;
  boxId: string;
  vars: Record<string, number>;
  isFinished: boolean;
  layout: { x: number; y: number; w: number; h: number };
  zoom: number;
  isFocused: boolean;
  anyFocused: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onResetLayout: () => void;
  onToggleFocus: () => void;
  onToggleSettingsLock: () => void;
}) {
  const { resizeExpandedItem, updateItem } = useBoardStore();
  const { serverId, viewerRole, viewerRoleIds } = useServerBoard();
  const isMobile = useIsMobile();
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number } | null>(null);
  const box = useBoardStore((s) =>
    s.boards.find((b) => b.id === boardId)?.boxes.find((bx) => bx.id === boxId) ??
    s.serverBoards[boardId]?.boxes.find((bx) => bx.id === boxId)
  );
  const [permModalOpen, setPermModalOpen] = useState(false);

  // Effective permissions: box-level interact gates all items, item-level perms further restrict
  const canInteract = !isFinished &&
    roleAllowed(viewerRole, viewerRoleIds, box?.perms?.interact) &&
    roleAllowed(viewerRole, viewerRoleIds, item.perms?.interact);
  const canInput = !isFinished &&
    roleAllowed(viewerRole, viewerRoleIds, box?.perms?.interact) &&
    roleAllowed(viewerRole, viewerRoleIds, item.perms?.input);
  const canContribute = !isFinished && (!!item.allowContributions || isContributableType(item.type)) &&
    roleAllowed(viewerRole, viewerRoleIds, box?.perms?.interact) &&
    roleAllowed(viewerRole, viewerRoleIds, item.perms?.contribute);

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: isFinished,
    data: { kind: "expanded-item" },
  });

  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const itemResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { return () => { itemResizeCleanupRef.current?.(); }; }, []);

  const onResizeMouseDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    resizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: layout.w, h: layout.h };
    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      const dx = (ev.clientX - resizeStart.current.x) / zoom;
      const dy = (ev.clientY - resizeStart.current.y) / zoom;
      setLiveSize({
        w: Math.max(MIN_W, snap(resizeStart.current.w + dx)),
        h: Math.max(MIN_H, snap(resizeStart.current.h + dy)),
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      itemResizeCleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      resizing.current = false;
      const dx = (ev.clientX - resizeStart.current.x) / zoom;
      const dy = (ev.clientY - resizeStart.current.y) / zoom;
      resizeExpandedItem(boardId, boxId, item.id,
        Math.max(MIN_W, snap(resizeStart.current.w + dx)),
        Math.max(MIN_H, snap(resizeStart.current.h + dy)),
      );
      setLiveSize(null);
      cleanup();
    };
    itemResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [boardId, boxId, item.id, layout.w, layout.h, resizeExpandedItem]);

  const displayW = liveSize?.w ?? layout.w;
  const displayH = liveSize?.h ?? layout.h;
  const transformStyle = transform ? CSS.Translate.toString(transform) : undefined;
  const scaledTransformStyle = transform ? CSS.Translate.toString({ x: transform.x / zoom, y: transform.y / zoom, scaleX: 1, scaleY: 1 }) : undefined;
  const isText = item.type === "text";
  const isList = item.type === "list";
  const isGraph = item.type === "graph";
  const isEmbed = item.type === "embed";
  const isTimer = item.type === "timer";
  const isTable = item.type === "table";
  const isCalendar = item.type === "calendar";
  const isChat = item.type === "chat";
  const isWidget = item.type === "widget";

  // Types that manage their own internal background — let canvas backgroundColor show through
  const isTransparent = isText || isList || isEmbed || isTimer || isTable || isCalendar || isChat || isWidget;

  const dimmed = anyFocused && !isFocused;

  // Standard item actions — passed to renderers that build their own menu, and
  // shown as a fallback card-level right-click menu for items that don't.
  const menuItems: ContextMenuEntry[] | undefined = !isFinished ? ([
    { label: isFocused ? "Unfocus" : "Focus", icon: isFocused ? <EyeOff size={14} /> : <Eye size={14} />, onClick: onToggleFocus },
    { label: item.settingsLocked ? "Unlock settings" : "Lock settings", icon: item.settingsLocked ? <LockOpen size={14} /> : <Lock size={14} />, onClick: onToggleSettingsLock },
    "separator" as const,
    { label: item.showInCollapsed ? "Unpin from summary" : "Pin to summary", icon: <Pin size={14} />, onClick: onTogglePin },
    "separator" as const,
    { label: "Duplicate", icon: <CopyPlus size={14} />, onClick: onDuplicate },
    { label: "Move up", icon: <ArrowUp size={14} />, onClick: onMoveUp },
    { label: "Move down", icon: <ArrowDown size={14} />, onClick: onMoveDown },
    "separator" as const,
    { label: "Reset size", icon: <RefreshCw size={14} />, onClick: () => { const sz = DEFAULT_SIZES[item.type] ?? { w: 280, h: 120 }; resizeExpandedItem(boardId, boxId, item.id, sz.w, sz.h); } },
    { label: "Reset position", icon: <LayoutGrid size={14} />, onClick: onResetLayout },
    "separator" as const,
    { label: "Delete item", icon: <Trash2 size={14} />, danger: true, onClick: onDelete },
    ...(serverId && viewerRole === "owner" ? [
      "separator" as const,
      { label: "Set permissions", icon: <ShieldCheck size={14} />, onClick: () => setPermModalOpen(true) },
    ] : []),
  ] as ContextMenuEntry[]) : undefined;

  return (
    <div
      ref={setDragRef}
      data-item-card
      className={cn("absolute group flex flex-col cursor-grab active:cursor-grabbing", isDragging && "opacity-40 z-50", !isDragging && animClassFor(item.itemEntrance, item.itemEntranceCustom))}
      style={{
        left: layout.x, top: layout.y,
        width: displayW, height: displayH,
        transform: scaledTransformStyle ?? transformStyle,
        zIndex: isDragging ? 50 : isFocused ? 10 : 1,
        background: isTransparent ? "transparent" : "var(--surface-raised)",
        borderRadius: isText ? 0 : isList ? (item.listBorderRadius ?? 0) : isTimer ? (item.timerBorderRadius ?? 0) : isTable ? (item.tableBorderRadius ?? 0) : isCalendar ? (item.calendarBorderRadius ?? 0) : 12,
        border: isTransparent
          ? isSelected ? "1.5px solid var(--accent)" : isFocused ? "1.5px solid var(--accent)" : "1.5px solid transparent"
          : isSelected ? "1.5px solid var(--accent)" : isFocused ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        overflow: isText ? "visible" : "hidden",
        transition: "border-color 0.15s, opacity 0.2s, box-shadow 0.2s",
        opacity: dimmed ? 0.2 : 1,
        pointerEvents: dimmed ? "none" : undefined,
        boxShadow: isFocused ? "0 0 0 2px var(--accent), 0 0 20px var(--accent)55" : undefined,
      }}
      onClick={() => onSelect()}
      onContextMenuCapture={(e) => {
        if (isFinished) return;
        e.preventDefault();
        onSelect();
      }}
      onContextMenu={(e) => {
        // Fallback menu for items whose renderer has none (image, community,
        // twitch, external, embed-card, chat, filebank). Renderers with their own
        // menu call stopPropagation, so this never fires for them.
        if (isFinished || !menuItems) return;
        e.preventDefault();
        setCardMenu({ x: e.clientX, y: e.clientY });
      }}
    >

      {/* Inline drag bar */}
      {!isFinished && (
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center justify-center w-full shrink-0 cursor-grab active:cursor-grabbing touch-none z-20 transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          style={{ height: isMobile ? 22 : 16, paddingTop: 2, paddingBottom: 2 }}
        >
          <div className={cn("rounded-full bg-[var(--text-muted)]", isMobile ? "h-[4px] w-14" : "h-[3px] w-10")} />
        </div>
      )}

      {/* Mobile: quick actions when selected (delete / duplicate) */}
      {!isFinished && isMobile && isSelected && (
        <div className="absolute top-1 right-1 z-30 flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Duplicate" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[var(--text-secondary)] shadow">
            <CopyPlus size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Status badges */}
      {!isFinished && !(isMobile && isSelected) && (
        <div className="absolute top-1 right-1 z-20 pointer-events-none flex items-center gap-1">
          {item.showInCollapsed && (
            <span title="Pinned to collapsed view" className="flex items-center gap-0.5 rounded-full bg-[var(--accent)]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] leading-none">
              <Pin size={8} />
            </span>
          )}
          {item.settingsLocked && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 leading-none">
              <Lock size={8} />
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div
        className={cn("relative flex-1 overflow-auto", (isList || isGraph || isEmbed || isTimer || isTable || isCalendar) ? "h-full" : "p-3")}
        style={{ zIndex: 1 }}
      >
        <ItemRenderer
          item={item} boardId={boardId} boxId={boxId} vars={vars}
          collapsed={false} isFinished={isFinished}
          containerW={displayW} containerH={displayH}
          canInteract={canInteract} canInput={canInput} canContribute={canContribute}
          extraContextItems={menuItems}
        />
        {permModalOpen && (
          <ItemPermissionModal
            targetLabel={item.type}
            itemType={item.type}
            initialPerms={item.perms}
            onSave={(perms) => updateItem(boardId, boxId, item.id, { perms })}
            onClose={() => setPermModalOpen(false)}
          />
        )}
      </div>

      {/* Resize handle */}
      {!isFinished && (
        <ResizeHandle onPointerDown={onResizeMouseDown} isText={isText} big={isMobile} />
      )}

      {/* Fallback right-click menu for renderer-less items */}
      {cardMenu && menuItems && (
        <ContextMenu x={cardMenu.x} y={cardMenu.y} items={menuItems} onClose={() => setCardMenu(null)} />
      )}
    </div>
  );
}

// ─── Main ExpandedBlock ───────────────────────────────────────────────────────

export function ExpandedBlock({ boxId }: { boxId: string }) {
  const {
    activeBoardId, setExpandedBox, removeItem, toggleItemInCollapsed, addItem,
    moveExpandedItem, updateBox, updateBoxStyle, updateBoxCollapsedStyle,
    moveItemUp, moveItemDown, duplicateItem, resetItemLayout,
    updateItem, focusItem,
  } = useBoardStore();
  const personalBoard = useActiveBoard();
  const serverBoard = useServerBoardData();
  const { boardId: serverBoardId, serverId } = useServerBoard();
  // Server-only item types (chat, filebank, community items) are hidden from
  // personal boards, matching the palette.
  const addableDefs = ITEM_DEFINITIONS.filter((d) => !d.serverOnly || serverId !== null);
  const board = serverBoardId ? serverBoard : personalBoard;
  const boardId = serverBoardId ?? activeBoardId;
  const box = board?.boxes.find((b) => b.id === boxId);
  const [showGrid, setShowGrid] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [rightTab, setRightTab] = useState<"items" | "collapsed" | "item" | "style">("items");
  const isMobile = useIsMobile();
  // Mobile: the editor panel is a bottom sheet instead of a side column.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  // Transform-based pan (like the main board) so the canvas floats freely instead
  // of being scroll-bound to the top-left.
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const wasPanningRef = useRef(false);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);
  const canEditBoard = useCanEditBoard();

  const vars = useMemo(() => {
    if (!box) return {} as Record<string, number>;
    return Object.fromEntries(
      box.items
        .filter(i => i.type === "api" && i.apiLabel && i.apiCachedValue !== undefined)
        .map(i => [i.apiLabel!, i.apiCachedValue!] as [string, number])
    );
  }, [box?.items]);

  useEffect(() => {
    setCanvasZoom(1);
  }, [boxId]);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;
    return () => { prevFocusRef.current?.focus(); };
  }, []);

  // Template-edit mode: leaving the editor by ANY path (X, backdrop, switching
  // blocks) commits the template — the forgiving default, matching how every
  // other edit in the app autosaves. Explicit discard is the banner's button.
  // The commit is deferred one tick: StrictMode's dev double-mount runs this
  // cleanup immediately on open, and committing then would clear the stash and
  // silently exit template mode. After the delay, expandedBoxId distinguishes a
  // real close from a StrictMode remount.
  useEffect(() => {
    return () => {
      window.setTimeout(() => {
        const st = useBoardStore.getState();
        if (st.expandedBoxId === boxId) return; // editor still open — not a real close
        const b = (st.boards.find((x) => x.id === boardId) ?? st.serverBoards[boardId])?.boxes.find((x) => x.id === boxId);
        if (b?.templateEditStash) suppressUndo(() => st.endTemplateEdit(boardId, boxId, true));
      }, 80);
    };
  }, [boardId, boxId]);

  if (!box) return null;

  const isLocked = board?.isFinished ?? false;
  // A locked/finished board is for USE, not editing — so the editor side panel
  // (gated on canEdit) hides, while items inside stay interactive (isFinished).
  const canEdit = canEditBoard && !isLocked;
  const isFinished = isLocked || !canEdit;
  const summaryItems = box.items.filter((i) => i.showInCollapsed);
  const anyFocused = box.items.some((i) => i.isFocused);

  const allListEntries = box.items.filter(i => i.type === "list").flatMap(i => i.listItems ?? []);
  const rollupTotal = allListEntries.length;
  const rollupChecked = allListEntries.filter(e => e.checked).length;
  const rollupPct = rollupTotal > 0 ? (rollupChecked / rollupTotal) * 100 : 0;
  const selectedItem = selectedItemId ? box.items.find((i) => i.id === selectedItemId) : null;

  const close = () => setExpandedBox(null);

  const handleCanvasPanMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.target !== canvasRef.current) return;

    panStart.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    setPanning(true);

    const onMove = (ev: MouseEvent) => {
      setPanOffset({
        x: panStart.current.panX + (ev.clientX - panStart.current.x),
        y: panStart.current.panY + (ev.clientY - panStart.current.y),
      });
      wasPanningRef.current = true;
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Single-finger touch pan (overflow-hidden killed native touch-scroll).
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.target !== canvasRef.current || e.touches.length !== 1) return;
    const t0 = e.touches[0];
    panStart.current = { x: t0.clientX, y: t0.clientY, panX: panOffset.x, panY: panOffset.y };
    setPanning(true);
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      setPanOffset({
        x: panStart.current.panX + (t.clientX - panStart.current.x),
        y: panStart.current.panY + (t.clientY - panStart.current.y),
      });
      wasPanningRef.current = true;
    };
    const onEnd = () => {
      setPanning(false);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  };

  // Zoom toward the viewport center so the board doesn't drift to a corner.
  const zoomTo = useCallback((next: number) => {
    const z1 = Math.max(0.5, Math.min(2, Math.round(next * 4) / 4));
    const z0 = canvasZoom;
    if (z0 === z1) return;
    const el = canvasScrollRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      setPanOffset((p) => ({ x: cx - (cx - p.x) * (z1 / z0), y: cy - (cy - p.y) * (z1 / z0) }));
    }
    setCanvasZoom(z1);
  }, [canvasZoom]);

  // Ctrl/Cmd + wheel → zoom toward the cursor (parity with the main board).
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const z0 = canvasZoom;
      const z1 = Math.max(0.5, Math.min(2, parseFloat((z0 + (e.deltaY > 0 ? -0.1 : 0.1)).toFixed(2))));
      if (z1 === z0) return;
      const ratio = z1 / z0;
      setPanOffset((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }));
      setCanvasZoom(z1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canvasZoom]);

  const handleDragEnd = (e: DragEndEvent) => {
    if (e.active.data.current?.kind !== "expanded-item") return;
    const itemId = e.active.id as string;
    const item = box.items.find((i) => i.id === itemId);
    if (!item || !e.delta) return;
    const layout = getDefaultLayout(item, box.items.indexOf(item));
    moveExpandedItem(boardId, boxId, itemId,
      Math.max(0, snap(layout.x + e.delta.x / canvasZoom)),
      Math.max(0, snap(layout.y + e.delta.y / canvasZoom))
    );
  };

  const handleItemSelect = (itemId: string) => {
    setSelectedItemId((prev) => {
      if (prev === itemId) { setRightTab("items"); return null; }
      setRightTab("item");
      return itemId;
    });
    // Settings are opened explicitly via the Editor button, not on select — so
    // tapping/dragging an item to move or resize it doesn't pop the sheet.
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) close(); }}
    >
      <div
        className="flex h-[92dvh] w-[92vw] max-w-[1400px] overflow-hidden rounded-2xl shadow-2xl max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:rounded-none"
        style={{
          border: box.style.borderStyle === "glow"
            ? "none"
            : `${box.style.borderWidth}px ${box.style.borderStyle} ${box.style.borderColor}`,
          boxShadow: box.style.borderStyle === "glow"
            ? `0 0 ${box.style.borderWidth * 8}px ${box.style.borderColor}`
            : undefined,
          background: "var(--surface)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left: canvas ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div
            className="flex h-14 flex-shrink-0 items-center gap-3 border-b px-5"
            style={{ background: "var(--surface-raised)", borderColor: box.style.borderColor }}
          >
            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: box.style.borderColor }} />
            <input
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Block title…"
              value={box.title}
              readOnly={isFinished}
              onChange={(e) => updateBox(boardId, boxId, { title: e.target.value })}
            />
            {rollupTotal > 0 ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: rollupPct === 100 ? "var(--accent)" : "var(--text-muted)" }}>
                  {rollupChecked}/{rollupTotal}
                </span>
                <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${rollupPct}%`, background: rollupPct === 100 ? "var(--accent)" : "var(--accent)", opacity: rollupPct === 100 ? 1 : 0.6 }}
                  />
                </div>
              </div>
            ) : (
              <span className="hidden text-xs text-[var(--text-muted)] sm:inline">{box.items.length} items · {summaryItems.length} in summary</span>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] p-0.5">
              <button
                onClick={() => zoomTo(canvasZoom - 0.25)}
                className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                title="Zoom out"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => { setCanvasZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                className="min-w-[3.5rem] rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                title="Reset view"
              >
                {Math.round(canvasZoom * 100)}%
              </button>
              <button
                onClick={() => zoomTo(canvasZoom + 0.25)}
                className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                title="Zoom in"
              >
                <Plus size={14} />
              </button>
            </div>
            <button
              onClick={() => setShowGrid((v) => !v)}
              className={cn("hidden rounded p-1.5 transition-colors sm:block", showGrid ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
              title="Toggle grid"
            >
              <Grid3X3 size={15} />
            </button>
            {canEdit && (
              <button onClick={() => setMobilePanelOpen(true)} title="Editor" className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors md:hidden">
                <SlidersHorizontal size={17} />
              </button>
            )}
            <button onClick={close} className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Template-edit banner — box.items currently hold the recurrence template */}
          {box.templateEditStash && (
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--accent)]/40 bg-[var(--accent)]/10 px-5 py-2">
              <RefreshCw size={13} className="shrink-0 text-[var(--accent)]" />
              <p className="min-w-0 flex-1 text-[12px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent)]">Editing template</span>
                {" — this is what the block resets to each "}
                {box.recurrence ? { daily: "day", weekly: "week", monthly: "month" }[box.recurrence.freq] : "period"}
                {", not its current contents. Closing saves the template."}
              </p>
              <button
                onClick={() => { suppressUndo(() => useBoardStore.getState().endTemplateEdit(boardId, boxId, false)); close(); }}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
              >
                Discard changes
              </button>
              <button
                onClick={() => { suppressUndo(() => useBoardStore.getState().endTemplateEdit(boardId, boxId, true)); close(); }}
                className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Save template
              </button>
            </div>
          )}

          {/* Canvas */}
          <div
            ref={canvasScrollRef}
            className="flex-1 overflow-hidden relative"
            onMouseDown={handleCanvasPanMouseDown}
            onTouchStart={handleCanvasTouchStart}
            style={{ cursor: panning ? "grabbing" : undefined, touchAction: "none" }}
          >
              <DndContext id="dnd-expanded-block" sensors={sensors} onDragEnd={handleDragEnd}>
                <div
                  ref={canvasRef}
                  className={cn("absolute", showGrid && "board-grid")}
                  style={{
                    left: 0,
                    top: 0,
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${canvasZoom})`,
                    transformOrigin: "0 0",
                    backgroundColor: box.style.backgroundColor,
                    zIndex: 1,
                    cursor: panning ? "grabbing" : "grab",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if ((e.target as HTMLElement).closest("[data-item-card]")) return;
                    if (wasPanningRef.current) { wasPanningRef.current = false; return; }
                    setSelectedItemId(null);
                    if (rightTab === "item") setRightTab("items");
                  }}
                  onContextMenu={(e) => {
                    if ((e.target as HTMLElement).closest("[data-item-card]")) return;
                    if (isFinished) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedItemId(null);
                    setCanvasCtxMenu({ x: e.clientX, y: e.clientY });
                  }}
                >
                {(box.style.wallpaperUrl || box.collapsedStyle?.wallpaperUrl) && (() => {
                  const wpSrc = box.style.wallpaperUrl ? box.style : (box.collapsedStyle ?? {});
                  const wpUrl = box.style.wallpaperUrl || box.collapsedStyle?.wallpaperUrl;
                  return (
                    <div aria-hidden style={{
                      position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
                      backgroundImage: `url(${wpUrl})`,
                      backgroundSize: wpSrc.wallpaperSize ?? "cover",
                      backgroundPosition: wpSrc.wallpaperPosition ?? "center",
                      backgroundRepeat: "no-repeat",
                      opacity: wpSrc.wallpaperOpacity ?? 1,
                    }} />
                  );
                })()}

                {box.items.map((item, idx) => {
                  const layout = getDefaultLayout(item, idx);
                  return (
                    <ItemCard
                      key={item.id}
                      item={item}
                      boardId={boardId}
                      boxId={boxId}
                      vars={vars}
                      isFinished={isFinished}
                      layout={layout}
                      zoom={canvasZoom}
                      isFocused={item.isFocused ?? false}
                      anyFocused={anyFocused}
                      onDelete={() => {
                        removeItem(boardId, boxId, item.id);
                        if (selectedItemId === item.id) {
                          const remaining = box.items.filter((i) => i.id !== item.id);
                          setSelectedItemId(remaining[0]?.id ?? null);
                        }
                      }}
                      onTogglePin={() => toggleItemInCollapsed(boardId, boxId, item.id)}
                      isSelected={selectedItemId === item.id}
                      onSelect={() => handleItemSelect(item.id)}
                      onDuplicate={() => duplicateItem(boardId, boxId, item.id)}
                      onMoveUp={() => moveItemUp(boardId, boxId, item.id)}
                      onMoveDown={() => moveItemDown(boardId, boxId, item.id)}
                      onResetLayout={() => resetItemLayout(boardId, boxId, item.id)}
                      onToggleFocus={() => focusItem(boardId, boxId, item.isFocused ? null : item.id)}
                      onToggleSettingsLock={() => updateItem(boardId, boxId, item.id, { settingsLocked: !item.settingsLocked })}
                    />
                  );
                })}

                {box.items.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center pointer-events-none">
                    <p className="text-base font-medium text-[var(--text-secondary)]">This block is empty</p>
                    <p className="text-sm text-[var(--text-muted)]">Right-click to add items, or use the panel →</p>
                  </div>
                )}
                </div>
              </DndContext>

            {canvasCtxMenu && !isFinished && (
              <ContextMenu
                x={canvasCtxMenu.x}
                y={canvasCtxMenu.y}
                onClose={() => setCanvasCtxMenu(null)}
                items={[
                  ...addableDefs.map((def) => ({
                    label: `Add ${def.label}`,
                    icon: def.icon as React.ReactNode,
                    onClick: () => addItem(boardId, boxId, { ...def.defaultItem(), showInCollapsed: false }),
                  })),
                  "separator" as const,
                  {
                    label: showGrid ? "Hide grid" : "Show grid",
                    icon: <Grid3X3 size={14} />,
                    onClick: () => setShowGrid((v) => !v),
                  },
                ]}
              />
            )}
          </div>
        </div>

        {/* ── Right panel — editors only. Desktop: side column. Mobile: bottom
              sheet (opened by selecting an item or the header Editor button). ── */}
        {canEdit && (
        <>
        {isMobile && mobilePanelOpen && (
          <div className="fixed inset-0 z-[59] bg-black/50" onClick={() => setMobilePanelOpen(false)} />
        )}
        <div
          className={cn(
            "flex-col",
            isMobile
              ? cn(
                  "fixed inset-x-0 bottom-0 z-[60] flex max-h-[82dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-[var(--border)] pb-safe transition-transform duration-200",
                  mobilePanelOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
                )
              : "hidden md:flex w-[280px] flex-shrink-0 border-l border-[var(--border)]"
          )}
          style={{ background: "var(--surface-raised)" }}
        >
          {isMobile && (
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Editor</span>
              <button onClick={() => setMobilePanelOpen(false)} className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"><X size={18} /></button>
            </div>
          )}
          {/* Tabs */}
          <div className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-3 pt-3 pb-2">
            <div className="flex gap-0.5 rounded-lg bg-[var(--surface-overlay)] p-0.5 w-full">
              {([
                { id: "items", label: "Items" },
                { id: "collapsed", label: "Collapsed" },
                ...(selectedItem && !["chat","filebank"].includes(selectedItem.type) ? [{ id: "item", label: (() => { switch (selectedItem.type) { case "list": return "List"; case "text": return "Text"; case "graph": return "Chart"; case "timer": return "Timer"; case "api": return "API"; case "calendar": return "Calendar"; case "table": return "Table"; case "image": return "Image"; case "embed": return "Embed"; case "widget": return "Widget"; case "kanban": return "Kanban"; case "playlist": return "Playlist"; default: return "Item"; } })() }] : []),
                { id: "style", label: "Style" },
              ] as { id: string; label: string }[]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setRightTab(t.id as "items" | "collapsed" | "item" | "style")}
                  className={cn(
                    "flex-1 rounded-md py-1 text-[11px] font-medium transition-colors",
                    rightTab === t.id
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Items tab ── */}
          {rightTab === "items" && (
            <>
              <div className="border-b border-[var(--border)] p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Summary preview</p>
                {(() => {
                  const previewW = 228;
                  const scale = Math.min(1, previewW / Math.max(box.width, 1));
                  const scaledH = Math.min(170, Math.round(box.height * scale));
                  const pad = box.style.padding ?? 14;
                  return (
                    <div
                      className="rounded-xl border overflow-hidden relative"
                      style={{ width: previewW, height: scaledH, borderColor: box.style.borderColor, backgroundColor: box.style.backgroundColor }}
                    >
                      {box.style.wallpaperUrl && (
                        <div aria-hidden style={{
                          position: "absolute", inset: 0, pointerEvents: "none",
                          backgroundImage: `url(${box.style.wallpaperUrl})`,
                          backgroundSize: box.style.wallpaperSize ?? "cover",
                          backgroundPosition: box.style.wallpaperPosition ?? "center",
                          opacity: box.style.wallpaperOpacity ?? 1,
                        }} />
                      )}
                      {summaryItems.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <p className="text-[11px] opacity-50 italic text-center px-3">Pin items using the <Pin size={9} className="inline" /> button</p>
                        </div>
                      ) : (
                        <div style={{ width: box.width, height: box.height, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
                          {summaryItems.map((item, idx) => {
                            const defaultW = Math.max(80, box.width - pad * 2 - 8);
                            const iW = item.collapsedW ?? defaultW;
                            const iH = item.collapsedH ?? 40;
                            return (
                              <div key={item.id} style={{ position: "absolute", left: item.collapsedX ?? pad, top: item.collapsedY ?? (pad + idx * 46), width: iW, height: iH, overflow: "hidden" }}>
                                <ItemRenderer item={item} boardId={boardId} boxId={boxId} vars={vars} collapsed isFinished={isFinished} containerW={iW} containerH={iH} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">{summaryItems.length} pinned · {box.items.length - summaryItems.length} expanded-only</p>
              </div>

              {!isFinished && canEdit && (
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Add item</p>
                  <div className="flex flex-col gap-0.5">
                    {addableDefs.map((def) => (
                      <button
                        key={def.type}
                        onClick={() => addItem(boardId, boxId, { ...def.defaultItem(), showInCollapsed: false })}
                        title={def.description}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <span className="flex-shrink-0 text-[var(--text-muted)]">{def.icon}</span>
                        <span className="text-sm leading-tight">{def.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Collapsed layout tab ── */}
          {rightTab === "collapsed" && (
            <div className="flex-1 overflow-y-auto">
              <CollapsedLayoutEditor box={box} boardId={boardId} boxId={boxId} />
            </div>
          )}

          {/* ── Item Style tab ── */}
          {rightTab === "item" && selectedItem && (
            <div className="flex-1 overflow-y-auto relative">
              {selectedItem.type === "list" && (
                <ListStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "text" && (
                <TextStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "graph" && (
                <GraphStylePanel
                  item={selectedItem}
                  boardId={boardId}
                  boxId={boxId}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "embed" && (
                <EmbedStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "timer" && (
                <TimerStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "api" && (
                <ApiStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "calendar" && (
                <CalendarStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                  boardId={boardId}
                  boxId={boxId}
                />
              )}
              {selectedItem.type === "table" && (
                <TableStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                  boardId={boardId}
                  boxId={boxId}
                />
              )}
              {selectedItem.type === "playlist" && (
                <PlaylistStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "kanban" && (
                <KanbanStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "chat" && (
                <ChatStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                  usedChannels={chatChannelsInUse(
                    useBoardStore.getState().boards.find((b) => b.id === boardId) ?? useBoardStore.getState().serverBoards[boardId],
                    selectedItem.id,
                  )}
                />
              )}
              {selectedItem.type === "suggestion" && (
                <SuggestionStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "guestbook" && (
                <GuestbookStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "poll" && (
                <PollStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "flashcard" && (
                <FlashcardStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "quiz" && (
                <QuizStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "visualizer" && (
                <VisualizerStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "twitch" && (
                <TwitchStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {selectedItem.type === "image" && (
                <ImageStylePanel
                  item={selectedItem}
                  upd={(patch) => useBoardStore.getState().updateItem(boardId, boxId, selectedItem.id, patch)}
                />
              )}
              {!["list","text","graph","embed","timer","api","calendar","table","playlist","kanban","image"].includes(selectedItem.type) && (
                <div className="p-4 text-xs text-[var(--text-muted)]">No style options for this item type.</div>
              )}
              {selectedItem.settingsLocked && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]" style={{ background: "var(--surface-raised)/80" }}>
                  <Lock size={28} className="text-amber-400" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Settings locked</p>
                  <p className="text-xs text-[var(--text-muted)] text-center px-6">Right-click the item and choose "Unlock settings" to make changes.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Block Style tab ── */}
          {rightTab === "style" && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              {/* Expanded style */}
              <section>
                <SLabel>Expanded (open) style</SLabel>
              </section>
              <BlockStyleEditor
                boxId={boxId}
                boardId={boardId}
                style={box.style}
                onUpdate={(patch) => updateBoxStyle(boardId, boxId, patch)}
              />

              {/* Collapsed style — independent overrides for the canvas card */}
              <div className="border-t border-[var(--border)] pt-4">
                <SLabel>Collapsed (canvas card) style</SLabel>
                <p className="text-[11px] text-[var(--text-muted)] mb-4 -mt-1">
                  Overrides style when the block sits on the board. Leave any field at default to inherit from the expanded style above.
                </p>
                <BlockStyleEditor
                  boxId={boxId}
                  boardId={boardId}
                  style={{ ...box.style, ...(box.collapsedStyle ?? {}) }}
                  onUpdate={(patch) => updateBoxCollapsedStyle(boardId, boxId, patch)}
                />
                {box.collapsedStyle && Object.keys(box.collapsedStyle).length > 0 && (
                  <button
                    onClick={() => updateBox(boardId, boxId, { collapsedStyle: undefined })}
                    className="mt-3 text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  >
                    Reset collapsed style (inherit all from expanded)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// ─── CollapsedLayoutEditor ────────────────────────────────────────────────────

function CollapsedPreviewChip({
  item, x, y, w, h, scale, onMoveEnd, onResizeEnd,
}: {
  item: BlockItem;
  x: number; y: number; w: number; h: number;
  scale: number;
  onMoveEnd: (x: number, y: number) => void;
  onResizeEnd: (w: number, h: number) => void;
}) {
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const def = ITEM_DEFINITIONS.find(d => d.type === item.type);

  const displayX = (livePos?.x ?? x) * scale;
  const displayY = (livePos?.y ?? y) * scale;
  const displayW = (liveSize?.w ?? w) * scale;
  const displayH = (liveSize?.h ?? h) * scale;

  const handleDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setLivePos({ x: Math.max(0, x + dx), y: Math.max(0, y + dy) });
    };
    const onUp = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onMoveEnd(Math.max(0, Math.round(x + dx)), Math.max(0, Math.round(y + dy)));
      setLivePos(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      setLiveSize({ w: Math.max(40, w + dx), h: Math.max(16, h + dy) });
    };
    const onUp = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onResizeEnd(Math.max(40, Math.round(w + dx)), Math.max(16, Math.round(h + dy)));
      setLiveSize(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="absolute group/chip select-none"
      style={{
        left: displayX, top: displayY,
        width: Math.max(12, displayW), height: Math.max(8, displayH),
        background: "var(--surface-overlay)",
        border: "1.5px solid var(--accent)",
        borderRadius: 4,
        cursor: "move",
        zIndex: 1,
        overflow: "hidden",
      }}
      onPointerDown={handleDragStart}
    >
      <div className="flex items-center gap-1 px-1 h-full pointer-events-none">
        {def?.icon && <span style={{ fontSize: Math.max(8, displayH * 0.4), flexShrink: 0 }}>{def.icon}</span>}
        <span className="text-[var(--text-secondary)] truncate" style={{ fontSize: Math.max(7, displayH * 0.32) }}>{item.type}</span>
      </div>
      <div
        className="absolute bottom-0 right-0 opacity-0 group-hover/chip:opacity-70 transition-opacity"
        style={{
          width: Math.max(8, Math.min(14, displayH)),
          height: Math.max(8, Math.min(14, displayH)),
          cursor: "se-resize",
          background: "linear-gradient(135deg, transparent 50%, var(--accent) 50%)",
          borderRadius: "0 0 3px 0",
        }}
        onPointerDown={handleResizeStart}
      />
    </div>
  );
}

function CollapsedLayoutEditor({ box, boardId, boxId }: { box: Box; boardId: string; boxId: string }) {
  const { moveCollapsedItem, resizeCollapsedItem, toggleItemInCollapsed } = useBoardStore();
  const summaryItems = box.items.filter(i => i.showInCollapsed);
  const padding = box.style.padding ?? 14;

  const PREVIEW_MAX_W = 236;
  const scale = Math.min(1, PREVIEW_MAX_W / Math.max(box.width, 1));
  const previewW = Math.round(box.width * scale);
  const previewH = Math.min(180, Math.round(box.height * scale));

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <div>
        <SLabel>Collapsed preview</SLabel>
        <p className="text-[11px] text-[var(--text-muted)] mb-2">Drag chips to reposition · grab corner to resize</p>
        <div
          className="relative overflow-hidden rounded-xl border border-[var(--border)] mx-auto"
          style={{ width: previewW, height: previewH, background: box.style.backgroundColor, flexShrink: 0 }}
        >
          {box.style.wallpaperUrl && (
            <div aria-hidden style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: `url(${box.style.wallpaperUrl})`,
              backgroundSize: box.style.wallpaperSize ?? "cover",
              backgroundPosition: box.style.wallpaperPosition ?? "center",
              opacity: box.style.wallpaperOpacity ?? 1,
            }} />
          )}
          {summaryItems.map((item, idx) => {
            const defaultW = Math.max(80, box.width - padding * 2 - 8);
            return (
              <CollapsedPreviewChip
                key={item.id}
                item={item}
                x={item.collapsedX ?? padding}
                y={item.collapsedY ?? (padding + idx * 46)}
                w={item.collapsedW ?? defaultW}
                h={item.collapsedH ?? 40}
                scale={scale}
                onMoveEnd={(nx, ny) => moveCollapsedItem(boardId, boxId, item.id, nx, ny)}
                onResizeEnd={(nw, nh) => resizeCollapsedItem(boardId, boxId, item.id, nw, nh)}
              />
            );
          })}
          {summaryItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] text-[var(--text-muted)] text-center px-3">Pin items below to see them here</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <SLabel>Pinned items</SLabel>
        <div className="flex flex-col gap-0.5">
          {box.items.map((item, idx) => {
            const def = ITEM_DEFINITIONS.find(d => d.type === item.type);
            const isPinned = item.showInCollapsed;
            const defaultW = Math.max(80, box.width - padding * 2 - 8);
            return (
              <div key={item.id} className="flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-[var(--surface-overlay)] group/pinrow">
                <button
                  onClick={() => toggleItemInCollapsed(boardId, boxId, item.id)}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border flex-shrink-0 transition-colors",
                    isPinned
                      ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/60"
                  )}
                  title={isPinned ? "Unpin" : "Pin to collapsed view"}
                >
                  <Pin size={9} />
                </button>
                <span className="text-[var(--text-muted)] flex-shrink-0">{def?.icon}</span>
                <span className="text-[11px] text-[var(--text-secondary)] flex-1 truncate capitalize">{item.type}</span>
                {isPinned && (
                  <button
                    onClick={() => {
                      moveCollapsedItem(boardId, boxId, item.id, padding, padding + idx * 46);
                      resizeCollapsedItem(boardId, boxId, item.id, defaultW, 40);
                    }}
                    className="opacity-0 group-hover/pinrow:opacity-100 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-opacity flex-shrink-0"
                    title="Reset position"
                  >
                    ↺
                  </button>
                )}
              </div>
            );
          })}
          {box.items.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] text-center py-2">No items in this block yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TextStylePanel ───────────────────────────────────────────────────────────

const TEXT_BORDER_STYLES = ["solid","dashed","dotted","double","glow","none"] as const;

export function TextStylePanel({ item, upd, hideCollapsed }: { item: BlockItem; upd: (p: Partial<BlockItem>) => void; hideCollapsed?: boolean }) {
  const [openPicker, setOpenPicker] = useState<"text" | "bg" | "border" | "shadow" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasBorder = (item.textBorderWidth ?? 0) > 0;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => upd({ textBgImage: url }));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-0 text-xs">

      {/* Mode */}
      <div className="px-4 pt-4 pb-0">
        <SLabel>Mode</SLabel>
        <div className="flex gap-1 mb-3">
          {([
            { id: undefined,   label: "Text" },
            { id: "number",    label: "Number" },
          ] as { id: "number" | undefined; label: string }[]).map((m) => (
            <button key={m.label}
              onClick={() => upd({ textMode: m.id })}
              className={cn("flex-1 rounded py-1.5 text-[11px] font-medium transition-colors",
                item.textMode === m.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >{m.label}</button>
          ))}
        </div>
      </div>

      <Divider_ />

      <TextAnimationSection item={item} upd={upd} />

      <div className="px-4 pb-1">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={!!item.textBackdrop} onChange={(e) => upd({ textBackdrop: e.target.checked || undefined })} className="accent-[var(--accent)]" />
          Readable backdrop
        </label>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">Dark panel behind the text — for busy wallpapers.</p>
      </div>

      <Divider_ />

      {/* Background */}
      <div className="px-4 py-4">
        <SLabel>Background</SLabel>
        <ColorRow label="Fill" color={item.textBgColor ?? ""} open={openPicker === "bg"} onToggle={() => setOpenPicker((v) => v === "bg" ? null : "bg")} onChange={(c) => upd({ textBgColor: c })} allowClear onClear={() => upd({ textBgColor: "" })} />
        <div className="mt-3">
          <input
            className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Background image URL…"
            value={item.textBgImage?.startsWith("data:") ? "" : (item.textBgImage ?? "")}
            onChange={(e) => upd({ textBgImage: e.target.value || "" })}
          />
          <div className="flex gap-1.5">
            <button onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              <Upload size={11} /> Upload image
            </button>
            {item.textBgImage && <button onClick={() => upd({ textBgImage: "" })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      <Divider_ />

      {/* Shape */}
      <div className="px-4 py-4">
        <SLabel>Shape &amp; Spacing</SLabel>
        <SliderRow label="Corners" value={item.textBorderRadius ?? 0} min={0} max={120} onChange={(v) => upd({ textBorderRadius: v })} />
        <SliderRow label="Padding" value={item.textPadding ?? 10} min={0} max={80} onChange={(v) => upd({ textPadding: v })} />
        <SliderRow label="Line ht." value={item.textLineHeight ?? 1.5} min={0.8} max={4} step={0.1} onChange={(v) => upd({ textLineHeight: v })} decimals={1} />
        <SliderRow label="Tracking" value={item.textLetterSpacing ?? 0} min={-5} max={30} step={0.5} onChange={(v) => upd({ textLetterSpacing: v })} />
      </div>

      <Divider_ />

      {/* Shadow */}
      <div className="px-4 py-4">
        <SLabel>Shadow</SLabel>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {(["none","drop","hard","glow","neon"] as const).map((s) => (
            <button key={s} onClick={() => upd({ textShadow: s })}
              className={cn("rounded border py-1.5 text-[11px] capitalize transition-colors",
                (item.textShadow ?? "none") === s ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
              )}>{s}</button>
          ))}
        </div>
        {item.textShadow && item.textShadow !== "none" && (
          <ColorRow label="Color" color={item.textShadowColor ?? "#000000"} open={openPicker === "shadow"} onToggle={() => setOpenPicker((v) => v === "shadow" ? null : "shadow")} onChange={(c) => upd({ textShadowColor: c })} />
        )}
      </div>

      <Divider_ />

      {/* Border */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <SLabel>Border</SLabel>
          <button onClick={() => upd({ textBorderWidth: hasBorder ? 0 : 1, textBorderColor: item.textBorderColor ?? "#ffffff", textBorderStyle: "solid" })}
            className={cn("rounded px-2.5 py-0.5 text-[11px] transition-colors border", hasBorder ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>
            {hasBorder ? "On" : "Off"}
          </button>
        </div>
        {hasBorder && (
          <>
            <ColorRow label="Color" color={item.textBorderColor ?? "#ffffff"} open={openPicker === "border"} onToggle={() => setOpenPicker((v) => v === "border" ? null : "border")} onChange={(c) => upd({ textBorderColor: c })} />
            <div className="flex items-center gap-2 mt-2 mb-2">
              <span className="text-[11px] text-[var(--text-muted)] w-14 flex-shrink-0">Width</span>
              <input type="number" min={1} max={24} value={item.textBorderWidth ?? 1} onChange={(e) => upd({ textBorderWidth: Number(e.target.value) })} className="w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs outline-none text-[var(--text-primary)]" />
              <span className="text-[11px] text-[var(--text-muted)]">px</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {TEXT_BORDER_STYLES.map((s) => (
                <button key={s} onClick={() => upd({ textBorderStyle: s as BlockItem["textBorderStyle"] })}
                  className={cn("rounded border py-1.5 text-[11px] capitalize transition-colors",
                    item.textBorderStyle === s ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                  )}>{s}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Collapsed / pinned card font override */}
      {!hideCollapsed && <>
        <Divider_ />
        <div className="px-4 py-4">
          <SLabel>Card view font</SLabel>
          <p className="text-[11px] text-[var(--text-muted)] mb-3 -mt-1">
            Overrides font when this item is pinned as a collapsed card. Leave blank to inherit.
          </p>
          <div className="mb-2">
            <FontPicker
              value={item.collapsedFontFamily ?? ""}
              onChange={(f) => { if (f) loadGoogleFont(f); upd({ collapsedFontFamily: f || undefined }); }}
            />
          </div>
          <div className="flex gap-2 mb-2 items-center">
            <input
              type="number" min={6} max={400}
              placeholder={String(item.fontSize ?? 16)}
              value={item.collapsedFontSize ?? ""}
              onChange={(e) => upd({ collapsedFontSize: e.target.value ? Number(e.target.value) : undefined })}
              className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
            />
            <span className="text-[11px] text-[var(--text-muted)]">px</span>
          </div>
          <div className="flex gap-1.5 mb-2">
            {([
              { field: "collapsedBold" as const,   label: "B",  cls: "font-bold",   active: item.collapsedBold },
              { field: "collapsedItalic" as const,  label: "I",  cls: "italic",      active: item.collapsedItalic },
            ]).map(({ field, label, cls, active }) => (
              <button key={field}
                onClick={() => upd({ [field]: active === undefined ? true : active ? false : undefined })}
                className={cn(`flex-1 rounded border py-1 text-xs transition-colors ${cls}`,
                  active === true
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : active === false
                      ? "border-red-400/50 bg-red-400/5 text-red-400"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                )}
                title={active === undefined ? "Inherit" : active ? "Forced on" : "Forced off"}
              >{label} {active === undefined ? "" : active ? "✓" : "✗"}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="relative h-5 w-5 rounded border border-[var(--border)] overflow-hidden cursor-pointer flex-shrink-0">
              <span className="absolute inset-0 rounded" style={{ background: item.collapsedFontColor ?? "transparent" }} />
              <input type="color"
                value={item.collapsedFontColor ?? (item.textColor ?? "#f2f2f2")}
                onChange={(e) => upd({ collapsedFontColor: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
            <span className="text-[11px] text-[var(--text-muted)] flex-1">Color</span>
            {item.collapsedFontColor && (
              <button onClick={() => upd({ collapsedFontColor: undefined })} className="text-[11px] text-[var(--text-muted)] hover:text-red-400 transition-colors">reset</button>
            )}
          </div>
        </div>
      </>}
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Divider_() {
  return <div className="h-px bg-[var(--border)] mx-0" />;
}

function SliderRow({ label, value, min, max, step = 1, decimals = 0, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; decimals?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-12 flex-shrink-0 text-[11px] text-[var(--text-muted)]">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--accent)] h-1"
      />
      <span className="w-8 text-right text-[11px] text-[var(--text-muted)] flex-shrink-0">{value.toFixed(decimals)}</span>
    </div>
  );
}

// ─── Shared ColorRow helper ───────────────────────────────────────────────────

function ColorRow({ label, color, open, onToggle, onChange, allowClear, onClear }: {
  label: string; color: string; open: boolean;
  onToggle: () => void; onChange: (c: string) => void;
  allowClear?: boolean; onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-shrink-0">
        <button onClick={onToggle} className="h-7 w-9 rounded border border-[var(--border)]"
          style={{ backgroundColor: color || "transparent", backgroundImage: !color ? "repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%) 0/6px 6px" : undefined }} />
        {open && (
          <div className="absolute top-9 left-0 z-50 rounded-lg border border-[var(--border)] shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <HexColorPicker color={color || "#1a1b1e"} onChange={onChange} />
          </div>
        )}
      </div>
      <span className="text-[11px] text-[var(--text-muted)] w-14 flex-shrink-0">{label}</span>
      <input className="flex-1 min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none uppercase" value={color} onChange={(e) => onChange(e.target.value)} maxLength={7} placeholder="none" />
      {allowClear && color && <button onClick={onClear} className="text-[var(--text-muted)] hover:text-red-400 text-xs px-1 flex-shrink-0">×</button>}
    </div>
  );
}

// ─── BlockStyleEditor ─────────────────────────────────────────────────────────

const BLOCK_BORDER_STYLES: { id: string; label: string }[] = [
  { id: "solid", label: "Solid" }, { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" }, { id: "double", label: "Double" },
  { id: "groove", label: "Groove" }, { id: "ridge", label: "Ridge" },
  { id: "glow", label: "Glow" }, { id: "none", label: "None" },
];

const SHADOWS = ["none", "sm", "md", "lg"] as const;

function BlockStyleEditor({ boxId, boardId, style, onUpdate }: {
  boxId: string; boardId: string; style: BoxStyle; onUpdate: (patch: Partial<BoxStyle>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [openPicker, setOpenPicker] = useState<"bg" | "border" | "font" | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageUpload(file, (url) => onUpdate({ wallpaperUrl: url }));
    e.target.value = "";
  };

  return (
    <>
      <section>
        <SLabel>Background</SLabel>
        {!style.wallpaperUrl && (
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              <button onClick={() => setOpenPicker((v) => v === "bg" ? null : "bg")} className="h-7 w-10 rounded border border-[var(--border)]" style={{ backgroundColor: style.backgroundColor }} />
              {openPicker === "bg" && (
                <div className="absolute top-9 left-0 z-50 rounded-lg border border-[var(--border)] shadow-xl overflow-hidden">
                  <HexColorPicker color={style.backgroundColor} onChange={(c) => onUpdate({ backgroundColor: c })} />
                </div>
              )}
            </div>
            <input className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none uppercase" value={style.backgroundColor} onChange={(e) => onUpdate({ backgroundColor: e.target.value })} maxLength={7} />
          </div>
        )}
        <input className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" placeholder="Wallpaper URL…" value={style.wallpaperUrl?.startsWith("data:") ? "" : (style.wallpaperUrl ?? "")} onChange={(e) => onUpdate({ wallpaperUrl: e.target.value || "" })} />
        <div className="flex gap-1.5 mb-2">
          <button onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"><Upload size={12} /> Upload</button>
          {style.wallpaperUrl && <button onClick={() => onUpdate({ wallpaperUrl: "" })} className="rounded border border-[var(--border)] px-2 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors">Clear</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        {style.wallpaperUrl && (
          <WallpaperEditor url={style.wallpaperUrl} size={style.wallpaperSize ?? "cover"} position={style.wallpaperPosition ?? "center"} opacity={style.wallpaperOpacity ?? 1} backgroundColor={style.backgroundColor} onSizeChange={(v) => onUpdate({ wallpaperSize: v })} onPositionChange={(v) => onUpdate({ wallpaperPosition: v })} onOpacityChange={(v) => onUpdate({ wallpaperOpacity: v })} />
        )}
      </section>

      <section>
        <SLabel>Border</SLabel>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative">
            <button onClick={() => setOpenPicker((v) => v === "border" ? null : "border")} className="h-7 w-10 rounded border border-[var(--border)]" style={{ backgroundColor: style.borderColor }} />
            {openPicker === "border" && (
              <div className="absolute top-9 left-0 z-50 rounded-lg border border-[var(--border)] shadow-xl overflow-hidden">
                <HexColorPicker color={style.borderColor} onChange={(c) => onUpdate({ borderColor: c })} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-[11px] text-[var(--text-muted)]">W</span>
            <input type="number" min={0} max={24} value={style.borderWidth} onChange={(e) => onUpdate({ borderWidth: Number(e.target.value) })} className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" />
            <span className="text-[11px] text-[var(--text-muted)]">R</span>
            <input type="number" min={0} max={200} value={style.borderRadius} onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })} className="w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text-primary)] outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {BLOCK_BORDER_STYLES.map((bs) => {
            const isActive = style.borderStyle === bs.id;
            const w = Math.max(1, Math.min(style.borderWidth, 4));
            return (
              <button key={bs.id} onClick={() => onUpdate({ borderStyle: bs.id as BoxStyle["borderStyle"] })}
                className={cn("flex flex-col items-center gap-1 rounded-lg p-1.5 transition-all", isActive ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-overlay)]")}
              >
                <div className="w-full rounded" style={{ height: 18, border: bs.id === "glow" || bs.id === "none" ? "none" : `${w}px ${bs.id} ${style.borderColor}`, boxShadow: bs.id === "glow" ? `0 0 6px 2px ${style.borderColor}` : undefined, background: bs.id === "none" ? "repeating-linear-gradient(45deg,var(--border) 0,var(--border) 1px,transparent 0,transparent 50%) 0/6px 6px" : "transparent" }} />
                <span className={cn("text-[10px]", isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>{bs.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SLabel>Shadow</SLabel>
        <div className="flex gap-1.5">
          {SHADOWS.map((sh) => (
            <button key={sh} onClick={() => onUpdate({ shadow: sh })} className={cn("flex-1 rounded border py-1.5 text-xs transition-colors capitalize", style.shadow === sh ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>{sh}</button>
          ))}
        </div>
      </section>

      <section>
        <SLabel>Font color</SLabel>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setOpenPicker((v) => v === "font" ? null : "font")} className="h-7 w-10 rounded border border-[var(--border)]" style={{ backgroundColor: style.fontColor ?? "#f2f2f2" }} />
            {openPicker === "font" && (
              <div className="absolute top-9 left-0 z-50 rounded-lg border border-[var(--border)] shadow-xl overflow-hidden">
                <HexColorPicker color={style.fontColor ?? "#f2f2f2"} onChange={(c) => onUpdate({ fontColor: c })} />
              </div>
            )}
          </div>
          <input className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none uppercase" value={style.fontColor ?? "#f2f2f2"} onChange={(e) => onUpdate({ fontColor: e.target.value })} maxLength={7} />
        </div>
      </section>

      <section>
        <SLabel>Padding</SLabel>
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={64} value={style.padding} onChange={(e) => onUpdate({ padding: Number(e.target.value) })} className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none" />
          <span className="text-xs text-[var(--text-muted)]">px</span>
        </div>
      </section>
    </>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</p>;
}

