"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CopyPlus, Trash2, ArrowUpToLine, ArrowDownToLine, Lock, Unlock, LockOpen, Eye, EyeOff, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { BoardLevelItem, useBoardStore, isContributableType } from "@/store/boardStore";
import { useCanEditBoard, useServerBoard, roleAllowed } from "@/contexts/ServerBoardContext";
import { ItemPermissionModal } from "./PermissionModal";
import { ItemRenderer } from "@/components/items/ItemRenderer";
import { animClassFor } from "@/lib/animSpec";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/ContextMenu";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { magnetize, snapPosition } from "@/lib/snapToGrid";

const MIN_W = 80;
const MIN_H = 40;

// Types whose content is primarily read — they get the auto wallpaper backdrop.
const SCRIM_TYPES = new Set(["list", "table", "calendar", "kanban", "suggestion", "guestbook", "poll"]);

interface Props {
  item: BoardLevelItem;
  boardId: string;
  isFinished: boolean;
  isSelected: boolean;
}

export function BoardItemWidget({ item, boardId, isFinished, isSelected }: Props) {
  const {
    moveBoardItem, resizeBoardItem, removeBoardItem,
    duplicateBoardItem, bringBoardItemToFront, sendBoardItemToBack,
    updateBoardItem, selectBoardItem, focusBoardItem,
  } = useBoardStore();
  const isMobile = useIsMobile();
  const zoom = useBoardStore((s) => s.zoom);
  const canEditBoard = useCanEditBoard();
  // Reading-surface items get a readable backdrop when the board wears a
  // wallpaper (beta feedback: content unreadable over busy art). Items with
  // their own opaque background simply cover it; itemScrim=false opts out.
  const boardHasWallpaper = useBoardStore((s) => {
    const b = s.boards.find((x) => x.id === boardId) ?? s.serverBoards[boardId];
    return !!(b?.themeBgImage || b?.backgroundImage);
  });
  const anyBoardFocused = useBoardStore((s) =>
    (s.boards.find((b) => b.id === boardId) ?? s.serverBoards[boardId])?.boardItems?.some((i) => i.isFocused) ?? false
  );
  const vars = useMemo(() => ({} as Record<string, number>), []);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { dragCleanupRef.current?.(); resizeCleanupRef.current?.(); };
  }, []);

  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const { serverId, viewerRole, viewerRoleIds } = useServerBoard();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const isDragging = useRef(false);

  const canInteract = !isFinished && roleAllowed(viewerRole, viewerRoleIds, item.perms?.interact);
  const canInput = !isFinished && roleAllowed(viewerRole, viewerRoleIds, item.perms?.input);
  const canContribute = !isFinished && (!!item.allowContributions || isContributableType(item.type)) && roleAllowed(viewerRole, viewerRoleIds, item.perms?.contribute);

  const displayX = livePos?.x ?? item.boardX;
  const displayY = livePos?.y ?? item.boardY;
  const displayW = liveSize?.w ?? item.boardW;
  const displayH = liveSize?.h ?? item.boardH;

  // ── Drag ────────────────────────────────────────────────────────────────────
  const beginMove = useCallback((startX: number, startY: number) => {
    if (isFinished || !canEditBoard || item.locked) return;
    isDragging.current = false;
    const origX = item.boardX;
    const origY = item.boardY;
    // Align to neighbors (boxes + other items) — captured once, positions are
    // static for the duration of the drag. Grid stays as an opt-in fallback.
    const st0 = useBoardStore.getState();
    const board0 = st0.boards.find((b) => b.id === boardId) ?? st0.serverBoards[boardId];
    const targets = board0 ? [
      ...board0.boxes.filter((b) => !b.deckOwnerId).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
      ...(board0.boardItems ?? []).filter((i) => i.id !== item.id).map((i) => ({ x: i.boardX, y: i.boardY, w: i.boardW, h: i.boardH })),
    ] : [];
    const snapped = (dx: number, dy: number) => {
      const p = snapPosition({ x: origX + dx, y: origY + dy, w: item.boardW, h: item.boardH }, targets, useBoardStore.getState().showGrid);
      return { x: Math.max(0, p.x), y: Math.max(0, p.y) };
    };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      isDragging.current = true;
      const p = snapped(dx, dy);
      setLivePos(p);
      useBoardStore.getState().setItemDragRect({ id: item.id, x: p.x, y: p.y, width: item.boardW, height: item.boardH });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      useBoardStore.getState().setItemDragRect(null);
      dragCleanupRef.current = null;
    };
    const onUp = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (isDragging.current) {
        const p = snapped(dx, dy);
        moveBoardItem(boardId, item.id, Math.round(p.x), Math.round(p.y));
      }
      setLivePos(null);
      isDragging.current = false;
      cleanup();
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished, canEditBoard, item.boardX, item.boardY, item.boardW, item.boardH, item.locked, item.id, boardId, zoom, moveBoardItem]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (isFinished || !canEditBoard || item.locked) return;
    e.stopPropagation();
    e.preventDefault();
    beginMove(e.clientX, e.clientY);
  }, [isFinished, canEditBoard, item.locked, beginMove]);

  // ── Resize ───────────────────────────────────────────────────────────────────
  const makeResizeHandler = useCallback(
    (edges: { n?: boolean; s?: boolean; e?: boolean; w?: boolean }) =>
      (e: React.PointerEvent) => {
        if (isFinished || !canEditBoard || item.locked) return;
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = item.boardX;
        const origY = item.boardY;
        const origW = item.boardW;
        const origH = item.boardH;
        const snap = (v: number) => Math.round(magnetize(v, useBoardStore.getState().showGrid));

        const compute = (ev: PointerEvent) => {
          const dx = (ev.clientX - startX) / zoom;
          const dy = (ev.clientY - startY) / zoom;
          let x = origX, y = origY, w = origW, h = origH;
          if (edges.e) w = Math.max(MIN_W, snap(origW + dx));
          if (edges.s) h = Math.max(MIN_H, snap(origH + dy));
          if (edges.w) { const nw = Math.max(MIN_W, snap(origW - dx)); x = snap(origX + origW - nw); w = nw; }
          if (edges.n) { const nh = Math.max(MIN_H, snap(origH - dy)); y = snap(origY + origH - nh); h = nh; }
          return { x: Math.max(0, x), y: Math.max(0, y), w, h };
        };

        const onMove = (ev: PointerEvent) => {
          const { x, y, w, h } = compute(ev);
          setLivePos({ x, y });
          setLiveSize({ w, h });
        };
        const cleanup = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          resizeCleanupRef.current = null;
        };
        const onUp = (ev: PointerEvent) => {
          const { x, y, w, h } = compute(ev);
          moveBoardItem(boardId, item.id, x, y);
          resizeBoardItem(boardId, item.id, w, h);
          setLivePos(null);
          setLiveSize(null);
          cleanup();
        };
        resizeCleanupRef.current = cleanup;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      },
    [isFinished, item.boardX, item.boardY, item.boardW, item.boardH, item.id, boardId, zoom, moveBoardItem, resizeBoardItem]
  );

  const handleCtxMenuClose = useCallback(() => setCtxMenu(null), []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isFinished || !canEditBoard) return;
    e.preventDefault();
    e.stopPropagation();
    selectBoardItem(item.id);
    bringBoardItemToFront(boardId, item.id);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [isFinished, item.id, boardId, selectBoardItem, bringBoardItemToFront]);

  const menuItems = [
    {
      label: item.isFocused ? "Unfocus" : "Focus",
      icon: item.isFocused ? <EyeOff size={14} /> : <Eye size={14} />,
      onClick: () => focusBoardItem(boardId, item.isFocused ? null : item.id),
    },
    {
      label: item.settingsLocked ? "Unlock settings" : "Lock settings",
      icon: item.settingsLocked ? <LockOpen size={14} /> : <Lock size={14} />,
      onClick: () => updateBoardItem(boardId, item.id, { settingsLocked: !item.settingsLocked } as Partial<BoardLevelItem>),
    },
    {
      label: item.locked ? "Unlock position" : "Lock position",
      icon: item.locked ? <LockOpen size={14} /> : <Lock size={14} />,
      onClick: () => updateBoardItem(boardId, item.id, { locked: !item.locked } as Partial<BoardLevelItem>),
    },
    "separator" as const,
    {
      label: "Duplicate",
      icon: <CopyPlus size={14} />,
      onClick: () => duplicateBoardItem(boardId, item.id),
    },
    "separator" as const,
    {
      label: item.locked ? "Unlock position" : "Lock position",
      icon: item.locked ? <Unlock size={14} /> : <Lock size={14} />,
      onClick: () => updateBoardItem(boardId, item.id, { locked: !item.locked } as Partial<BoardLevelItem>),
    },
    {
      label: "Bring to front",
      icon: <ArrowUpToLine size={14} />,
      onClick: () => bringBoardItemToFront(boardId, item.id, true), // explicit — clears "keep behind"
    },
    {
      label: "Send to back",
      icon: <ArrowDownToLine size={14} />,
      onClick: () => sendBoardItemToBack(boardId, item.id),
    },
    "separator" as const,
    {
      label: "Delete",
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => removeBoardItem(boardId, item.id),
    },
  ];

  const upd = (patch: Partial<BoardLevelItem>) => updateBoardItem(boardId, item.id, patch);

  // Board-level context items injected into every item's right-click menu.
  const extraContextItems: ContextMenuEntry[] | undefined =
    !isFinished && canEditBoard
      ? [
          {
            label: item.isFocused ? "Unfocus" : "Focus",
            icon: item.isFocused ? <EyeOff size={14} /> : <Eye size={14} />,
            onClick: () => focusBoardItem(boardId, item.isFocused ? null : item.id),
          },
          {
            label: item.settingsLocked ? "Unlock settings" : "Lock settings",
            icon: item.settingsLocked ? <LockOpen size={14} /> : <Lock size={14} />,
            onClick: () => updateBoardItem(boardId, item.id, { settingsLocked: !item.settingsLocked } as Partial<BoardLevelItem>),
          },
          "separator",
          {
            label: "Duplicate",
            icon: <CopyPlus size={14} />,
            onClick: () => duplicateBoardItem(boardId, item.id),
          },
          "separator",
          {
            label: item.locked ? "Unlock position" : "Lock position",
            icon: item.locked ? <Unlock size={14} /> : <Lock size={14} />,
            onClick: () => updateBoardItem(boardId, item.id, { locked: !item.locked } as Partial<BoardLevelItem>),
          },
          {
            label: "Bring to front",
            icon: <ArrowUpToLine size={14} />,
            onClick: () => bringBoardItemToFront(boardId, item.id, true), // explicit — clears "keep behind"
          },
          {
            label: "Send to back",
            icon: <ArrowDownToLine size={14} />,
            onClick: () => sendBoardItemToBack(boardId, item.id),
          },
          "separator",
          {
            label: "Delete",
            icon: <Trash2 size={14} />,
            danger: true,
            onClick: () => removeBoardItem(boardId, item.id),
          },
          ...(serverId && viewerRole === "owner" ? [
            "separator" as const,
            {
              label: "Set permissions",
              icon: <ShieldCheck size={14} />,
              onClick: () => setPermModalOpen(true),
            },
          ] : []),
        ]
      : undefined;

  return (
    <>
      <div
        className={cn("board-item-widget absolute group/biw", isSelected && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-transparent", animClassFor(item.itemEntrance, item.itemEntranceCustom))}
        style={{
          left: displayX,
          top: displayY,
          width: displayW,
          height: displayH,
          zIndex: item.isFocused ? item.zIndex + 100 : item.zIndex,
          position: "absolute",
          overflow: "hidden",
          borderRadius: 6,
          opacity: anyBoardFocused && !item.isFocused ? 0.2 : 1,
          pointerEvents: anyBoardFocused && !item.isFocused ? "none" : undefined,
          boxShadow: item.isFocused ? "0 0 0 2px var(--accent), 0 0 20px var(--accent)55" : undefined,
          transition: "opacity 0.2s, box-shadow 0.2s",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFinished) {
            selectBoardItem(item.id);
            bringBoardItemToFront(boardId, item.id);
          }
        }}
        onDoubleClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button,a,input,textarea,select,[contenteditable="true"],iframe')) return;
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("crecoard:focus-box", { detail: { boxId: item.id } }));
        }}
        onPointerDown={(e) => {
          // One interaction grammar with boxes: items drag from the body too.
          // Interactive elements and scrollable content win; [data-item-drag]
          // chrome (headers) drags immediately; anywhere else arms a 6px
          // movement threshold so plain clicks still just select.
          if (e.button !== 0 || isFinished || !canEditBoard || item.locked) return;
          const el = e.target as HTMLElement;
          if (el.closest('button,a,input,textarea,select,[contenteditable="true"],[data-nodrag],iframe,video,audio')) return;
          if (el.closest("[data-item-drag]")) {
            selectBoardItem(item.id);
            bringBoardItemToFront(boardId, item.id);
            handleDragStart(e);
            return;
          }
          // Tables are dense interactive surfaces (cells, column resizing,
          // scrolling) — body-drag fires by accident constantly, so a table
          // moves ONLY from its top drag handle, never the body.
          if (item.type === "table") return;
          // Presses inside genuinely scrollable content belong to the content.
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
            selectBoardItem(item.id);
            bringBoardItemToFront(boardId, item.id);
            beginMove(sx, sy);
          };
          const disarm = () => {
            window.removeEventListener("pointermove", arm);
            window.removeEventListener("pointerup", disarm);
          };
          window.addEventListener("pointermove", arm);
          window.addEventListener("pointerup", disarm);
        }}
        onContextMenuCapture={(e) => {
          if (isFinished || !canEditBoard) return;
          e.preventDefault();
          selectBoardItem(item.id);
          bringBoardItemToFront(boardId, item.id);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Drag handle — strip at top; visible on hover, or when selected (touch).
            Sits ABOVE the n-resize edge (z-30 > z-25) so the whole strip actually
            moves the item; inset from the corners so nw/ne resize stays reachable. */}
        {!isFinished && canEditBoard && (
          <div
            className={cn(
              "absolute z-30 flex items-center justify-center transition-opacity",
              isSelected ? "opacity-100" : "opacity-0 group-hover/biw:opacity-100"
            )}
            style={{
              top: 0, left: 12, right: 12, height: isMobile ? 22 : 16,
              cursor: "grab",
              background: "rgba(88,101,242,0.55)",
              backdropFilter: "blur(2px)",
              borderRadius: "0 0 6px 6px",
            }}
            onPointerDown={handleDragStart}
          >
            <div style={{ width: isMobile ? 32 : 24, height: isMobile ? 3 : 2, borderRadius: 2, background: "rgba(255,255,255,0.7)" }} />
          </div>
        )}

        {/* Mobile: delete/duplicate when selected */}
        {!isFinished && canEditBoard && isMobile && isSelected && (
          <div className="absolute top-2 right-1 z-30 flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("crecoard:open-item-settings")); }} title="Settings" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[var(--text-secondary)] shadow">
              <SlidersHorizontal size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); duplicateBoardItem(boardId, item.id); }} title="Duplicate" className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-overlay)] text-[var(--text-secondary)] shadow">
              <CopyPlus size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); removeBoardItem(boardId, item.id); }} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {/* Settings lock badge */}
        {item.settingsLocked && (
          <div className="absolute top-1 right-1 z-30 pointer-events-none">
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 leading-none">
              <Lock size={8} />
            </span>
          </div>
        )}

        {/* Readable backdrop (auto over wallpapers for reading surfaces) */}
        {(item.itemScrim ?? (boardHasWallpaper && SCRIM_TYPES.has(item.type))) && (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(13, 14, 18, 0.58)", borderRadius: 6 }} />
        )}

        {/* Item content */}
        <div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
          <ItemRenderer
            item={item}
            boardId={boardId}
            boxId=""
            vars={vars}
            collapsed={false}
            isFinished={isFinished}
            containerW={displayW}
            containerH={displayH}
            onUpdate={upd}
            extraContextItems={extraContextItems}
            canInteract={canInteract}
            canInput={canInput}
            canContribute={canContribute}
          />
        </div>

        {/* Resize handles */}
        {!isFinished && canEditBoard && (<>
          <div onPointerDown={makeResizeHandler({ n: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0, left:8, right:8, height:6, cursor:"n-resize", zIndex:25 }} />
          <div onPointerDown={makeResizeHandler({ s: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:8, right:8, height:6, cursor:"s-resize", zIndex:25 }} />
          <div onPointerDown={makeResizeHandler({ w: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:8, left:0, bottom:8, width:6, cursor:"w-resize", zIndex:25 }} />
          <div onPointerDown={makeResizeHandler({ e: true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:8, right:0, bottom:8, width:6, cursor:"e-resize", zIndex:25 }} />
          <div onPointerDown={makeResizeHandler({ n:true, w:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0, left:0, width:10, height:10, cursor:"nw-resize", zIndex:26 }} />
          <div onPointerDown={makeResizeHandler({ n:true, e:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", top:0, right:0, width:10, height:10, cursor:"ne-resize", zIndex:26 }} />
          <div onPointerDown={makeResizeHandler({ s:true, w:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, width:10, height:10, cursor:"sw-resize", zIndex:26 }} />
          <div onPointerDown={makeResizeHandler({ s:true, e:true })} onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, right:0, width:16, height:16, cursor:"se-resize", zIndex:26 }} />
        </>)}

        {/* Size readout during resize */}
        {liveSize && (
          <div aria-hidden style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 30, pointerEvents: "none",
            background: "rgba(0,0,0,0.62)", backdropFilter: "blur(6px)",
            color: "#fff", fontFamily: "ui-monospace, monospace",
            fontSize: 11, padding: "4px 10px", borderRadius: 6, whiteSpace: "nowrap",
          }}>
            {Math.round(displayW)} × {Math.round(displayH)}
          </div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={handleCtxMenuClose}
        />
      )}

      {permModalOpen && (
        <ItemPermissionModal
          targetLabel={item.type}
          itemType={item.type}
          initialPerms={item.perms}
          onSave={(perms) => updateBoardItem(boardId, item.id, { perms } as Partial<BoardLevelItem>)}
          onClose={() => setPermModalOpen(false)}
        />
      )}
    </>
  );
}
