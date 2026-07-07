"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Edit2, Camera, Upload, Check, Crown, Activity, Eye, RotateCcw, Archive, Save, Zap, Copy, RefreshCw, Bot } from "lucide-react";
import { BotsPanel } from "@/components/server/BotsPanel";
import { logServerAction, fetchServerPublishes, formatRelativeTime } from "@/lib/serverAudit";
import type { PublishEntry } from "@/lib/serverAudit";
import { useBoardSync } from "@/contexts/BoardSyncContext";
import { ImageCropModal } from "@/components/shell/ImageCropModal";

function loadServerStorage(serverId: string) {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(`plancraft-server-${serverId}`) ?? "null") as { iconUrl?: string; name?: string; description?: string } | null; } catch { return null; }
}
function saveServerStorage(serverId: string, data: { iconUrl?: string; name: string; description: string }) {
  localStorage.setItem(`plancraft-server-${serverId}`, JSON.stringify(data));
}
import { cn } from "@/lib/utils";
import { useBoardStore } from "@/store/boardStore";
import { useUser } from "@/contexts/UserContext";
import { uploadFile, uploadDataUrl } from "@/lib/storage";
import { useServerBoard, useServerBoardData } from "@/contexts/ServerBoardContext";
import { useServers } from "@/contexts/ServersContext";
import { WallpaperEditor } from "@/components/ui/WallpaperEditor";
import { MOCK_SERVERS, MOCK_SERVER_MEMBERS } from "@/lib/mockServerData";
import { PRESET_THEMES, BG_FILTERS, type ThemeVarMap } from "@/lib/appThemes";
import type { ServerRole, MemberRole, ServerBackup } from "@/types/server";

interface ServerSettingsProps {
  serverId: string;
  onClose: () => void;
}

type Tab = "overview" | "appearance" | "roles" | "members" | "audit" | "backups" | "webhooks" | "bots";

const COLOR_KEYS: { key: keyof ThemeVarMap; label: string }[] = [
  { key: "surface",        label: "Surface" },
  { key: "surfaceRaised",  label: "Panels" },
  { key: "surfaceOverlay", label: "Overlay" },
  { key: "sidebar",        label: "Sidebar" },
  { key: "accent",         label: "Accent" },
  { key: "accentHover",    label: "Acc. Hover" },
  { key: "border",         label: "Border" },
  { key: "textPrimary",    label: "Text" },
  { key: "textSecondary",  label: "Text 2" },
  { key: "textMuted",      label: "Muted" },
];

