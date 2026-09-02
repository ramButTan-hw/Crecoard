"use client";

import { useEffect, useState } from "react";
import {
  Globe, Lock, Grid3X3, ZoomIn, ZoomOut,
  Pencil, CheckCircle2, Edit3, Palette, Share2,
  Minus, Square, X, ListTodo, Monitor,
} from "lucide-react";
import { useBoardStore, useActiveBoard } from "@/store/boardStore";
import { useHasAppBg } from "@/lib/useHasAppBg";
import { useCollab } from "@/lib/useCollabSession";
import { useBoardSync } from "@/contexts/BoardSyncContext";
import { ThemePanel } from "./ThemePanel";
import { ShareModal } from "./ShareModal";
import { TodayPanel } from "./TodayPanel";
import { cn } from "@/lib/utils";

function Avatar({ name, color, size = 24, title }: { name: string; color: string; size?: number; title?: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div
      title={title ?? name}
      className="rounded-full flex items-center justify-center shrink-0 font-bold text-white"
      style={{
        width: size, height: size,
        background: color,
        fontSize: size * 0.4,
        outline: "2px solid var(--surface-raised)",
        outlineOffset: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function TopBar() {
  const {
    showGrid, zoom,
    toggleGrid, zoomAtCanvasCenter,
    updateBoard, finishBoard, editBoard,
    activeBoardId,
  } = useBoardStore();
  const hasAppBg = useHasAppBg();
  const board = useActiveBoard();
  const { members, self, isConnected } = useCollab();
  const { saveStatus, saveError } = useBoardSync();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(board?.name ?? "");
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [wallpaperOn, setWallpaperOn] = useState(false);

  useEffect(() => {
    window.electron?.isWallpaperActive?.().then(setWallpaperOn).catch(() => {});
  }, []);

  const toggleWallpaper = async () => {
    const api = window.electron;
    if (!api?.setWallpaperBoard || !api.clearWallpaper) return;
    if (wallpaperOn) {
      await api.clearWallpaper();
      setWallpaperOn(false);
    } else {
      const res = await api.setWallpaperBoard(activeBoardId);
      if (res.ok) setWallpaperOn(true);
      else alert(res.error ?? "Couldn't set wallpaper.");
    }
  };
  const [isDesktop, setIsDesktop] = useState(false);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    const electron = window.electron;
    if (!electron) return;

    setIsDesktop(true);
    const refresh = () => {
      electron.isWindowMaximized().then(setWindowMaximized).catch(() => {});
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  const commitName = () => {
    if (nameInput.trim()) updateBoard(activeBoardId, { name: nameInput.trim() });
    setEditingName(false);
  };

  const isFinished = board?.isFinished ?? false;

  // All visible presence: self first, then remote members (up to 4 total)
  const presenceAvatars = [
    { userId: self.userId, displayName: self.displayName, color: self.color },
    ...members.filter(m => m.userId !== self.userId),
  ].slice(0, 4);

  return (
    <>
      <div
        className={cn("flex h-11 flex-shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 relative z-40", isDesktop && "select-none")}
        style={{
          background: hasAppBg ? "transparent" : "var(--surface-raised)",
          ...(isDesktop ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : {}),
        }}
      >
        {/* Board name */}
        <div className="flex min-w-0 items-center gap-1.5">
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
              className="rounded border border-[var(--accent)] bg-[var(--surface)] px-2 py-0.5 text-sm text-[var(--text-primary)] outline-none w-40"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            />
          ) : (
            <button
              onClick={() => { if (!isFinished) { setNameInput(board?.name ?? ""); setEditingName(true); } }}
              className="flex min-w-0 max-w-[42vw] items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] transition-colors md:max-w-none"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <span className="truncate">{board?.name}</span>
              {!isFinished && <Pencil size={12} className="shrink-0 text-[var(--text-muted)]" />}
            </button>
          )}
        </div>

        {/* Save status */}
        {saveStatus !== "idle" && (
          <span
            className={cn(
              "text-xs font-medium transition-colors duration-300 select-none",
              saveStatus === "saving" ? "text-[var(--text-muted)]"
              : saveStatus === "error" ? "text-red-400"
              : "text-green-400",
            )}
            title={saveStatus === "error" && saveError ? saveError : undefined}
            style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
          >
            {saveStatus === "saving" ? "Saving…"
             : saveStatus === "error" ? "Save failed — retrying"
             : "Saved"}
          </span>
        )}

        {/* Public / Private */}
        {!isFinished && (
          <button
            onClick={() => updateBoard(activeBoardId, { isPublic: !board?.isPublic })}
            className={cn("flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors", board?.isPublic ? "bg-green-500/10 text-green-400 hover:bg-green-500/20" : "bg-[var(--surface-overlay)] text-[var(--text-secondary)] hover:bg-[var(--border)]")}
            style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
          >
            {board?.isPublic ? <Globe size={13} /> : <Lock size={13} />}
            {board?.isPublic ? "Public" : "Private"}
          </button>
        )}

        {!isFinished && <div className="hidden h-5 w-px bg-[var(--border)] sm:block" />}

        {/* Grid toggle — desktop only (touch users have pinch-zoom/grid via gestures) */}
        {!isFinished && (
          <div className="hidden items-center gap-3 sm:flex">
            <ToolbarButton active={showGrid} onClick={toggleGrid} title="Toggle grid" desktop={isDesktop}><Grid3X3 size={15} /></ToolbarButton>
            <div className="h-5 w-px bg-[var(--border)]" />
          </div>
        )}

        {/* Zoom — desktop only; mobile uses pinch-zoom */}
        <div className="hidden items-center gap-1 sm:flex">
          <ToolbarButton onClick={() => zoomAtCanvasCenter(zoom - 0.1)} title="Zoom out" desktop={isDesktop}><ZoomOut size={15} /></ToolbarButton>
          <button
            onClick={() => zoomAtCanvasCenter(1)}
            className="min-w-[46px] text-center rounded px-1.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors font-mono"
            style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton onClick={() => zoomAtCanvasCenter(zoom + 0.1)} title="Zoom in" desktop={isDesktop}><ZoomIn size={15} /></ToolbarButton>
        </div>

        <div className="flex-1" />

        {/* Presence avatars (shown when collab is on or there are remote members) */}
        {(board?.collabEnabled || members.length > 0) && (
          <div className="hidden items-center md:flex">
            {/* Live dot */}
            <div
              className={cn("h-1.5 w-1.5 rounded-full mr-2 transition-colors", isConnected ? "bg-green-400" : "bg-yellow-400")}
              title={isConnected ? "Live" : "Connecting…"}
            />
            {/* Stacked avatars */}
            <div className="flex -space-x-1.5">
              {presenceAvatars.map((p, i) => (
                <div key={p.userId} style={{ zIndex: presenceAvatars.length - i }}>
                  <Avatar
                    name={p.displayName}
                    color={p.color}
                    size={24}
                    title={p.userId === self.userId ? `${p.displayName} (you)` : p.displayName}
                  />
                </div>
              ))}
              {members.length > 3 && (
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)] ring-2"
                  style={{ background: "var(--surface-overlay)", zIndex: 0 }}
                  title={`${members.length - 3} more`}
                >
                  +{members.length - 3}
                </div>
              )}
            </div>
            <div className="h-5 w-px bg-[var(--border)] ml-3" />
          </div>
        )}

        {/* Today — cross-board agenda */}
        <ToolbarButton
          onClick={() => setShowToday((v) => !v)}
          title="Today — due & assigned across boards"
          active={showToday}
          desktop={isDesktop}
        >
          <ListTodo size={15} />
        </ToolbarButton>

        {/* Pop-out — desktop app only: this board in a resizable floating window */}
        {isDesktop && (
          <ToolbarButton
            onClick={() => void toggleWallpaper()}
            title={wallpaperOn ? "Close pop-out board window" : "Pop out board into a floating window"}
            active={wallpaperOn}
            desktop={isDesktop}
          >
            <Monitor size={15} />
          </ToolbarButton>
        )}

        {/* Board theme */}
        <ToolbarButton
          onClick={() => setShowThemePanel((v) => !v)}
          title="Board theme"
          active={showThemePanel}
          extraProps={{ "data-theme-btn": "" }}
          desktop={isDesktop}
        >
          <Palette size={15} />
        </ToolbarButton>

        {/* Share */}
        <button
          data-share-btn
          onClick={() => setShowShare(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-overlay)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
          title="Share board"
          style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
        >
          <Share2 size={13} />
          <span className="hidden sm:inline">Share</span>
        </button>

        <div className="h-5 w-px bg-[var(--border)]" />

        {/* Finish / Edit */}
        {isFinished ? (
          <button
            onClick={() => editBoard(activeBoardId)}
            title="Unlock the board for editing"
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
            style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
          >
            <Edit3 size={14} /> Unlock
          </button>
        ) : confirmFinish ? (
          <div className="flex items-center gap-1" style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
            <button
              onClick={() => { finishBoard(activeBoardId); setConfirmFinish(false); }}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors shadow-sm"
            >
              <CheckCircle2 size={14} /> Lock board?
            </button>
            <button
              onClick={() => setConfirmFinish(false)}
              className="flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmFinish(true)}
            title="Lock the board — view-only until unlocked"
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
            style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
          >
            <CheckCircle2 size={14} /> <span className="hidden sm:inline">Lock</span>
          </button>
        )}

        {isDesktop && (
          <div className="ml-2 flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <button onClick={() => window.electron?.minimizeWindow()} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors" title="Minimize">
              <Minus size={14} />
            </button>
            <button onClick={async () => {
              const maximized = await window.electron?.toggleMaximizeWindow();
              if (typeof maximized === "boolean") setWindowMaximized(maximized);
            }} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors" title={windowMaximized ? "Restore" : "Maximize"}>
              <Square size={12} />
            </button>
            <button onClick={() => window.electron?.closeWindow()} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-red-500/15 hover:text-red-400 transition-colors" title="Close">
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {showThemePanel && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setShowThemePanel(false)} />
          <ThemePanel onClose={() => setShowThemePanel(false)} />
        </>
      )}

      {showShare && <ShareModal onClose={() => setShowShare(false)} />}

      {showToday && <TodayPanel onClose={() => setShowToday(false)} />}
    </>
  );
}

function ToolbarButton({ children, onClick, title, active, extraProps, desktop }: { children: React.ReactNode; onClick: () => void; title?: string; active?: boolean; extraProps?: Record<string, string>; desktop?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      {...(extraProps ?? {})}
      style={desktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}
      className={cn(
        "flex items-center justify-center rounded p-1.5 transition-colors",
        active
          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
    >
      {children}
    </button>
  );
}
