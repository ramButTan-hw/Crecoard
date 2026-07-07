"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Shield, Crown, Eye, Edit3, X, Settings, ZoomIn, ZoomOut, Grid3X3, UserPlus, Copy, Check, Link2, Upload, RotateCcw, Minus, Square, MoreVertical } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/ContextMenu";
import { useServers } from "@/contexts/ServersContext";
import { usePresence } from "@/contexts/PresenceContext";
import { useBoardSync } from "@/contexts/BoardSyncContext";
import { cn } from "@/lib/utils";
import { useBoardStore } from "@/store/boardStore";
import { useServerBoard, useServerDraftData, useCanInviteMembers, useCanManageMembers } from "@/contexts/ServerBoardContext";
import type { MemberRole, ServerMember } from "@/types/server";
import { ServerSettings } from "./ServerSettings";
import { getSelfIdentity } from "@/lib/collaboration";
import type { ViewableUser } from "@/components/shell/UserProfileModal";

/** True when an avatar value is an image (URL or data URI) rather than an initial. */
function isImageAvatar(a: string | undefined): a is string {
  return !!a && (a.startsWith("http") || a.startsWith("data:"));
}

interface ServerBoardHeaderProps {
  serverId: string;
  serverName: string;
  serverIcon: string;
  description: string;
  memberCount: number;
  onlineCount: number;
  viewerRole: MemberRole;
  members: ServerMember[];
  showMembers: boolean;
  onToggleMembers: () => void;
  onViewProfile?: (u: ViewableUser) => void;
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner:  "text-yellow-400",
  admin:  "text-[var(--accent)]",
  member: "text-[var(--text-muted)]",
};

const ROLE_ICONS: Record<MemberRole, React.ReactNode> = {
  owner:  <Crown  size={12} />,
  admin:  <Shield size={12} />,
  member: <Eye    size={12} />,
};

