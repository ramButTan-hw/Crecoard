"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Plus, Layers, X, Pencil, Settings, Layout, LogOut, Trash2, RotateCcw } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { cn } from "@/lib/utils";
import { useBoardChat } from "@/contexts/BoardChatContext";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Bell, BellOff, AtSign } from "lucide-react";
import { MOCK_SERVERS } from "@/lib/mockServerData";
import { useUser } from "@/contexts/UserContext";
import { useServers } from "@/contexts/ServersContext";
import { CreateServerModal } from "@/components/server/CreateServerModal";
import type { Server } from "@/types/server";
import { useBoardStore } from "@/store/boardStore";
import { useIsMobile } from "@/hooks/useIsMobile";

interface BottomBarProps {
  activeView: "board" | "server";
  activeServerId: string | null;
  showFriends: boolean;
  onViewChange: (v: "board" | "server") => void;
  onFriendsToggle: () => void;
  onServerSelect: (id: string) => void;
  onSettingsOpen: () => void;
  onTemplatesOpen: () => void;
  onProfileOpen: () => void;
  /** Notifies the parent when a bottom-bar overlay (profile popup / server grid) is open. */
  onMenuStateChange?: (open: boolean) => void;
}

export function BottomBar({
  activeView, activeServerId, showFriends,
  onViewChange, onFriendsToggle, onServerSelect,
  onSettingsOpen, onTemplatesOpen, onProfileOpen, onMenuStateChange,
}: BottomBarProps) {
  const [mounted, setMounted] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showServerGrid, setShowServerGrid] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const isMobile = useIsMobile();
  const { identity, signOut } = useUser();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onMenuStateChange?.(showProfile || showServerGrid || showCreateServer);
  }, [showProfile, showServerGrid, showCreateServer, onMenuStateChange]);
  const { servers: realServers } = useServers();
  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project")
  );
  const [serverIcons, setServerIcons] = useState<Record<string, string>>({});
  const [serverOrder, setServerOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("plancraft-server-order") ?? "null");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return MOCK_SERVERS.map((s) => s.id);
  });
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const boards = useBoardStore((s) => s.boards);
  // Progressive disclosure: keep Servers hidden for brand-new users until they've
  // put something on a board (or they're already viewing a server).
  const showServers = boards.some((b) => b.boxes.length > 0 || (b.boardItems?.length ?? 0) > 0) || activeView === "server";
  const trashToast = useBoardStore((s) => s.trashToast);
  const clearTrashToast = useBoardStore((s) => s.clearTrashToast);
  const restoreBoard = useBoardStore((s) => s.restoreBoard);
  const [toastCountdown, setToastCountdown] = useState(5);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!trashToast) return;
    setToastCountdown(5);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => { clearTrashToast(); }, 5000);
    const interval = setInterval(() => setToastCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(interval); };
  }, [trashToast, clearTrashToast]);

  useEffect(() => {
    const loadIcons = () => {
      const icons: Record<string, string> = {};
      MOCK_SERVERS.forEach((srv) => {
        try {
          const stored = JSON.parse(localStorage.getItem(`plancraft-server-${srv.id}`) ?? "null");
          if (stored?.iconUrl) icons[srv.id] = stored.iconUrl;
        } catch {}
      });
      setServerIcons(icons);
    };
    loadIcons();
    window.addEventListener("plancraft-server-updated", loadIcons);
    return () => window.removeEventListener("plancraft-server-updated", loadIcons);
  }, []);

  const orderedServers = serverOrder
    .map((id) => MOCK_SERVERS.find((s) => s.id === id))
    .filter((s): s is (typeof MOCK_SERVERS)[0] => !!s);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("server-id", id);
    e.dataTransfer.effectAllowed = "move";
    setDragSrcId(id);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragSrcId) setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData("server-id");
    if (!srcId || srcId === targetId) { setDragSrcId(null); setDragOverId(null); return; }
    const next = [...serverOrder];
    const si = next.indexOf(srcId);
    const ti = next.indexOf(targetId);
    if (si === -1 || ti === -1) return;
    next.splice(si, 1);
    next.splice(ti, 0, srcId);
    setServerOrder(next);
    localStorage.setItem("plancraft-server-order", JSON.stringify(next));
    setDragSrcId(null);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDragSrcId(null); setDragOverId(null); };

  const favoriteBoard = identity.favoriteBoardId
    ? boards.find((b) => b.id === identity.favoriteBoardId)
    : undefined;

  return (
    <>
      {/* Profile popup backdrop */}
      {showProfile && (
        <div className="fixed inset-0 z-[998]" onClick={() => setShowProfile(false)} />
      )}

      {/* Profile popup */}
      {showProfile && (
        <div
          className="fixed z-[999] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col"
          style={{ bottom: 60, left: 12, width: "min(400px, calc(100vw - 24px))", background: "var(--surface-raised)" }}
        >
          {/* Banner */}
          <div
            className="relative flex-shrink-0"
            style={{
              height: 110,
              background: identity.bannerUrl ? undefined : `linear-gradient(135deg, ${identity.color}66 0%, ${identity.color}22 100%)`,
              backgroundImage: identity.bannerUrl ? `url(${identity.bannerUrl})` : undefined,
              backgroundSize: identity.bannerUrl ? "cover" : undefined,
              backgroundPosition: "center",
            }}
          >
            <div
              className="absolute flex items-center justify-center rounded-full overflow-hidden border-4 text-white font-bold text-2xl select-none"
              style={{ width: 80, height: 80, bottom: -36, left: 16, background: identity.color, borderColor: "var(--surface-raised)" }}
            >
              {identity.avatarUrl
                ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
                : (identity.displayName[0] ?? "?").toUpperCase()
              }
            </div>
          </div>

          {/* Name row */}
          <div className="flex items-center gap-2 px-4 pt-2 pb-3" style={{ paddingLeft: 112 }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-[var(--text-primary)] truncate">{identity.displayName}</span>
                <button
                  onClick={() => { setShowProfile(false); onProfileOpen(); }}
                  className="flex-shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  title="Edit profile"
                >
                  <Pencil size={12} />
                </button>
              </div>
              {identity.pronouns && (
                <p className="text-[11px] text-[var(--text-muted)] leading-none mt-0.5">{identity.pronouns}</p>
              )}
              {(identity.statusEmoji || identity.status) && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{identity.statusEmoji} {identity.status}</p>
              )}
            </div>
          </div>

          <div className="h-px mx-4" style={{ background: "var(--border)" }} />

          {/* Favorite board preview */}
          {favoriteBoard ? (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="px-4 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {favoriteBoard.name || "Untitled Board"}
              </p>
              <div
                className="relative mx-4 mb-4 rounded-lg overflow-hidden border border-[var(--border)] flex-1"
                style={{ height: 180, background: "var(--surface)" }}
              >
                <div
                  className="absolute inset-0"
                  style={{ backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)", backgroundSize: "20px 20px", opacity: 0.5 }}
                />
                {favoriteBoard.boxes.map((box) => {
                  const scale = 368 / 2400;
                  return (
                    <div
                      key={box.id}
                      className="absolute overflow-hidden"
                      style={{
                        left: box.x * scale, top: box.y * scale,
                        width: Math.max(box.width * scale, 28), height: Math.max(box.height * scale, 16),
                        background: (box.style.backgroundColor ?? "var(--surface-raised)") + "cc",
                        border: `1px solid ${box.style.borderColor}88`,
                        borderRadius: Math.min((box.style.borderRadius ?? 8) * scale, 6),
                      }}
                    >
                      {box.title && (
                        <p className="truncate font-medium leading-none" style={{ fontSize: 6, padding: "2px 3px", color: box.style.fontColor ?? "var(--text-primary)" }}>
                          {box.title}
                        </p>
                      )}
                    </div>
                  );
                })}
                {favoriteBoard.boxes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-[var(--text-muted)]">Empty board</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Layout size={13} />
              <span>Set a favorite board in Edit Profile</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex gap-1 px-3 pb-3 pt-1 border-t border-[var(--border)]">
            <ActionBtn label="Edit Profile" onClick={() => { setShowProfile(false); onProfileOpen(); }} icon={<Pencil size={12} />} />
            <ActionBtn label="Settings" onClick={() => { setShowProfile(false); onSettingsOpen(); }} icon={<Settings size={12} />} />
            <ActionBtn label="Templates" onClick={() => { setShowProfile(false); onTemplatesOpen(); }} icon={<Layout size={12} />} />
            <ActionBtn label="Log Out" onClick={() => void signOut()} icon={<LogOut size={12} />} danger />
          </div>
        </div>
      )}

      {/* Server grid modal */}
      {showServerGrid && (
        <ServerGridModal
          realServers={realServers.map((s) => ({ id: s.id, name: s.name, icon: s.icon, online: s.onlineCount }))}
          onServerSelect={(id) => { setShowServerGrid(false); onServerSelect(id); }}
          onCreateServer={() => { setShowServerGrid(false); setShowCreateServer(true); }}
          onClose={() => setShowServerGrid(false)}
        />
      )}

      {/* Create server modal */}
      {showCreateServer && (
        <CreateServerModal
          onClose={() => setShowCreateServer(false)}
          onCreated={(server) => { setShowCreateServer(false); onServerSelect(server.id); }}
        />
      )}

      {/* Undo toast — appears above the bar when a board is deleted */}
      {trashToast && (
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2.5 overflow-hidden relative" style={{ background: "var(--surface-raised)" }}>
          <Trash2 size={13} className="text-[var(--text-muted)] flex-shrink-0" />
          <span className="text-sm text-[var(--text-secondary)] flex-1 min-w-0 truncate">
            <span className="font-medium text-[var(--text-primary)]">{trashToast.boardName}</span>
            {" "}moved to trash
          </span>
          <button
            onClick={() => {
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              restoreBoard(trashToast.boardId);
            }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex-shrink-0"
          >
            <RotateCcw size={12} /> Undo
          </button>
          <span className="text-xs text-[var(--text-muted)] w-4 text-center flex-shrink-0">{toastCountdown}s</span>
          <TrashToastBar key={trashToast.boardId} />
        </div>
      )}

      {/* Mobile: a compact, evenly-spaced bottom tab bar (the desktop server-rail
          doesn't fit a phone). Servers open in the grid sheet; profile in the popup. */}
      {isMobile ? (
        <nav
          className="flex flex-shrink-0 items-stretch border-t border-[var(--border)] pb-safe"
          style={{ background: "var(--surface-raised)", position: "relative", zIndex: 1 }}
        >
          <MobileTab label="Boards" active={activeView === "board" && !showProfile} onClick={() => { setShowProfile(false); onViewChange("board"); }} icon={<LogoMark size={20} badge />} />
          {showServers && <MobileTab label="Servers" active={activeView === "server" && !showProfile} onClick={() => setShowServerGrid(true)} icon={<Layout size={19} />} />}
          <MobileTab label="Friends" active={showFriends && !showProfile} onClick={onFriendsToggle} icon={<Users size={19} />} />
          <MobileTab label="You" active={showProfile} onClick={() => setShowProfile((v) => !v)} icon={
            <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full" style={{ background: mounted ? (identity.color ?? "var(--surface-overlay)") : "var(--surface-overlay)" }}>
              {mounted && identity.avatarUrl
                ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
                : <span className="text-[11px] font-bold text-white">{mounted ? (identity.displayName[0] ?? "?").toUpperCase() : "?"}</span>}
            </span>
          } />
        </nav>
      ) : (
      /* Bottom bar (desktop) */
      <div
        className="flex h-[52px] flex-shrink-0 items-center border-t border-[var(--border)] overflow-visible"
        style={{ background: "var(--surface-raised)", position: "relative", zIndex: 1 }}
      >
        {/* Profile avatar — overflows above the bar */}
        <div className="flex flex-shrink-0 items-center justify-center px-3" style={{ position: "relative", zIndex: 2 }}>
          <button
            onClick={() => setShowProfile((v) => !v)}
            title={mounted ? (identity.displayName || "Profile") : "Profile"}
            className={cn(
              "relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full overflow-hidden transition-all duration-200",
              showProfile
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-raised)] scale-105"
                : "hover:scale-110 hover:ring-2 hover:ring-[var(--accent)] hover:ring-offset-2 hover:ring-offset-[var(--surface-raised)]"
            )}
            style={{
              background: mounted ? (identity.color ?? "var(--surface-overlay)") : "var(--surface-overlay)",
              transform: "translateY(-10px)",
            }}
            suppressHydrationWarning
          >
            {mounted && identity.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-white select-none">
                {mounted ? (identity.displayName[0] ?? "?").toUpperCase() : "?"}
              </span>
            )}
            {/* Online dot */}
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[var(--surface-raised)]" />
          </button>
        </div>

        <Divider />

        {/* Nav buttons */}
        <div className="flex items-center gap-1 px-1">
          <BarBtn label="Personal Boards" active={activeView === "board"} onClick={() => onViewChange("board")} icon={<LogoMark size={22} badge />} />
          <BarBtn label="Friends" active={showFriends} onClick={onFriendsToggle} icon={<Users size={18} />} />
        </div>

        {showServers && (<>
        <Divider />

        {/* Servers — real servers first (no drag), then mock servers (draggable) */}
        <div className="flex items-center gap-1 px-1" onDragLeave={() => setDragOverId(null)}>
          {/* Real Supabase servers */}
          {realServers.map((srv) => (
            <ServerBtn
              key={srv.id}
              srv={{ id: srv.id, name: srv.name, icon: srv.icon, onlineCount: srv.onlineCount }}
              active={activeView === "server" && activeServerId === srv.id}
              isDragging={false}
              isDragOver={false}
              onClick={() => onServerSelect(srv.id)}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
              onDragEnd={() => {}}
            />
          ))}

          {/* Thin divider between real and mock if both exist */}
          {!supabaseReady && realServers.length > 0 && orderedServers.length > 0 && (
            <div className="h-5 w-px flex-shrink-0 bg-[var(--border)] mx-0.5" />
          )}

          {/* Mock servers — only shown in guest/local mode */}
          {!supabaseReady && orderedServers.map((srv) => (
            <ServerBtn
              key={srv.id}
              srv={srv}
              iconUrl={serverIcons[srv.id]}
              active={activeView === "server" && activeServerId === srv.id}
              isDragging={dragSrcId === srv.id}
              isDragOver={dragOverId === srv.id}
              onClick={() => onServerSelect(srv.id)}
              onDragStart={(e) => handleDragStart(e, srv.id)}
              onDragOver={(e) => handleDragOver(e, srv.id)}
              onDrop={(e) => handleDrop(e, srv.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Browse / add server */}
          <div className="group relative flex-shrink-0">
            <button
              onClick={() => setShowServerGrid(true)}
              title="Servers"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-all duration-150"
            >
              <Plus size={17} />
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
              Add or create server
            </div>
          </div>
        </div>
        </>)}

        <div className="flex-1" />
      </div>
      )}
    </>
  );
}

function MobileTab({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
        active ? "text-[var(--accent)]" : "text-[var(--text-muted)] active:text-[var(--text-primary)]"
      )}
    >
      <span className="flex h-[22px] items-center justify-center">{icon}</span>
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>
  );
}

function ServerBtn({
  srv, iconUrl, active, isDragging, isDragOver,
  onClick, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  srv: { id: string; name: string; icon: string; onlineCount: number };
  iconUrl?: string;
  active: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { notifPrefs, setNotifPref } = useBoardChat();
  const serverKey = `server::${srv.id}`;
  const serverLevel = notifPrefs[serverKey] ?? "all";
  const [notifMenu, setNotifMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="group relative flex-shrink-0"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setNotifMenu({ x: e.clientX, y: e.clientY }); }}
      style={{ opacity: isDragging ? 0.35 : 1, transition: "opacity 0.15s" }}
    >
      {/* Drop target indicator */}
      <div
        className="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 rounded-full bg-[var(--accent)] transition-all duration-100"
        style={{ height: isDragOver ? 28 : 0 }}
      />

      <button
        onClick={onClick}
        title={`${srv.name} · ${srv.onlineCount} online`}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden cursor-grab active:cursor-grabbing",
          "transition-all duration-150",
          !isDragging && "group-hover:-translate-y-2 group-hover:scale-110 group-hover:shadow-[0_8px_20px_rgba(0,0,0,0.55)]",
          active
            ? "bg-[var(--accent)] text-white ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-raised)]"
            : "text-[var(--text-secondary)] bg-[var(--surface-overlay)]"
        )}
      >
        {iconUrl || (srv.icon ?? "").startsWith("http") || (srv.icon ?? "").startsWith("data:")
          ? <img src={iconUrl || srv.icon} alt="" className="h-full w-full object-cover" />
          : <span className="text-xs font-bold leading-none select-none">{srv.icon}</span>
        }
      </button>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
        {srv.name}{serverLevel === "mute" ? " · muted" : serverLevel === "mentions" ? " · mentions only" : ""}
      </div>

      {/* Server-wide notification state badge */}
      {serverLevel !== "all" && (
        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)]">
          {serverLevel === "mute" ? <BellOff size={8} /> : <AtSign size={8} />}
        </span>
      )}

      {/* Right-click: per-user server-wide notification default */}
      {notifMenu && (
        <ContextMenu
          x={notifMenu.x}
          y={notifMenu.y}
          onClose={() => setNotifMenu(null)}
          items={[
            { label: "All messages", icon: <Bell size={14} />, onClick: () => setNotifPref(serverKey, "all") },
            { label: "Mentions only", icon: <AtSign size={14} />, onClick: () => setNotifPref(serverKey, "mentions") },
            { label: serverLevel === "mute" ? "Unmute server" : "Mute server", icon: <BellOff size={14} />, onClick: () => setNotifPref(serverKey, serverLevel === "mute" ? "all" : "mute") },
          ]}
        />
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-6 w-px flex-shrink-0 bg-[var(--border)] mx-1" />;
}

function BarBtn({
  children, icon, label, active, unread, onClick,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  unread?: number;
  onClick: () => void;
}) {
  return (
    <div className="group relative flex-shrink-0">
      <button
        onClick={onClick}
        title={label}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 overflow-hidden",
          active
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
        )}
      >
        {icon ?? children}
        {!!unread && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
        {label}
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, onClick, danger }: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors",
        danger
          ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
      )}
    >
      {icon}{label}
    </button>
  );
}