const PERMISSION_LABELS: Array<{ key: keyof ServerRole["permissions"]; label: string }> = [
  { key: "canViewBoard",            label: "View board" },
  { key: "canEditBoard",            label: "Edit board" },
  { key: "canUploadFiles",          label: "Upload files" },
  { key: "canManageMembers",        label: "Manage members" },
  { key: "canInviteMembers",        label: "Invite members" },
  { key: "canViewPublishHistory",   label: "View publish history" },
  { key: "canRollback",             label: "Roll back versions" },
  { key: "canManageBackups",        label: "Manage backups" },
];

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: "text-yellow-400",
  admin: "text-[var(--accent)]",
  member: "text-[var(--text-muted)]",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ServerSettings({ serverId, onClose }: ServerSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const themeBgFileRef = useRef<HTMLInputElement>(null);

  const { updateBoard, setBoardTheme, clearBoardTheme, themeVars } = useBoardStore();
  const { identity } = useUser();
  const { servers, serverMembers, serverRoles: savedRolesMap, refreshMembers, updateServer, updateServerRoles, leaveServer, deleteServer, transferOwnership, kickMember, updateMemberRole } = useServers();
  const { viewerRole: myRole, viewerId: myUserId } = useServerBoard();
  const { boardId } = useServerBoard();
  const myUsername = identity.displayName ?? "Unknown";
  const currentBoard = useServerBoardData();

  const isReal = UUID_RE.test(serverId);
  const mockServer = MOCK_SERVERS.find((s) => s.id === serverId);
  const realServer = isReal ? servers.find((s) => s.id === serverId) : undefined;
  // Unified display source — real server wins over mock
  const server = realServer ?? mockServer;

  // Real server members (loaded via context); mock servers use static data
  const mockMembers = MOCK_SERVER_MEMBERS[serverId] ?? [];
  const members = isReal ? (serverMembers[serverId] ?? []) : mockMembers;

  // Load real server members on mount (force refresh to pick up recent changes)
  useEffect(() => {
    if (isReal) void refreshMembers(serverId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, isReal]);

  // For real servers the icon field may be an emoji ("🎮") or a Storage URL.
  // We track them separately so removing an uploaded image reverts to the emoji.
  const iconEmoji = (() => {
    const ic = realServer?.icon ?? mockServer?.icon ?? "🌐";
    return ic.startsWith("http") ? "🌐" : ic;
  })();

  // Overview local state
  const [nameValue, setNameValue] = useState(() =>
    isReal ? (realServer?.name ?? "") : (loadServerStorage(serverId)?.name ?? server?.name ?? "")
  );
  const [descValue, setDescValue] = useState(() =>
    isReal ? (realServer?.description ?? "") : (loadServerStorage(serverId)?.description ?? server?.description ?? "")
  );
  const [iconUrl, setIconUrl] = useState<string | undefined>(() => {
    if (isReal) {
      const ic = realServer?.icon;
      return ic?.startsWith("http") ? ic : undefined;
    }
    return loadServerStorage(serverId)?.iconUrl;
  });
  const [iconCropSrc, setIconCropSrc] = useState<string | null>(null);
  const [savedOverview, setSavedOverview] = useState(false);
  const [activityChannelValue, setActivityChannelValue] = useState(() => realServer?.activityChannel ?? "general");
  const iconFileRef = useRef<HTMLInputElement>(null);

  // Chat channels available on the server board, for the activity-channel picker.
  const activityChannelOptions = (() => {
    const set = new Set<string>(["general", activityChannelValue]);
    (currentBoard?.chatChannels ?? []).forEach((c) => set.add(c));
    currentBoard?.boxes?.forEach((box) => box.items?.forEach((it) => { if (it.type === "chat") set.add(it.chatChannelName ?? "general"); }));
    currentBoard?.boardItems?.forEach((it) => { if (it.type === "chat") set.add(it.chatChannelName ?? "general"); });
    return [...set];
  })();

  const handleSaveOverview = async () => {
    let finalIconUrl = iconUrl;
    if (iconUrl?.startsWith("data:")) {
      const url = await uploadDataUrl(iconUrl, identity.userId, "server-icons", "icon.png");
      if (url) finalIconUrl = url;
    }
    if (isReal) {
      await updateServer(serverId, {
        name: nameValue,
        description: descValue,
        icon: finalIconUrl ?? iconEmoji,
        activityChannel: activityChannelValue,
      });
      if (finalIconUrl !== iconUrl) setIconUrl(finalIconUrl);
      void logServerAction(serverId, myUserId, myUsername, "server_updated", { name: nameValue });
    } else {
      saveServerStorage(serverId, { iconUrl: finalIconUrl, name: nameValue, description: descValue });
      window.dispatchEvent(new CustomEvent("plancraft-server-updated", { detail: { serverId } }));
    }
    setSavedOverview(true);
    setTimeout(() => setSavedOverview(false), 2000);
  };

  // Roles local state
  const [roles, setRoles] = useState<ServerRole[]>(() => savedRolesMap[serverId] ?? server?.roles ?? []);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [savedRoles, setSavedRoles] = useState(false);

  async function handleSaveRoles() {
    await updateServerRoles(serverId, roles);
    setSavedRoles(true);
    setTimeout(() => setSavedRoles(false), 2000);
  }

  // Confirmation state for destructive member actions
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!server && !realServer) return null;
  const displayServer = server ?? realServer!;

  // Permission helpers — owners/admins always allowed; members check default role
  const defaultRolePerms = displayServer?.roles?.find((r) => r.isDefault)?.permissions;
  const canViewPublishHistory = myRole === "owner" || myRole === "admin" || (defaultRolePerms?.canViewPublishHistory ?? false);
  const canRollbackAction     = myRole === "owner" || myRole === "admin" || (defaultRolePerms?.canRollback ?? false);
  const canManageBackupsAction = myRole === "owner" || myRole === "admin" || (defaultRolePerms?.canManageBackups ?? false);

  // Appearance helpers
  const boardVars: ThemeVarMap = currentBoard?.boardThemeVars ?? themeVars;
  const hasBoardTheme = !!currentBoard?.boardThemeVars;

  const upd = (patch: Parameters<typeof updateBoard>[1]) => { if (boardId) updateBoard(boardId, patch); };

  const bgColor        = currentBoard?.backgroundColor ?? "#1a1b1e";
  const bgOpacity      = currentBoard?.backgroundOpacity ?? 1;
  const bgSize         = currentBoard?.backgroundSize ?? "cover";
  const bgPosition     = currentBoard?.backgroundPosition ?? "center";
  const bgFilter       = currentBoard?.backgroundFilter ?? "";
  const overlayColor   = currentBoard?.backgroundOverlayColor ?? "#000000";
  const overlayOpacity = currentBoard?.backgroundOverlayOpacity ?? 0;

  const themeBgColor   = currentBoard?.themeBgColor ?? "#0f1014";
  const themeBgOpacity = currentBoard?.themeBgOpacity ?? 1;
  const themeBgSize    = currentBoard?.themeBgSize ?? "cover";

  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      upd({ backgroundImage: dataUrl });
      void uploadFile(file, identity.userId, "themes", file.name).then((url) => {
        if (url) upd({ backgroundImage: url });
      });
    };
    reader.readAsDataURL(file);
  };

  const handleThemeBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      upd({ themeBgImage: dataUrl });
      void uploadFile(file, identity.userId, "themes", file.name).then((url) => {
        if (url) upd({ themeBgImage: url });
      });
    };
    reader.readAsDataURL(file);
  };

  // Roles helpers
  function handleAddRole() {
    const newRole: ServerRole = {
      id: `role-custom-${Date.now()}`,
      name: "New Role",
      color: "#6366f1",
      permissions: {
        canViewBoard: true,
        canEditBoard: false,
        canUploadFiles: false,
        canManageRoles: false,
        canManageMembers: false,
        canInviteMembers: false,
        canViewPublishHistory: false,
        canRollback: false,
        canManageBackups: false,
      },
    };
    setRoles((prev) => [...prev, newRole]);
    setEditingRoleId(newRole.id);
  }

  function handleDeleteRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id));
    if (editingRoleId === id) setEditingRoleId(null);
  }

  function patchRole(id: string, patch: Partial<ServerRole>) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function patchRolePermission(id: string, key: keyof ServerRole["permissions"], value: boolean) {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, permissions: { ...r.permissions, [key]: value } } : r
      )
    );
  }

  const NAV_ITEMS: { id: Tab; label: string; icon?: React.ReactNode }[] = [
    { id: "overview",   label: "Overview" },
    { id: "appearance", label: "Appearance" },
    { id: "roles",      label: "Roles" },
    { id: "members",    label: "Members" },
    { id: "audit",      label: "Publish History", icon: <Activity size={13} /> },
    { id: "backups",    label: "Backups", icon: <Archive size={13} /> },
    { id: "webhooks",   label: "Webhooks", icon: <Zap size={13} /> },
    { id: "bots",       label: "Bots", icon: <Bot size={13} /> },
  ];

  // Portal to <body> so the overlay escapes the board canvas's transform stacking
  // context — otherwise embed/widget iframes on the canvas paint OVER this modal.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000] bg-black/60" onClick={onClose} />

      <div className="fixed inset-0 z-[1001] flex" style={{ background: "var(--surface)" }}>
        {/* Left nav */}
        <div
          className="w-14 md:w-[220px] flex-shrink-0 border-r border-[var(--border)] flex flex-col p-2 md:p-4 gap-1"
          style={{ background: "var(--sidebar)" }}
        >
          <p className="mb-2 hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] md:block">
            Server Settings
          </p>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:justify-start md:text-left",
                activeTab === item.id
                  ? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)]/50 hover:text-[var(--text-primary)]"
              )}
            >
              {item.icon && <span className="opacity-70">{item.icon}</span>}
              <span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Right content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <button
            onClick={onClose}
            className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={16} />
          </button>

          {/* ── Overview ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="max-w-lg">
              <h2 className="mb-6 text-xl font-bold text-[var(--text-primary)]">Overview</h2>

              {/* Server icon */}
              <div className="mb-6">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Server Icon
                </label>
                <div className="flex items-center gap-4">
                  <div
                    className="relative cursor-pointer group rounded-2xl overflow-hidden flex-shrink-0"
                    style={{ width: 80, height: 80, background: "var(--surface-raised)", border: "1px solid var(--border)" }}
                    onClick={() => iconFileRef.current?.click()}
                  >
                    {iconUrl
                      ? <img src={iconUrl} alt="" className="h-full w-full object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-[var(--text-primary)] select-none">{iconEmoji}</span>
                    }
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Camera size={16} className="text-white" />
                      <span className="text-white text-[11px] font-medium">Change</span>
                    </div>
                    <input
                      ref={iconFileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setIconCropSrc(ev.target?.result as string);
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm text-[var(--text-secondary)]">{nameValue || displayServer.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{displayServer.memberCount} members</p>
                    {iconUrl && (
                      <button
                        onClick={() => setIconUrl(undefined)}
                        className="self-start text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Fields */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Server Name
                  </label>
                  <input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none transition-colors"
                  />
                </div>
                {isReal && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Member activity channel
                    </label>
                    <select
                      value={activityChannelValue}
                      onChange={(e) => setActivityChannelValue(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                    >
                      {activityChannelOptions.map((c) => (
                        <option key={c} value={c}>#{c}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                      Join, leave, and kick messages are posted to this channel.
                    </p>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => void handleSaveOverview()}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                      savedOverview
                        ? "bg-green-500/20 text-green-400"
                        : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                    )}
                  >
                    {savedOverview ? <><Check size={14} /> Saved!</> : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              {isReal && (
                <div className="mt-8 pt-6 border-t border-[var(--border)]">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-red-400">Danger Zone</p>
                  <div className="flex flex-col gap-3">
                    {myRole === "owner" ? (
                      <>
                        <p className="text-xs text-[var(--text-muted)]">
                          You own this server. Transfer ownership in the{" "}
                          <button
                            onClick={() => setActiveTab("members")}
                            className="text-[var(--accent)] hover:underline"
                          >
                            Members tab
                          </button>{" "}
                          before you can leave.
                        </p>
                        {confirmDelete ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">Permanently delete {displayServer.name}?</span>
                            <button
                              onClick={async () => { await deleteServer(serverId); onClose(); }}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(true)}
                            className="self-start rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            Delete Server
                          </button>
                        )}
                      </>
                    ) : confirmLeave ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)]">Leave {displayServer.name}?</span>
                        <button
                          onClick={async () => { await leaveServer(serverId); onClose(); }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                        >
                          Leave
                        </button>
                        <button
                          onClick={() => setConfirmLeave(false)}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmLeave(true)}
                        className="self-start rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Leave Server
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Appearance ───────────────────────────────────────────────── */}
          {activeTab === "appearance" && (
            <div className="max-w-xl flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Appearance</h2>
                {hasBoardTheme && (
                  <button
                    onClick={() => { if (boardId) clearBoardTheme(boardId); }}
                    className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors underline"
                  >
                    Reset to app theme
                  </button>
                )}
              </div>

              {/* Color presets */}
              <div>
                <SectionLabel>Color presets</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_THEMES.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                      if (boardId) setBoardTheme(boardId, preset.vars);
                      if (isReal) void logServerAction(serverId, myUserId, myUsername, "theme_preset_applied", { presetName: preset.name });
                    }}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                    >
                      <span className="h-2.5 w-2.5 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: preset.vars.accent }} />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Individual color pickers */}
              <div>
                <SectionLabel>Colors</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {COLOR_KEYS.map(({ key, label }) => (
                    <ColorPickerRow
                      key={key}
                      label={label}
                      value={boardVars[key]}
                      onChange={(v) => { if (boardId) setBoardTheme(boardId, { ...boardVars, [key]: v }); }}
                    />
                  ))}
                </div>
              </div>

              {/* ── Theme Background (outer — behind canvas) ── */}
              <div className="rounded-lg border border-[var(--border)] p-4 flex flex-col gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  Theme Background <span className="normal-case text-[var(--text-muted)] font-normal tracking-normal">· behind canvas</span>
                </p>

                <div>
                  <SectionLabel>Color</SectionLabel>
                  <div className="flex items-center gap-2.5">
                    <label className="relative h-8 w-12 cursor-pointer overflow-hidden rounded border border-[var(--border)]" style={{ backgroundColor: themeBgColor }}>
                      <input type="color" value={themeBgColor} onChange={(e) => upd({ themeBgColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </label>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{themeBgColor}</span>
                  </div>
                </div>

                <div>
                  <SectionLabel>Image</SectionLabel>
                  <input
                    className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                    placeholder="https://… paste image URL"
                    value={currentBoard?.themeBgImage?.startsWith("data:") ? "" : (currentBoard?.themeBgImage ?? "")}
                    onChange={(e) => upd({ themeBgImage: e.target.value || undefined })}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => themeBgFileRef.current?.click()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Upload size={12} /> Upload file
                    </button>
                    {currentBoard?.themeBgImage && (
                      <button onClick={() => upd({ themeBgImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                  <input ref={themeBgFileRef} type="file" accept="image/*" className="hidden" onChange={handleThemeBgFileUpload} />
                </div>

                {currentBoard?.themeBgImage && (
                  <>
                    <div>
                      <SectionLabel>Size</SectionLabel>
                      <div className="flex gap-1.5">
                        {(["cover", "contain", "auto"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => upd({ themeBgSize: s })}
                            className={cn(
                              "flex-1 rounded border py-1 text-xs capitalize transition-colors",
                              themeBgSize === s
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <SectionLabel>Opacity</SectionLabel>
                        <span className="text-xs text-[var(--text-muted)]">{Math.round(themeBgOpacity * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.01} value={themeBgOpacity} onChange={(e) => upd({ themeBgOpacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent)]" />
                    </div>
                  </>
                )}
              </div>

              {/* ── Board Background (inner — part of canvas) ── */}
              <div className="rounded-lg border border-[var(--border)] p-4 flex flex-col gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  Board Background <span className="normal-case text-[var(--text-muted)] font-normal tracking-normal">· moves with canvas</span>
                </p>

                <div>
                  <SectionLabel>Color</SectionLabel>
                  <div className="flex items-center gap-2.5">
                    <label className="relative h-8 w-12 cursor-pointer overflow-hidden rounded border border-[var(--border)]" style={{ backgroundColor: bgColor }}>
                      <input type="color" value={bgColor} onChange={(e) => upd({ backgroundColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </label>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{bgColor}</span>
                  </div>
                </div>

                <div>
                  <SectionLabel>Wallpaper</SectionLabel>
                  <input
                    className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                    placeholder="https://… paste image URL"
                    value={currentBoard?.backgroundImage?.startsWith("data:") ? "" : (currentBoard?.backgroundImage ?? "")}
                    onChange={(e) => upd({ backgroundImage: e.target.value || undefined })}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => bgFileRef.current?.click()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Upload size={12} /> Upload file
                    </button>
                    {currentBoard?.backgroundImage && (
                      <button onClick={() => upd({ backgroundImage: undefined })} className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                  <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFileUpload} />
                </div>

                {currentBoard?.backgroundImage && (
                  <div className="flex flex-col gap-4">
                    <WallpaperEditor
                      url={currentBoard.backgroundImage}
                      size={bgSize}
                      position={bgPosition}
                      opacity={bgOpacity}
                      backgroundColor={bgColor}
                      onSizeChange={(v) => upd({ backgroundSize: v })}
                      onPositionChange={(v) => upd({ backgroundPosition: v })}
                      onOpacityChange={(v) => upd({ backgroundOpacity: v })}
                    />
                    <div>
                      <SectionLabel>Filter</SectionLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {BG_FILTERS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => upd({ backgroundFilter: f.value })}
                            className={cn(
                              "rounded border px-2.5 py-1 text-xs transition-colors",
                              bgFilter === f.value
                                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <SectionLabel>Color Tint</SectionLabel>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--text-muted)] transition-colors mb-1.5">
                        <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: overlayColor }}>
                          <input type="color" value={overlayColor} onChange={(e) => upd({ backgroundOverlayColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                        </span>
                        <span className="flex-1 text-xs text-[var(--text-secondary)]">Tint color</span>
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">{overlayColor}</span>
                      </label>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-[var(--text-muted)]">Intensity</span>
                        <span className="text-xs text-[var(--text-muted)]">{Math.round(overlayOpacity * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.01} value={overlayOpacity} onChange={(e) => upd({ backgroundOverlayOpacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent)]" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Roles ─────────────────────────────────────────────────────── */}
          {activeTab === "roles" && (
            <div className="max-w-lg">
              <h2 className="mb-6 text-xl font-bold text-[var(--text-primary)]">Roles</h2>

              <div className="flex flex-col gap-2 mb-4">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className="rounded-xl border border-[var(--border)]"
                    style={{ background: "var(--surface-raised)" }}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                      <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{role.name}</span>
                      {role.isDefault && (
                        <span className="text-[11px] text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
                          default
                        </span>
                      )}
                      <button
                        onClick={() => setEditingRoleId(editingRoleId === role.id ? null : role.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      {!role.isDefault && (
                        <button
                          onClick={() => handleDeleteRole(role.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {editingRoleId === role.id && (
                      <div className="border-t border-[var(--border)] px-4 py-4 flex flex-col gap-4">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              Role Name
                            </label>
                            <input
                              value={role.name}
                              onChange={(e) => patchRole(role.id, { name: e.target.value })}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              Color
                            </label>
                            <input
                              type="color"
                              value={role.color}
                              onChange={(e) => patchRole(role.id, { color: e.target.value })}
                              className="h-[34px] w-10 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-0.5"
                            />
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                            Permissions
                          </p>
                          <div className="flex flex-col gap-2">
                            {PERMISSION_LABELS.map(({ key, label }) => (
                              <label key={key} className="flex items-center gap-3 cursor-pointer">
                                <div
                                  onClick={() => patchRolePermission(role.id, key, !role.permissions[key])}
                                  className={cn(
                                    "relative h-4 w-8 rounded-full transition-colors flex-shrink-0 cursor-pointer",
                                    role.permissions[key] ? "bg-[var(--accent)]" : "bg-[var(--surface-overlay)]"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                                      role.permissions[key] ? "translate-x-4" : "translate-x-0.5"
                                    )}
                                  />
                                </div>
                                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddRole}
                className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors w-full justify-center"
              >
                <Plus size={15} /> Create role
              </button>

              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSaveRoles}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                  {savedRoles ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save roles</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Members ───────────────────────────────────────────────────── */}
          {activeTab === "members" && (
            <div className="max-w-lg">
              <h2 className="mb-6 text-xl font-bold text-[var(--text-primary)]">Members</h2>

              <div className="flex flex-col gap-1">
                {members.map((member) => {
                  const isOwnerMember = member.role === "owner";
                  const isMe = member.userId === myUserId;
                  const canModify = isReal && (myRole === "owner" || myRole === "admin") && !isMe && !isOwnerMember;
                  const isKicking = confirmKickId === member.userId;
                  const isTransferring = confirmTransferId === member.userId;

                  return (
                    <div
                      key={member.userId}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--border)]"
                      style={{ background: "var(--surface-raised)" }}
                    >
                      <div className="relative flex-shrink-0">
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white overflow-hidden"
                          style={{ background: "var(--accent)" }}
                        >
                          {member.avatar?.startsWith("http")
                            ? <img src={member.avatar} alt="" className="h-full w-full object-cover" />
                            : member.avatar}
                        </span>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-raised)]",
                            member.online ? "bg-green-500" : "bg-[var(--text-muted)]"
                          )}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {member.username}
                          {isMe && <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">(You)</span>}
                        </p>
                        {member.status && (
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{member.status}</p>
                        )}
                      </div>

                      {/* Role: owner badge or editable select */}
                      {isOwnerMember ? (
                        <span className="text-xs font-semibold text-yellow-400">owner</span>
                      ) : isReal && (myRole === "owner" || myRole === "admin") ? (
                        <select
                          value={member.role}
                          disabled={!canModify}
                          onChange={async (e) => {
                            const newRole = e.target.value as MemberRole;
                            await updateMemberRole(serverId, member.userId, newRole);
                            void logServerAction(serverId, myUserId, myUsername, "member_role_changed", {
                              targetUserId: member.userId,
                              targetUsername: member.username,
                              oldRole: member.role,
                              newRole,
                            });
                          }}
                          className={cn(
                            "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium outline-none disabled:opacity-50",
                            canModify && "cursor-pointer",
                            ROLE_COLORS[member.role]
                          )}
                        >
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                        </select>
                      ) : (
                        <span className={cn("text-xs font-medium", ROLE_COLORS[member.role])}>{member.role}</span>
                      )}

                      {/* Transfer ownership — owner viewer, non-owner/non-self rows only */}
                      {isReal && myRole === "owner" && !isOwnerMember && !isMe && (
                        isTransferring ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => { await transferOwnership(serverId, member.userId); setConfirmTransferId(null); }}
                              className="rounded px-2 py-1 text-[11px] font-semibold bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmTransferId(null)}
                              className="rounded px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setConfirmKickId(null); setConfirmTransferId(member.userId); }}
                            title="Transfer ownership to this member"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-yellow-500/15 hover:text-yellow-400 transition-colors"
                          >
                            <Crown size={13} />
                          </button>
                        )
                      )}

                      {/* Kick — owner/admin viewers, not self, not owner member */}
                      {canModify && (
                        isKicking ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async () => {
                              await kickMember(serverId, member.userId);
                              void logServerAction(serverId, myUserId, myUsername, "member_kicked", {
                                kickedUserId: member.userId,
                                kickedUsername: member.username,
                              });
                              setConfirmKickId(null);
                            }}
                              className="rounded px-2 py-1 text-[11px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            >
                              Kick
                            </button>
                            <button
                              onClick={() => setConfirmKickId(null)}
                              className="rounded px-1.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setConfirmTransferId(null); setConfirmKickId(member.userId); }}
                            title="Kick member"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/15 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Publish History ───────────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div className="max-w-lg">
              <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Publish History</h2>
              <p className="mb-6 text-xs text-[var(--text-muted)]">Every version published to live — like a commit log for your board.</p>
              {isReal
                ? canViewPublishHistory
                  ? <PublishHistoryList serverId={serverId} canRollback={canRollbackAction} />
                  : <p className="text-sm text-[var(--text-muted)]">You don't have permission to view publish history.</p>
                : <p className="text-sm text-[var(--text-muted)]">Publish history is only available for real servers.</p>
              }
            </div>
          )}

          {/* ── Webhooks ──────────────────────────────────────────────────── */}
          {activeTab === "webhooks" && (
            <WebhooksTab boardId={boardId} serverId={serverId} isReal={isReal} />
          )}

          {/* ── Bots ──────────────────────────────────────────────────────── */}
          {activeTab === "bots" && (
            <BotsPanel serverId={serverId} isReal={isReal} />
          )}

          {/* ── Backups ───────────────────────────────────────────────────── */}
          {activeTab === "backups" && (
            <div className="max-w-lg">
              <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Backups</h2>
              <p className="mb-6 text-xs text-[var(--text-muted)]">Up to 3 named snapshots of your draft board. Restoring overwrites the current draft — it doesn't auto-publish.</p>
              {isReal
                ? canManageBackupsAction
                  ? <BackupsTab serverId={serverId} boardId={boardId ?? null} />
                  : <p className="text-sm text-[var(--text-muted)]">You don't have permission to manage backups.</p>
                : <p className="text-sm text-[var(--text-muted)]">Backups are only available for real servers.</p>
              }
            </div>
          )}
        </div>
      </div>

      {iconCropSrc && (
        <ImageCropModal
          src={iconCropSrc}
          shape="rect"
          previewW={280}
          previewH={280}
          outputW={256}
          outputH={256}
          onApply={(url) => { setIconUrl(url); setIconCropSrc(null); }}
          onClose={() => setIconCropSrc(null)}
        />
      )}
    </>,
    document.body
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 hover:border-[var(--text-muted)] transition-colors">
      <span
        className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 shadow-sm overflow-hidden"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="flex-1 text-xs text-[var(--text-secondary)] truncate">{label}</span>
      <span className="font-mono text-[11px] text-[var(--text-muted)] flex-shrink-0">{value}</span>
    </label>
  );
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

type SnapshotBox = {
  id: string;
  title?: string;  // Box interface uses 'title'
  label?: string;  // legacy alias, kept for safety
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

interface DiffResult {
  added: string[];
  removed: string[];
  moved: string[];     // position or size changed
  modified: string[];  // content / label changed (but not position)
  unchanged: number;
}

function diffSnapshots(before: Record<string, unknown>, after: Record<string, unknown>): DiffResult {
  const beforeBoxes = (before.boxes ?? []) as SnapshotBox[];
  const afterBoxes  = (after.boxes  ?? []) as SnapshotBox[];
  const getLabel = (b: SnapshotBox) => b.title?.trim() || b.label?.trim() || b.type || "Untitled";
  const beforeMap = new Map(beforeBoxes.map((b) => [b.id, b]));
  const afterMap  = new Map(afterBoxes.map((b)  => [b.id, b]));

  const added   = afterBoxes.filter((b) => !beforeMap.has(b.id)).map(getLabel);
  const removed = beforeBoxes.filter((b) => !afterMap.has(b.id)).map(getLabel);
  const moved: string[]    = [];
  const modified: string[] = [];
  let unchanged = 0;

  for (const curr of afterBoxes) {
    const prev = beforeMap.get(curr.id);
    if (prev === undefined) continue; // already counted as added

    // Explicitly compare position and size first — JSON.stringify key ordering
    // is not guaranteed when objects come from different code paths (Immer vs JSON.parse).
    const positionChanged =
      prev.x !== curr.x ||
      prev.y !== curr.y ||
      prev.width  !== curr.width ||
      prev.height !== curr.height;

    if (positionChanged) {
      moved.push(getLabel(curr));
      continue;
    }

    // For content changes strip positional keys and deep-compare the rest
    const strip = ({ x: _x, y: _y, width: _w, height: _h, ...rest }: SnapshotBox) => rest;
    const contentChanged = JSON.stringify(strip(prev)) !== JSON.stringify(strip(curr));
    if (contentChanged) {
      modified.push(getLabel(curr));
    } else {
      unchanged++;
    }
  }

  return { added, removed, moved, modified, unchanged };
}

function DiffLine({ type, items }: { type: "added" | "removed" | "moved" | "modified"; items: string[] }) {
  if (!items.length) return null;
  const cfg = {
    added:    { sym: "+", cls: "text-green-400",  label: "added" },
    removed:  { sym: "−", cls: "text-red-400",    label: "removed" },
    moved:    { sym: "↕", cls: "text-blue-400",   label: "moved" },
    modified: { sym: "~", cls: "text-yellow-400", label: "modified" },
  }[type];
  return (
    <p className={cn("text-xs", cfg.cls)}>
      <span className="font-mono mr-1">{cfg.sym}</span>
      <span className="font-semibold">{items.length}</span> block{items.length !== 1 ? "s" : ""} {cfg.label}
      {items.length <= 5 && (
        <span className="text-[var(--text-muted)] ml-1">— {items.join(", ")}</span>
      )}
    </p>
  );
}

// ─── Publish history list ─────────────────────────────────────────────────────

function PublishHistoryList({ serverId, canRollback }: { serverId: string; canRollback: boolean }) {
  const [entries, setEntries] = useState<PublishEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Per-entry review state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snapshotCache, setSnapshotCache] = useState<Record<string, Record<string, unknown>>>({});
  const [loadingSnapshotId, setLoadingSnapshotId] = useState<string | null>(null);
  // Latest snapshot fetched from DB — used as the "current live" reference for diffs
  const [latestSnapshot, setLatestSnapshot] = useState<Record<string, unknown> | null>(null);
  // Per-entry rollback state
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const { boardId } = useServerBoard();
  const { identity } = useUser();
  const { fetchPublishSnapshot, rollbackToPublish } = useBoardSync();
  // Current draft board — used to diff live vs draft for the latest entry
  const draftBoard = useBoardStore((s) => boardId ? s.serverBoards[boardId] : undefined);

  const reload = useCallback(async () => {
    setLoading(true);
    const { entries: rows, error } = await fetchServerPublishes(serverId);
    setEntries(rows);
    setFetchError(error);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { void reload(); }, [reload]);

  // Always fetch the latest published snapshot from DB for diff comparison.
  // We can't rely on the in-memory live board slot (it may not be loaded yet).
  useEffect(() => {
    if (!entries.length) { setLatestSnapshot(null); return; }
    const latestId = entries[0].id;
    void fetchPublishSnapshot(latestId).then((snap) => {
      if (snap) setLatestSnapshot(snap);
    });
  }, [entries, fetchPublishSnapshot]);

  const handleToggleReview = async (entry: PublishEntry) => {
    if (expandedId === entry.id) { setExpandedId(null); return; }
    setExpandedId(entry.id);
    if (!snapshotCache[entry.id]) {
      setLoadingSnapshotId(entry.id);
      const snap = await fetchPublishSnapshot(entry.id);
      setLoadingSnapshotId(null);
      if (snap) setSnapshotCache((prev) => ({ ...prev, [entry.id]: snap }));
    }
  };

  const handleRollback = async (entry: PublishEntry) => {
    if (!boardId) return;
    setRollingBackId(entry.id);
    setRollbackError(null);
    const result = await rollbackToPublish(
      boardId, serverId, entry.id,
      identity.userId, identity.displayName ?? "Unknown",
      entry.publishedAt,
    );
    setRollingBackId(null);
    if (result.success) {
      setConfirmRollbackId(null);
      setExpandedId(null);
      setSnapshotCache({});
      await reload();
    } else {
      setRollbackError(result.error ?? "Rollback failed");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-[var(--border)] animate-pulse" style={{ background: "var(--surface-raised)" }} />
        ))}
      </div>
    );
  }

  if (fetchError) {
    const isMigration = fetchError === "migration_missing";
    return (
      <div className="rounded-xl border border-[var(--border)] px-5 py-6 flex flex-col gap-2" style={{ background: "var(--surface-raised)" }}>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {isMigration ? "Publish history table not found" : "Failed to load publish history"}
        </p>
        {isMigration ? (
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Run <code className="rounded bg-[var(--surface-overlay)] px-1 py-0.5 font-mono text-[var(--accent)]">20260629000002_server_publishes.sql</code> in your Supabase SQL editor to enable publish history.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{fetchError}</p>
        )}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Activity size={28} className="text-[var(--text-muted)] opacity-40" />
        <p className="text-sm text-[var(--text-muted)]">No publishes yet.</p>
        <p className="text-xs text-[var(--text-muted)] opacity-60">Published versions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry, index) => {
        const isLatest = index === 0;
        const isExpanded = expandedId === entry.id;
        const isLoadingSnap = loadingSnapshotId === entry.id;
        const isConfirming = confirmRollbackId === entry.id;
        const isRollingBack = rollingBackId === entry.id;
        const snapshot = snapshotCache[entry.id];
        // Latest entry: diff live → draft (shows unpublished changes)
        // Older entries: diff old snapshot → latest live
        const diff = isLatest
          ? (latestSnapshot && draftBoard ? diffSnapshots(latestSnapshot, draftBoard as unknown as Record<string, unknown>) : null)
          : (snapshot && latestSnapshot ? diffSnapshots(snapshot, latestSnapshot) : null);
        const initial = (entry.publisherName[0] ?? "?").toUpperCase();

        return (
          <div
            key={entry.id}
            className="rounded-xl border border-[var(--border)] overflow-hidden"
            style={{ background: "var(--surface-raised)" }}
          >
            {/* Main row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--accent)", color: "#fff", opacity: 0.85 }}
              >
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{entry.publisherName}</span>
                  {" published"}
                  {isLatest && (
                    <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-400">LIVE</span>
                  )}
                </p>
                {entry.message && (
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">"{entry.message}"</p>
                )}
              </div>
              <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)] mr-1">
                {formatRelativeTime(entry.publishedAt)}
              </span>
              <button
                onClick={() => void handleToggleReview(entry)}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors",
                  isExpanded
                    ? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                )}
              >
                <Eye size={11} /> {isExpanded ? "Hide" : "Review"}
              </button>
              {!isLatest && canRollback && (
                <button
                  onClick={() => { setConfirmRollbackId(entry.id); setRollbackError(null); }}
                  title="Roll back to this version"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <RotateCcw size={11} /> Roll back
                </button>
              )}
            </div>

            {/* Rollback confirm banner */}
            {isConfirming && (
              <div className="border-t border-[var(--border)] px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--surface)" }}>
                <p className="flex-1 text-xs text-[var(--text-secondary)] min-w-0">
                  Roll back to{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {new Date(entry.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>?{" "}
                  This creates a new live publish that matches this snapshot.
                </p>
                {rollbackError && (
                  <span className="text-xs text-red-400 shrink-0">{rollbackError}</span>
                )}
                <button
                  onClick={() => void handleRollback(entry)}
                  disabled={!!isRollingBack}
                  className="rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
                >
                  {isRollingBack ? "Rolling back…" : "Confirm"}
                </button>
                <button
                  onClick={() => { setConfirmRollbackId(null); setRollbackError(null); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Review / diff panel */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: "var(--surface)" }}>
                {isLoadingSnap ? (
                  <p className="text-xs text-[var(--text-muted)] animate-pulse">Loading snapshot…</p>
                ) : isLatest ? (
                  !draftBoard ? (
                    <p className="text-xs text-[var(--text-muted)]">Open the board to compare draft changes.</p>
                  ) : !latestSnapshot ? (
                    <p className="text-xs text-[var(--text-muted)] animate-pulse">Loading…</p>
                  ) : diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.moved.length > 0 || diff.modified.length > 0) ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                        Draft changes since this publish
                      </p>
                      <DiffLine type="added"    items={diff.added} />
                      <DiffLine type="removed"  items={diff.removed} />
                      <DiffLine type="moved"    items={diff.moved} />
                      <DiffLine type="modified" items={diff.modified} />
                      {diff.unchanged > 0 && (
                        <p className="text-xs text-[var(--text-muted)]">
                          <span className="opacity-40">○</span>{" "}
                          {diff.unchanged} block{diff.unchanged !== 1 ? "s" : ""} unchanged
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">Your draft matches the current live version.</p>
                  )
                ) : !snapshot ? (
                  <p className="text-xs text-red-400">Could not load snapshot.</p>
                ) : !latestSnapshot ? (
                  <p className="text-xs text-[var(--text-muted)] animate-pulse">Loading current version…</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">
                      Changes from this version → current live
                    </p>
                    {diff && (diff.added.length > 0 || diff.removed.length > 0 || diff.moved.length > 0 || diff.modified.length > 0) ? (
                      <>
                        <DiffLine type="added"    items={diff.added} />
                        <DiffLine type="removed"  items={diff.removed} />
                        <DiffLine type="moved"    items={diff.moved} />
                        <DiffLine type="modified" items={diff.modified} />
                        {diff.unchanged > 0 && (
                          <p className="text-xs text-[var(--text-muted)]">
                            <span className="opacity-40">○</span>{" "}
                            {diff.unchanged} block{diff.unchanged !== 1 ? "s" : ""} unchanged
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">
                        No differences — this version matches the current live board.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Webhooks tab ─────────────────────────────────────────────────────────────

function WebhooksTab({ boardId, serverId, isReal }: { boardId: string | null; serverId: string; isReal: boolean }) {
  const setWebhookToken = useBoardStore((s) => s.setWebhookToken);
  const currentBoard = useServerBoardData();
  const token = currentBoard?.webhookToken;
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = token ? `${baseUrl}/api/webhooks/${token}` : null;

  const supabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL!.includes("placeholder");

  async function handleGenerate() {
    if (!boardId) return;
    setSaving(true);
    const newToken = crypto.randomUUID().replace(/-/g, "");
    // Persist to Supabase so the API route can look it up
    if (supabaseConfigured) {
      const { supabase } = await import("@/lib/supabase");
      if (token) {
        await supabase.from("webhook_tokens").delete().eq("token", token);
      }
      await supabase.from("webhook_tokens").insert({
        token: newToken,
        board_id: boardId,
        server_id: serverId,
        label: "Default",
      });
    }
    setWebhookToken(boardId, newToken);
    setSaving(false);
  }

  async function handleRevoke() {
    if (!boardId || !token) return;
    if (supabaseConfigured) {
      const { supabase } = await import("@/lib/supabase");
      await supabase.from("webhook_tokens").delete().eq("token", token);
    }
    setWebhookToken(boardId, undefined);
  }

  function handleCopy() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isReal) {
    return (
      <div className="max-w-lg">
        <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Webhooks</h2>
        <p className="text-sm text-[var(--text-muted)]">Webhooks are only available for real servers.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Webhooks</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Send a <code className="bg-[var(--surface-overlay)] px-1 rounded text-xs">POST</code> request to your board&apos;s webhook URL to create integration cards on the canvas. Bots, automations, and external services can push live data here.
        </p>
      </div>

      {!supabaseConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Supabase is not configured. Webhooks require Supabase to store incoming items.
        </div>
      )}

      {/* Token section */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Webhook URL</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">This URL is secret — anyone with it can push data to your board.</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {webhookUrl ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] font-mono outline-none select-all"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Regenerate
                </button>
                <button
                  onClick={handleRevoke}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 size={12} />
                  Revoke
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={saving || !supabaseConfigured}
              className="flex items-center gap-2 self-start rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              <Zap size={14} />
              {saving ? "Generating…" : "Generate webhook URL"}
            </button>
          )}
        </div>
      </div>

      {/* Payload reference */}
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Payload format</p>
        </div>
        <div className="p-4">
          <pre className="text-xs text-[var(--text-secondary)] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{`POST ${webhookUrl ?? "<your-webhook-url>"}
Content-Type: application/json

{
  "title": "Diamond 2 — Valorant",
  "description": "Recent competitive match",
  "source": "Tracker.gg",
  "accentColor": "#ff4655",
  "fields": [
    { "label": "K/D",        "value": "1.8",  "inline": true },
    { "label": "Headshot %", "value": "34%",  "inline": true },
    { "label": "Rank",       "value": "Diamond 2" }
  ],
  "footer": "via Tracker.gg",
  "timestamp": "${new Date().toISOString()}"
}`}</pre>
        </div>
      </div>
    </div>
  );
}

// ─── Backups tab ──────────────────────────────────────────────────────────────

function BackupsTab({ serverId, boardId }: { serverId: string; boardId: string | null }) {
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const { identity } = useUser();
  const { fetchServerBackups, createBackup, restoreFromBackup, deleteBackup, saveServerBoard } = useBoardSync();

  const [editingSlot, setEditingSlot]               = useState<number | null>(null);
  const [labelInputs, setLabelInputs]               = useState<Record<number, string>>({});
  const [savingSlot, setSavingSlot]                 = useState<number | null>(null);
  const [confirmRestoreSlot, setConfirmRestoreSlot] = useState<number | null>(null);
  const [restoringSlot, setRestoringSlot]           = useState<number | null>(null);
  const [confirmDeleteSlot, setConfirmDeleteSlot]   = useState<number | null>(null);
  const [deletingSlot, setDeletingSlot]             = useState<number | null>(null);
  const [actionError, setActionError]               = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { backups: rows, error } = await fetchServerBackups(serverId);
    setFetchError(error);
    setBackups(rows);
    setLoading(false);
  }, [serverId, fetchServerBackups]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl border border-[var(--border)] animate-pulse" style={{ background: "var(--surface-raised)" }} />
        ))}
      </div>
    );
  }

  if (fetchError) {
    const isMigration = fetchError === "migration_missing";
    return (
      <div className="rounded-xl border border-[var(--border)] px-5 py-6 flex flex-col gap-2" style={{ background: "var(--surface-raised)" }}>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {isMigration ? "Backups table not found" : "Failed to load backups"}
        </p>
        {isMigration ? (
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Run{" "}
            <code className="rounded bg-[var(--surface-overlay)] px-1 py-0.5 font-mono text-[var(--accent)]">
              20260629000003_server_backups.sql
            </code>{" "}
            in your Supabase SQL editor to enable backups.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{fetchError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {([1, 2, 3] as const).map((slot) => {
        const backup           = backups.find((b) => b.slot === slot);
        const isEditing        = editingSlot === slot;
        const isSaving         = savingSlot === slot;
        const isConfirmRestore = confirmRestoreSlot === slot;
        const isRestoring      = restoringSlot === slot;
        const isConfirmDelete  = confirmDeleteSlot === slot;
        const isDeleting       = deletingSlot === slot;

        return (
          <div key={slot} className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: "var(--surface-raised)" }}>
            {/* Slot header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold bg-[var(--surface-overlay)] text-[var(--text-muted)]">
                {slot}
              </span>
              <div className="flex-1 min-w-0">
                {backup ? (
                  <>
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {backup.label ?? `Backup ${slot}`}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {backup.creatorName} · {formatRelativeTime(backup.createdAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm italic text-[var(--text-muted)]">Empty slot</p>
                )}
              </div>

              {!isConfirmRestore && !isConfirmDelete && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {backup && (
                    <>
                      <button
                        onClick={() => { setActionError(null); setEditingSlot(null); setConfirmDeleteSlot(null); setConfirmRestoreSlot(slot); }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <RotateCcw size={11} /> Restore
                      </button>
                      <button
                        onClick={() => { setActionError(null); setEditingSlot(null); setConfirmRestoreSlot(null); setConfirmDeleteSlot(slot); }}
                        title="Delete this backup"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-red-500/15 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setActionError(null);
                      setConfirmRestoreSlot(null);
                      setConfirmDeleteSlot(null);
                      const next = isEditing ? null : slot;
                      setEditingSlot(next);
                      if (next !== null) setLabelInputs((p) => ({ ...p, [slot]: backup?.label ?? "" }));
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors",
                      isEditing
                        ? "bg-[var(--surface-overlay)] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Save size={11} /> {backup ? "Overwrite" : "Save here"}
                  </button>
                </div>
              )}
            </div>

            {/* Save / Overwrite panel */}
            {isEditing && (
              <div className="border-t border-[var(--border)] px-4 py-3 flex flex-col gap-2.5" style={{ background: "var(--surface)" }}>
                <input
                  placeholder="Backup label (optional)"
                  value={labelInputs[slot] ?? ""}
                  onChange={(e) => setLabelInputs((p) => ({ ...p, [slot]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                />
                {actionError && <p className="text-xs text-red-400">{actionError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setEditingSlot(null); setActionError(null); }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isSaving || !boardId}
                    onClick={async () => {
                      if (!boardId) return;
                      setSavingSlot(slot);
                      setActionError(null);
                      const res = await createBackup(
                        boardId, serverId, slot,
                        labelInputs[slot]?.trim() ?? "",
                        identity.userId,
                        identity.displayName ?? "Unknown",
                      );
                      setSavingSlot(null);
                      if (res.success) {
                        setEditingSlot(null);
                        await reload();
                      } else {
                        setActionError(res.error ?? "Save failed");
                      }
                    }}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? "Saving…" : "Save backup"}
                  </button>
                </div>
              </div>
            )}

            {/* Restore confirm */}
            {isConfirmRestore && backup && (
              <div className="border-t border-[var(--border)] px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--surface)" }}>
                <p className="flex-1 text-xs text-[var(--text-secondary)] min-w-0">
                  Restore{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {backup.label ?? `Backup ${slot}`}
                  </span>{" "}
                  to the draft board? This replaces the current draft and auto-saves.
                </p>
                {actionError && <span className="text-xs text-red-400 shrink-0">{actionError}</span>}
                <button
                  disabled={!!isRestoring}
                  onClick={async () => {
                    if (!boardId) return;
                    setRestoringSlot(slot);
                    setActionError(null);
                    const res = await restoreFromBackup(boardId, serverId, backup.id);
                    if (res.success) await saveServerBoard(boardId, serverId);
                    setRestoringSlot(null);
                    setConfirmRestoreSlot(null);
                    if (!res.success) setActionError(res.error ?? "Restore failed");
                  }}
                  className="rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
                >
                  {isRestoring ? "Restoring…" : "Confirm restore"}
                </button>
                <button
                  onClick={() => { setConfirmRestoreSlot(null); setActionError(null); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Delete confirm */}
            {isConfirmDelete && backup && (
              <div className="border-t border-[var(--border)] px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: "var(--surface)" }}>
                <p className="flex-1 text-xs text-[var(--text-secondary)] min-w-0">
                  Delete{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {backup.label ?? `Backup ${slot}`}
                  </span>
                  ? This cannot be undone.
                </p>
                <button
                  disabled={!!isDeleting}
                  onClick={async () => {
                    setDeletingSlot(slot);
                    setActionError(null);
                    const res = await deleteBackup(backup.id);
                    setDeletingSlot(null);
                    setConfirmDeleteSlot(null);
                    if (res.success) await reload();
                    else setActionError(res.error ?? "Delete failed");
                  }}
                  className="rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  onClick={() => { setConfirmDeleteSlot(null); setActionError(null); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