export function ServerBoardHeader({
  serverId, serverName, serverIcon, description,
  memberCount, onlineCount, viewerRole,
  members, showMembers, onToggleMembers, onViewProfile,
}: ServerBoardHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const isMobile = useIsMobile();
  const [mobileMenu, setMobileMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setIsDesktop(!!window.electron);
    window.electron?.isWindowMaximized?.().then(setWindowMaximized).catch(() => {});
  }, []);

  const { leaveServer } = useServers();
  const { myStatus, setMyStatus } = usePresence();

  const canEdit = viewerRole === "owner" || viewerRole === "admin";
  const canInviteMembers = useCanInviteMembers();
  const canManageMembers = useCanManageMembers();

  const { editBoard, activeBoardId, showGrid, zoom, toggleGrid, zoomAtCanvasCenter } = useBoardStore();
  const serverDraft = useServerDraftData();
  const isFinished = serverDraft?.isFinished ?? false;
  const { boardId: serverBoardId, viewerId, isDraftMode, hasLiveVersion, onToggleMode, onPublish } = useServerBoard();

  const { revertDraftToLive } = useBoardSync();
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [reverting, setReverting] = useState(false);
  const handleRevert = async () => {
    if (!serverBoardId) return;
    setReverting(true);
    await revertDraftToLive(serverBoardId, serverId);
    setReverting(false);
    setConfirmRevert(false);
  };

  return (
    <>
      <div
        className={cn("flex h-11 flex-shrink-0 items-center gap-3 border-b border-[var(--border)] px-4", isDesktop && "select-none")}
        style={{ background: "var(--surface-raised)", position: "relative", zIndex: 2, ...(isDesktop ? { WebkitAppRegion: "drag" } as React.CSSProperties : {}) }}
      >
        {/* Server identity */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-overlay)] text-sm font-bold select-none">
            {(serverIcon ?? "").startsWith("http") || (serverIcon ?? "").startsWith("data:")
              ? <img src={serverIcon} alt="" className="h-full w-full object-cover" />
              : serverIcon}
          </span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{serverName}</span>
        </div>

        {description && !isMobile && (
          <>
            <div className="h-4 w-px flex-shrink-0 bg-[var(--border)]" />
            <span className="truncate text-xs text-[var(--text-muted)] max-w-[260px]">{description}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-2" style={isDesktop ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
          {isMobile ? (
            <>
              {/* Compact mobile controls: mode chip, Publish, everything else in ⋯ */}
              <span
                className={cn(
                  "select-none rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide",
                  canEdit && isDraftMode
                    ? "bg-[var(--surface-overlay)] text-[var(--text-muted)]"
                    : "bg-green-500/20 text-green-400",
                )}
              >
                {canEdit && isDraftMode ? "DRAFT" : "LIVE"}
              </span>
              {canEdit && isDraftMode && (
                <button
                  onClick={onPublish}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-semibold text-white active:opacity-80 transition-all shadow-sm"
                >
                  <Upload size={11} /> Publish
                </button>
              )}
              <button
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMobileMenu((cur) => (cur ? null : { x: Math.max(8, r.right - 200), y: r.bottom + 6 }));
                }}
                title="More"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] active:bg-[var(--surface-overlay)] transition-colors"
              >
                <MoreVertical size={16} />
              </button>
            </>
          ) : (
          <>
          {/* Draft/Live controls */}
          {canEdit ? (
            <>
              <span
                className={cn(
                  "select-none rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide",
                  isDraftMode
                    ? "bg-[var(--surface-overlay)] text-[var(--text-muted)]"
                    : "bg-green-500/20 text-green-400",
                )}
              >
                {isDraftMode ? "DRAFT" : "LIVE"}
              </span>
              {isDraftMode ? (
                <>
                  <button
                    onClick={onToggleMode}
                    title={hasLiveVersion ? "Preview live version" : "No publish yet"}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Eye size={11} /> {hasLiveVersion ? "Preview Live" : "No live yet"}
                  </button>
                  {hasLiveVersion && (
                    confirmRevert ? (
                      <button
                        onClick={handleRevert}
                        disabled={reverting}
                        title="Discard draft changes and reset to the live version"
                        className="flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw size={11} /> {reverting ? "Reverting…" : "Discard draft?"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmRevert(true)}
                        title="Reset the draft to a copy of the live version"
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <RotateCcw size={11} /> Revert
                      </button>
                    )
                  )}
                  <button
                    onClick={onPublish}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 transition-all shadow-sm"
                  >
                    <Upload size={11} /> Publish
                  </button>
                </>
              ) : (
                <button
                  onClick={onToggleMode}
                  className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <Edit3 size={11} /> Back to Draft
                </button>
              )}
              <div className="h-4 w-px bg-[var(--border)]" />
            </>
          ) : (
            <>
              <span className="select-none rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide bg-green-500/20 text-green-400">
                LIVE
              </span>
              <div className="h-4 w-px bg-[var(--border)]" />
            </>
          )}

          {/* View controls: zoom, grid */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => zoomAtCanvasCenter(zoom - 0.25)}
              title="Zoom out"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ZoomOut size={13} />
            </button>
            <button
              onClick={() => zoomAtCanvasCenter(1)}
              title="Reset zoom"
              className="min-w-[38px] text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-1 h-6 rounded hover:bg-[var(--surface-overlay)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => zoomAtCanvasCenter(zoom + 0.25)}
              title="Zoom in"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ZoomIn size={13} />
            </button>
          </div>
          <button
            onClick={() => toggleGrid()}
            title={showGrid ? "Hide grid" : "Show grid"}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              showGrid
                ? "text-[var(--accent)] bg-[var(--surface-overlay)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
            )}
          >
            <Grid3X3 size={13} />
          </button>
          <div className="h-4 w-px bg-[var(--border)]" />

          {/* Finding #10 — Consolidated member toggle: only the "N online" button.
              The UserCircle2 icon button has been removed. */}
          <button
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
            onClick={onToggleMembers}
            title="Members"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            {onlineCount} online
            <Users size={12} />
          </button>

          {/* Locking is a personal-board concept — server boards already have
              draft/publish, and a third state only confused people. Offer only
              the recovery path for boards locked before this was removed. */}
          {canEdit && isDraftMode && isFinished && (
            <>
              <div className="h-4 w-px bg-[var(--border)]" />
              <button
                onClick={() => editBoard(serverBoardId ?? activeBoardId)}
                title="This board was locked with the old Finish button — unlock to edit"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-overlay)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
              >
                <Edit3 size={12} /> Unlock board
              </button>
            </>
          )}

          {/* Settings — admins/owners only */}
          {canEdit && (
            <button
              onClick={() => setShowSettings(true)}
              title="Server settings"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Settings size={15} />
            </button>
          )}
          </>
          )}

          {/* Window controls — desktop app is frameless, so it needs its own */}
          {isDesktop && (
            <div className="ml-1 flex items-center gap-1 border-l border-[var(--border)] pl-1.5">
              <button onClick={() => window.electron?.minimizeWindow()} title="Minimize"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
                <Minus size={14} />
              </button>
              <button onClick={async () => {
                const maximized = await window.electron?.toggleMaximizeWindow();
                if (typeof maximized === "boolean") setWindowMaximized(maximized);
              }} title={windowMaximized ? "Restore" : "Maximize"}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
                <Square size={12} />
              </button>
              <button onClick={() => window.electron?.closeWindow()} title="Close"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-red-500/15 hover:text-red-400 transition-colors">
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile overflow menu — draft tools, members, grid, settings */}
      {mobileMenu && (
        <ContextMenu
          x={mobileMenu.x}
          y={mobileMenu.y}
          onClose={() => setMobileMenu(null)}
          items={[
            ...(canEdit ? (isDraftMode ? [
              {
                label: hasLiveVersion ? "Preview live version" : "No live version yet",
                icon: <Eye size={14} />,
                disabled: !hasLiveVersion,
                onClick: () => { if (hasLiveVersion) onToggleMode(); },
              },
              ...(hasLiveVersion ? [{
                label: "Revert draft to live…",
                icon: <RotateCcw size={14} />,
                danger: true,
                onClick: () => {
                  if (window.confirm("Discard draft changes and reset to the live version?")) void handleRevert();
                },
              }] : []),
              ...(isFinished ? [{
                label: "Unlock board",
                icon: <Edit3 size={14} />,
                onClick: () => editBoard(serverBoardId ?? activeBoardId),
              }] : []),
              "separator" as const,
            ] : [
              { label: "Back to draft", icon: <Edit3 size={14} />, onClick: onToggleMode },
              "separator" as const,
            ]) : []),
            { label: `Members — ${onlineCount} online`, icon: <Users size={14} />, onClick: onToggleMembers },
            { label: showGrid ? "Hide grid" : "Show grid", icon: <Grid3X3 size={14} />, onClick: () => toggleGrid() },
            ...(canEdit ? [
              "separator" as const,
              { label: "Server settings", icon: <Settings size={14} />, onClick: () => setShowSettings(true) },
            ] : []),
          ] satisfies ContextMenuEntry[]}
        />
      )}

      {/* Members flyout panel — triggered only via onToggleMembers (the "N online" button) */}
      {showMembers && (
        <>
          <div className="fixed inset-0 z-[48]" onClick={onToggleMembers} />
          <div
            className="absolute right-4 top-11 z-[49] w-[220px] rounded-xl border border-[var(--border)] shadow-2xl"
            style={{ background: "var(--surface-raised)" }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Members · {memberCount}</span>
              <button onClick={() => { setConfirmLeave(false); onToggleMembers(); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={13} />
              </button>
            </div>

            {/* Your live status */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
              {([
                ["online", "Online", "bg-green-500"],
                ["dnd", "DND", "bg-red-500"],
                ["offline", "Offline", "bg-[var(--text-muted)]"],
              ] as const).map(([val, lbl, dot]) => (
                <button
                  key={val}
                  onClick={() => setMyStatus(val)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                    myStatus === val
                      ? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)]/60 hover:text-[var(--text-secondary)]"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", dot)} />
                  {lbl}
                </button>
              ))}
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {canInviteMembers && (
                <button
                  onClick={() => { setShowInvite(true); onToggleMembers(); }}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <UserPlus size={12} /> Invite People
                </button>
              )}
              <MemberSection label="Online" serverId={serverId} members={members.filter((m) => m.online)} viewerId={viewerId} canManageMembers={canManageMembers} onViewProfile={onViewProfile} />
              <MemberSection label="Offline" serverId={serverId} members={members.filter((m) => !m.online)} viewerId={viewerId} canManageMembers={canManageMembers} onViewProfile={onViewProfile} />

              {/* Leave server */}
              <div className="mt-2 pt-2 border-t border-[var(--border)]">
                {viewerRole === "owner" ? (
                  <p className="px-2 py-1 text-[11px] text-[var(--text-muted)]">
                    Transfer ownership to leave
                  </p>
                ) : confirmLeave ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="text-[11px] text-[var(--text-muted)] flex-1">Leave {serverName}?</span>
                    <button
                      onClick={async () => { await leaveServer(serverId); onToggleMembers(); }}
                      className="rounded px-2 py-1 text-[11px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      Leave
                    </button>
                    <button
                      onClick={() => setConfirmLeave(false)}
                      className="rounded px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmLeave(true)}
                    className="w-full text-left px-2 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Leave Server
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Server settings modal */}
      {showSettings && (
        <ServerSettings serverId={serverId} onClose={() => setShowSettings(false)} />
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal serverId={serverId} serverName={serverName} onClose={() => setShowInvite(false)} />
      )}
    </>
  );
}

function InviteModal({ serverId, serverName, onClose }: { serverId: string; serverName: string; onClose: () => void }) {
  const { generateInvite } = useServers();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void (async () => {
      const link = await generateInvite(serverId);
      setInviteLink(link);
      setLinkLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const handleCopy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (!email.trim()) return;
    setSent(true);
    setTimeout(() => { setSent(false); setEmail(""); }, 2000);
  };

  return typeof document !== "undefined" ? createPortal(
    <>
      <div className="fixed inset-0 z-[1010] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed z-[1011] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[95vw] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden"
        style={{ background: "var(--surface-raised)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Invite to {serverName}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Share a link or send an email invite</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Invite link */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Invite Link</p>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <Link2 size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
              <span className="flex-1 truncate font-mono text-xs text-[var(--text-secondary)]">
                {linkLoading ? "Generating link…" : (inviteLink ?? "Failed to generate link")}
              </span>
              <button
                onClick={handleCopy}
                disabled={!inviteLink}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-40",
                  copied
                    ? "bg-green-500/20 text-green-400"
                    : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                )}
              >
                {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Link expires in 7 days · Max 10 uses</p>
          </div>

          {/* Email invite */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Send Email Invite</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] outline-none transition-colors"
              />
              <button
                onClick={handleSend}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-colors flex-shrink-0",
                  sent
                    ? "bg-green-500/20 text-green-400"
                    : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                )}
              >
                {sent ? "Sent!" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  ) : null;
}

function MemberSection({ label, serverId, members, viewerId, canManageMembers, onViewProfile }: {
  label: string; serverId: string; members: ServerMember[]; viewerId: string; canManageMembers: boolean;
  onViewProfile?: (u: ViewableUser) => void;
}) {
  const { updateMemberRole, kickMember, updateMemberRoleIds, serverRoles } = useServers();
  // The manage menu is portalled to <body> and positioned from this anchor rect,
  // so it can't be clipped by the members panel's own scroll overflow.
  const [menuFor, setMenuFor] = useState<{ id: string; rect: DOMRect } | null>(null);
  const customRoles = (serverRoles[serverId] ?? []).filter((r) => !r.isDefault);
  if (members.length === 0) return null;

  const buildViewableUser = (m: ServerMember): ViewableUser => {
    if (m.userId === viewerId) {
      const self = getSelfIdentity();
      return {
        displayName: self.displayName,
        avatarChar: self.displayName[0]?.toUpperCase() ?? "Y",
        avatarUrl: self.avatarUrl,
        bannerUrl: self.bannerUrl,
        color: self.color,
        online: true,
        status: self.status,
        statusEmoji: self.statusEmoji,
        pronouns: self.pronouns,
        profileBlocks: self.profileBoard?.blocks,
        profileBoardBg: self.profileBoard?.bg,
        profileBoardBgImage: self.profileBoard?.bgImage,
      };
    }
    // m.avatar holds either an image URL or a single initial. For URLs, surface
    // it as avatarUrl so the profile modal renders the image instead of printing
    // the raw link as the "avatar character".
    const avatarIsImage = isImageAvatar(m.avatar);
    return {
      displayName: m.username,
      avatarChar: avatarIsImage ? (m.username[0]?.toUpperCase() ?? "?") : m.avatar,
      avatarUrl: avatarIsImage ? m.avatar : undefined,
      bannerUrl: m.banner,
      color: "#d59ee8",
      online: m.online,
      status: m.status,
      userId: m.userId,
    };
  };

  return (
    <>
      <p className="mt-2 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label} — {members.length}
      </p>
      {members.map((m) => {
        const canManage = canManageMembers && m.userId !== viewerId && m.role !== "owner";
        return (
          <div key={m.userId} className="relative">
            <button
              className="group w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-overlay)] transition-colors text-left"
              onClick={(e) => {
                if (!canManage) { onViewProfile?.(buildViewableUser(m)); return; }
                // Capture the rect synchronously — React nulls e.currentTarget
                // once this handler returns, before the setState updater runs.
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuFor((cur) => (cur?.id === m.userId ? null : { id: m.userId, rect }));
              }}
            >
              <div className="relative flex-shrink-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white overflow-hidden">
                  {isImageAvatar(m.avatar)
                    ? <img src={m.avatar} alt="" className="h-full w-full object-cover" />
                    : (m.avatar || m.username[0]?.toUpperCase())}
                </span>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-raised)]",
                  m.presence === "dnd" ? "bg-red-500" : m.online ? "bg-green-500" : "bg-[var(--text-muted)]"
                )} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">{m.username}</p>
                {m.status && <p className="truncate text-[11px] text-[var(--text-muted)]">{m.status}</p>}
              </div>
              {m.userId === viewerId ? (
                <span className="ml-auto text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent)]/10 rounded px-1.5 py-0.5">You</span>
              ) : (
                <span className={cn("text-[11px]", ROLE_COLORS[m.role])}>{m.role === "owner" ? "👑" : m.role === "admin" ? "🛡" : ""}</span>
              )}
            </button>

            {canManage && menuFor?.id === m.userId && createPortal((() => {
              const rect = menuFor.rect;
              const MENU_W = 224;
              const left = Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8));
              const openUp = rect.bottom > window.innerHeight - 260;
              const pos = openUp
                ? { left, bottom: window.innerHeight - rect.top + 4 }
                : { left, top: rect.bottom + 4 };
              return (
              <>
                <div className="fixed inset-0 z-[1200]" onClick={() => setMenuFor(null)} />
                <div className="fixed z-[1201] w-56 max-h-[70vh] overflow-y-auto rounded-lg border border-[var(--border)] shadow-2xl" style={{ background: "var(--surface-raised)", ...pos }}>
                  {/* Profile card header — banner + avatar, so the menu reads as a mini profile */}
                  <div
                    className="relative h-14 w-full rounded-t-lg"
                    style={{
                      background: m.banner ? undefined : "linear-gradient(135deg, color-mix(in srgb, var(--accent) 65%, transparent), color-mix(in srgb, var(--accent) 12%, transparent))",
                      backgroundImage: m.banner ? `url(${m.banner})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <span
                      className="absolute -bottom-4 left-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-[3px] text-sm font-bold text-white"
                      style={{ background: "var(--accent)", borderColor: "var(--surface-raised)" }}
                    >
                      {isImageAvatar(m.avatar)
                        ? <img src={m.avatar} alt="" className="h-full w-full object-cover" />
                        : (m.avatar || m.username[0]?.toUpperCase())}
                      <span className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--surface-raised)]",
                        m.presence === "dnd" ? "bg-red-500" : m.online ? "bg-green-500" : "bg-[var(--text-muted)]"
                      )} />
                    </span>
                  </div>
                  <div className="px-2.5 pt-5 pb-2">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{m.username}</p>
                      <span className="text-[11px]">{m.role === "owner" ? "👑" : m.role === "admin" ? "🛡" : ""}</span>
                    </div>
                    {m.status && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{m.status}</p>}
                    {customRoles.some((r) => (m.roleIds ?? []).includes(r.id)) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {customRoles.filter((r) => (m.roleIds ?? []).includes(r.id)).map((r) => (
                          <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
                            {r.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mx-1 h-px bg-[var(--border)]" />
                  <div className="p-1">
                  <button onClick={() => { onViewProfile?.(buildViewableUser(m)); setMenuFor(null); }} className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">View profile</button>
                  {m.role !== "admin" && (
                    <button onClick={() => { void updateMemberRole(serverId, m.userId, "admin"); setMenuFor(null); }} className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">Make admin</button>
                  )}
                  {m.role !== "member" && (
                    <button onClick={() => { void updateMemberRole(serverId, m.userId, "member"); setMenuFor(null); }} className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">Make member</button>
                  )}
                  {customRoles.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-[var(--border)]" />
                      <p className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Roles</p>
                      {customRoles.map((r) => {
                        const has = (m.roleIds ?? []).includes(r.id);
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              const next = has
                                ? (m.roleIds ?? []).filter((id) => id !== r.id)
                                : [...(m.roleIds ?? []), r.id];
                              void updateMemberRoleIds(serverId, m.userId, next);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                            <span className="flex-1 truncate">{r.name}</span>
                            {has && <Check size={12} className="text-[var(--accent)]" />}
                          </button>
                        );
                      })}
                    </>
                  )}
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button onClick={() => { void kickMember(serverId, m.userId); setMenuFor(null); }} className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors">Kick from server</button>
                  </div>
                </div>
              </>
              );
            })(), document.body)}
          </div>
        );
      })}
    </>
  );
}