type SrvEntry = { id: string; name: string; icon: string; online?: number };

function ServerCard({ srv, onSelect }: { srv: SrvEntry; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] text-left transition-all hover:border-[var(--accent)] hover:scale-[1.02] active:scale-[0.99]"
      style={{ background: "var(--surface)" }}
    >
      <div className="relative flex h-[90px] items-center justify-center overflow-hidden" style={{ background: "var(--surface-overlay)" }}>
        {(srv.icon ?? "").startsWith("http") || (srv.icon ?? "").startsWith("data:")
          ? <img src={srv.icon} alt="" className="h-full w-full object-cover" />
          : <span className="text-3xl select-none">{srv.icon}</span>}
        {srv.online !== undefined && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[11px] text-white">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
            {srv.online} online
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{srv.name}</p>
      </div>
    </button>
  );
}

function ServerGridModal({
  realServers, onServerSelect, onCreateServer, onClose,
}: {
  realServers: SrvEntry[];
  onServerSelect: (id: string) => void;
  onCreateServer: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[998] flex items-end justify-center pb-[60px]" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-xl rounded-2xl border border-[var(--border)] p-5 shadow-2xl"
        style={{ background: "var(--surface-raised)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Servers</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* My servers (real) */}
        {realServers.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">My Servers</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {realServers.map((srv) => (
                <ServerCard key={srv.id} srv={srv} onSelect={() => onServerSelect(srv.id)} />
              ))}
            </div>
          </>
        )}

        {realServers.length === 0 && (
          <p className="mb-3 text-center text-xs text-[var(--text-muted)]">
            You're not in any servers yet. Create one to get started.
          </p>
        )}

        {/* Create server CTA */}
        <button
          onClick={onCreateServer}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--accent)] py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
        >
          <Plus size={15} /> Create a Server
        </button>
      </div>
    </div>
  );
}

function TrashToastBar() {
  const [width, setWidth] = useState(100);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(0));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className="absolute bottom-0 left-0 h-0.5 bg-[var(--accent)] opacity-50"
      style={{ width: `${width}%`, transition: "width 5s linear" }}
    />
  );
}
