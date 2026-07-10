"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, User, Bell, Mail, Shield, Palette, Accessibility, Keyboard,
  Info, ChevronRight, Check, Plus, Trash2, Volume2, VolumeX,
  Eye, EyeOff, MessageSquare, AtSign, Globe, Zap, Monitor, RotateCcw, Gamepad2, Download, Compass, ExternalLink,
} from "lucide-react";
import { LINKS, isExternalLink } from "@/lib/links";
import { applyAccessibility } from "@/lib/accessibility";
import { publishPrivacyToProfile } from "@/lib/privacy";
import { replayFirstRunTour } from "./FirstRunTour";
import { cn } from "@/lib/utils";
import { getSelfIdentity, updateSelfIdentity } from "@/lib/collaboration";
import { useUser } from "@/contexts/UserContext";
import { UsernameSetupModal } from "./UsernameSetupModal";
import { useBoardStore } from "@/store/boardStore";
import { setSoundEnabled } from "@/lib/sound";
import { enablePush, disablePush, isPushEnabled, pushSupported, pushConfigured } from "@/lib/push";
import { testReminderNotification } from "@/components/pwa/DesktopReminders";
import { appToast } from "@/components/ui/AppToast";
import { PRESET_THEMES, APP_FONTS, BG_FILTERS, ThemeVarMap } from "@/lib/appThemes";

// ── Local-storage settings key ─────────────────────────────────────────────
import { UserPrefs, DEFAULT_PREFS, readUserPrefs as loadPrefs, writeUserPrefs as savePrefs } from "@/lib/userPrefs";
// Installer URL (Vercel env). Empty until the desktop app is published.
const DESKTOP_DOWNLOAD_URL = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ?? "";

// ── Section definitions ────────────────────────────────────────────────────
type SectionId = "account" | "notifications" | "privacy" | "appearance" | "accessibility" | "keybindings" | "about" | "data" | "integrations";

interface Section { id: SectionId; label: string; icon: React.ReactNode; group: string }

const SECTIONS: Section[] = [
  { id: "account",       label: "My Account",     icon: <User size={14} />,          group: "User Settings" },
  { id: "notifications", label: "Notifications",   icon: <Bell size={14} />,          group: "User Settings" },
  { id: "privacy",       label: "Privacy & Safety",icon: <Shield size={14} />,        group: "User Settings" },
  { id: "integrations",  label: "Integrations",    icon: <Gamepad2 size={14} />,      group: "User Settings" },
  { id: "appearance",    label: "Appearance",     icon: <Palette size={14} />,       group: "App Settings" },
  { id: "accessibility", label: "Accessibility",  icon: <Accessibility size={14} />, group: "App Settings" },
  { id: "keybindings",   label: "Keybindings",    icon: <Keyboard size={14} />,      group: "App Settings" },
  { id: "data",          label: "Recently Deleted",icon: <Trash2 size={14} />,       group: "App Settings" },
  { id: "about",         label: "About",          icon: <Info size={14} />,          group: "Info" },
];

const GROUPS = [...new Set(SECTIONS.map((s) => s.group))];

// ── Appearance sub-types (mirrors SettingsPanel) ──────────────────────────
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

const BG_SIZES = [
  { id: "cover",   label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "auto",    label: "Original" },
] as const;

const FONT_GROUPS = [
  { label: "Modern Sans-Serif", fonts: ["Inter","Geist","DM Sans","Outfit","Space Grotesk","Manrope","Plus Jakarta Sans","Syne","Unbounded","Urbanist","Lexend","Figtree"] },
  { label: "Humanist Sans-Serif", fonts: ["Poppins","Nunito","Montserrat","Raleway","Roboto","Open Sans","Lato","Mulish","Josefin Sans","Quicksand","Karla","Barlow","Exo 2"] },
  { label: "Serif", fonts: ["Playfair Display","Merriweather","Lora","PT Serif","Libre Baskerville","Cormorant Garamond","EB Garamond"] },
  { label: "Monospace", fonts: ["Source Code Pro","Fira Code","JetBrains Mono","Space Mono","Inconsolata"] },
  { label: "Display", fonts: ["Bebas Neue","Oswald","Anton","Righteous","Orbitron"] },
].map((g) => ({ ...g, fonts: g.fonts.map((n) => APP_FONTS.find((f) => f.name === n)!).filter(Boolean) }));

const KEYBINDINGS = [
  { action: "New block",      keys: ["N"] },
  { action: "Delete selected",keys: ["Del"] },
  { action: "Duplicate block",keys: ["Ctrl", "D"] },
  { action: "Expand block",   keys: ["Enter"] },
  { action: "Zoom in",        keys: ["Ctrl", "+"] },
  { action: "Zoom out",       keys: ["Ctrl", "−"] },
  { action: "Fit to screen",  keys: ["Ctrl", "0"] },
  { action: "Undo",           keys: ["Ctrl", "Z"] },
  { action: "Redo",           keys: ["Ctrl", "Y"] },
  { action: "Toggle grid",    keys: ["G"] },
  { action: "Search",         keys: ["Ctrl", "K"] },
  { action: "Settings",       keys: ["Ctrl", ","] },
  { action: "Close / Escape", keys: ["Esc"] },
];

// ─────────────────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  onClose: () => void;
  initialSection?: SectionId;
}

export function SettingsModal({ onClose, initialSection = "account" }: SettingsModalProps) {
  const [active, setActive] = useState<SectionId>(initialSection);
  const [prefs, setPrefs] = useState<UserPrefs>(loadPrefs);
  const [saveThemeName, setSaveThemeName] = useState("");
  const [appearTab, setAppearTab] = useState<"theme" | "font" | "background">("theme");
  const bgFileRef = useRef<HTMLInputElement>(null);

  const {
    boards, themeVars, savedThemes, appFont, appBg,
    setThemeVars, saveCurrentTheme, deleteSavedTheme, setAppFont, setAppBg,
    restoreBoard, hardDeleteBoard,
  } = useBoardStore();

  const [confirmHardDelete, setConfirmHardDelete] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const { identity: userIdentity } = useUser();

  const trashedBoards = boards
    .filter((b) => !b.serverId && b.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const identity = getSelfIdentity();

  // Persist prefs on change, and apply the accessibility ones live
  useEffect(() => { savePrefs(prefs); applyAccessibility(prefs); }, [prefs]);

  // Mirror the privacy prefs others must see (who-can-DM, friend requests) onto
  // the profile row so other clients respect them; skip the first render.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    void publishPrivacyToProfile({ allowDMsFrom: prefs.allowDMsFrom, allowFriendRequests: prefs.allowFriendRequests });
  }, [prefs.allowDMsFrom, prefs.allowFriendRequests]);

  const patchPref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    if (key === "notifySounds") setSoundEnabled(value as boolean);
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleBgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => setAppBg({ image: ev.target?.result as string });
    r.readAsDataURL(file);
    e.target.value = "";
  };

  // Portal to <body> so the overlay escapes the board canvas's transform stacking
  // context — otherwise embed/widget iframes on the canvas paint over this modal.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-0 z-[1001] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-[860px] rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)]"
          style={{ background: "var(--surface-raised)", height: "min(86vh, 700px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Sidebar ───────────────────────────────────────────── */}
          <nav
            className="flex w-14 md:w-[220px] flex-shrink-0 flex-col gap-1 overflow-y-auto py-5 px-2 md:px-3"
            style={{ background: "var(--sidebar)", borderRight: "1px solid var(--border)" }}
          >
            <p className="mb-2 hidden px-2 text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] md:block">
              Settings
            </p>

            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <p className="mb-1 hidden px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] md:block">
                  {group}
                </p>
                {SECTIONS.filter((s) => s.group === group).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    title={s.label}
                    className={cn(
                      "flex w-full items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all md:justify-start md:text-left",
                      active === s.id
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {s.icon}
                    <span className="hidden md:inline">{s.label}</span>
                  </button>
                ))}
              </div>
            ))}

            <div className="mt-auto pt-3 border-t border-[var(--border)]">
              <button
                onClick={onClose}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-red-400 transition-colors"
              >
                <X size={14} /> Close
              </button>
            </div>
          </nav>

          {/* ── Content ───────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-7 py-4 border-b border-[var(--border)] flex-shrink-0">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {SECTIONS.find((s) => s.id === active)?.label}
              </h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-overlay)] hover:text-[var(--text-primary)] transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">

              {/* ── ACCOUNT ──────────────────────────────────────── */}
              {active === "account" && (
                <div className="flex flex-col gap-6">
                  {/* Avatar card */}
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--surface)" }}>
                    <div
                      className="h-14 w-14 flex-shrink-0 rounded-full flex items-center justify-center text-white text-xl font-bold border-2"
                      style={{ background: identity.color, borderColor: identity.color + "66" }}
                    >
                      {identity.avatarUrl
                        ? <img src={identity.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" />
                        : (identity.displayName[0] ?? "?").toUpperCase()
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] truncate">{identity.displayName}</p>
                      {identity.pronouns && <p className="text-xs text-[var(--text-muted)]">{identity.pronouns}</p>}
                      {identity.status && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          {identity.statusEmoji} {identity.status}
                        </p>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                      onClick={onClose}
                    >
                      Edit Profile <ChevronRight size={11} />
                    </div>
                  </div>

                  <SGroup label="Account Info">
                    <div className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3" style={{ background: "var(--surface)" }}>
                      <span className="text-sm text-[var(--text-muted)]">Username</span>
                      <button onClick={() => setEditUsername(true)} className="text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]">
                        {userIdentity.username ? `@${userIdentity.username}` : <span className="text-[var(--accent)]">Set username</span>}
                      </button>
                    </div>
                    <InfoRow label="Display Name" value={identity.displayName} />
                    {identity.bio && <InfoRow label="Bio" value={identity.bio} />}
                    <button
                      onClick={() => { void navigator.clipboard.writeText(identity.userId); setCopiedId(true); setTimeout(() => setCopiedId(false), 1500); }}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:border-[var(--text-muted)]"
                      style={{ background: "var(--surface)" }}
                    >
                      <span className="text-sm text-[var(--text-muted)]">User ID <span className="text-[11px]">· for support</span></span>
                      <span className="font-mono text-xs text-[var(--text-secondary)]">{copiedId ? "Copied!" : "Copy"}</span>
                    </button>
                  </SGroup>

                  {editUsername && (
                    <UsernameSetupModal current={userIdentity.username} onClose={() => setEditUsername(false)} />
                  )}

                  <SGroup label="Danger Zone">
                    <button
                      onClick={() => {
                        if (confirm("This will reset your identity, color, and all profile data. Continue?")) {
                          localStorage.removeItem("plancraft-user-identity");
                          window.location.reload();
                        }
                      }}
                      className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-colors"
                    >
                      <Trash2 size={13} /> Reset Account Data
                    </button>
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      Clears your display name, avatar, and collab identity from this device.
                    </p>
                  </SGroup>
                </div>
              )}

              {/* ── RECENTLY DELETED ─────────────────────────────── */}
              {active === "data" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-[var(--text-muted)]">
                    Boards stay here for 30 days, then are permanently deleted.
                  </p>
                  {trashedBoards.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] py-12 text-center" style={{ background: "var(--surface)" }}>
                      <Trash2 size={22} className="text-[var(--text-muted)] opacity-40" />
                      <p className="text-sm text-[var(--text-muted)]">No recently deleted boards</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {trashedBoards.map((board) => {
                        const daysLeft = board.deletedAt
                          ? Math.max(0, 30 - Math.floor((Date.now() - board.deletedAt) / (24 * 60 * 60 * 1000)))
                          : 30;
                        return (
                          <div
                            key={board.id}
                            className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3"
                            style={{ background: "var(--surface)" }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{board.name}</p>
                              <p className="text-[11px] text-[var(--text-muted)]">
                                {board.boxes.length} block{board.boxes.length !== 1 ? "s" : ""} · {daysLeft}d left
                              </p>
                            </div>
                            <button
                              onClick={() => { restoreBoard(board.id); setConfirmHardDelete(null); }}
                              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors flex-shrink-0"
                            >
                              <RotateCcw size={11} /> Restore
                            </button>
                            {confirmHardDelete === board.id ? (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs text-[var(--text-muted)]">Delete forever?</span>
                                <button
                                  onClick={() => { hardDeleteBoard(board.id); setConfirmHardDelete(null); }}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmHardDelete(null)}
                                  className="rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmHardDelete(board.id)}
                                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/40 transition-colors flex-shrink-0"
                              >
                                <Trash2 size={11} /> Delete
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── NOTIFICATIONS ────────────────────────────────── */}
              {active === "notifications" && (
                <div className="flex flex-col gap-6">
                  <SGroup label="Notify me about">
                    <RadioGroup
                      value={prefs.notifyLevel}
                      onChange={(v) => patchPref("notifyLevel", v as UserPrefs["notifyLevel"])}
                      options={[
                        { value: "all",      icon: <MessageSquare size={13} />, label: "All messages",    desc: "Get notified for every new message" },
                        { value: "mentions", icon: <AtSign size={13} />,        label: "Mentions only",   desc: "Only when someone mentions you" },
                        { value: "none",     icon: <VolumeX size={13} />,       label: "Nothing",         desc: "Silence all notifications" },
                      ]}
                    />
                  </SGroup>

                  <SGroup label="Channels">
                    <Toggle label="Desktop notifications" desc="Show system notifications when the app is in the background" icon={<Monitor size={14} />} value={prefs.notifyDesktop} onChange={(v) => patchPref("notifyDesktop", v)} />
                    <Toggle label="Unread badge" desc="Show a badge count on the app icon" icon={<Bell size={14} />} value={prefs.notifyBadge} onChange={(v) => patchPref("notifyBadge", v)} />
                    <Toggle label="Direct messages" desc="Always notify for new DMs regardless of level" icon={<MessageSquare size={14} />} value={prefs.notifyDMs} onChange={(v) => patchPref("notifyDMs", v)} />
                    <Toggle label="Mentions" desc="Always notify when you're @mentioned" icon={<AtSign size={14} />} value={prefs.notifyMentions} onChange={(v) => patchPref("notifyMentions", v)} />
                  </SGroup>

                  <SGroup label="Sounds">
                    <Toggle label="Notification sounds" desc="Play a sound for incoming messages" icon={<Volume2 size={14} />} value={prefs.notifySounds} onChange={(v) => patchPref("notifySounds", v)} />
                  </SGroup>

                  <SGroup label="Reminders">
                    <PushToggle userId={userIdentity.userId} />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Bell size={14} />
                        <div className="flex flex-col">
                          <span className="text-sm">Test notification</span>
                          <span className="text-[11px] text-[var(--text-muted)]">Fire a sample reminder now to check it works on this device</span>
                        </div>
                      </div>
                      <button
                        onClick={testReminderNotification}
                        className="flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                      >
                        Send test
                      </button>
                    </div>
                    <EmailRemindersButton />
                  </SGroup>
                </div>
              )}

              {/* ── PRIVACY ──────────────────────────────────────── */}
              {active === "privacy" && (
                <div className="flex flex-col gap-6">
                  <SGroup label="Presence">
                    <Toggle label="Show online status" desc="Let others see when you're active" icon={<Globe size={14} />} value={prefs.showOnlineStatus} onChange={(v) => patchPref("showOnlineStatus", v)} />
                    <Toggle label="Read receipts" desc="Show when you've read messages (available once read receipts ship)" icon={prefs.showReadReceipts ? <Eye size={14} /> : <EyeOff size={14} />} value={prefs.showReadReceipts} onChange={(v) => patchPref("showReadReceipts", v)} />
                  </SGroup>

                  <SGroup label="Direct Messages">
                    <p className="mb-2 text-[11px] text-[var(--text-muted)]">Who can send you DMs?</p>
                    <RadioGroup
                      value={prefs.allowDMsFrom}
                      onChange={(v) => patchPref("allowDMsFrom", v as UserPrefs["allowDMsFrom"])}
                      options={[
                        { value: "everyone", icon: <Globe size={13} />,       label: "Everyone",        desc: "Any user can message you" },
                        { value: "friends",  icon: <User size={13} />,        label: "Friends only",    desc: "Only people you've added" },
                        { value: "none",     icon: <Shield size={13} />,       label: "No one",          desc: "Block all incoming DMs" },
                      ]}
                    />
                  </SGroup>

                  <SGroup label="Social">
                    <Toggle label="Allow friend requests" desc="Let other users send you friend requests" icon={<User size={14} />} value={prefs.allowFriendRequests} onChange={(v) => patchPref("allowFriendRequests", v)} />
                  </SGroup>

                  <SGroup label="Data & Privacy">
                    <button className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                      <Zap size={13} /> Export My Data
                    </button>
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      Download a copy of your boards, messages, and settings.
                    </p>
                  </SGroup>
                </div>
              )}

              {/* ── APPEARANCE ───────────────────────────────────── */}
              {active === "appearance" && (
                <div className="flex flex-col gap-6">
                  {/* Sub-tabs */}
                  <div className="flex gap-0.5 rounded-lg bg-[var(--surface-overlay)] p-0.5 w-fit">
                    {(["theme", "font", "background"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setAppearTab(t)}
                        className={cn(
                          "rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                          appearTab === t
                            ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Theme */}
                  {appearTab === "theme" && (
                    <>
                      <SGroup label="Presets">
                        <div className="flex flex-wrap gap-2">
                          {PRESET_THEMES.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setThemeVars(p.vars)}
                              className={cn(
                                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all",
                                JSON.stringify(themeVars) === JSON.stringify(p.vars)
                                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                              )}
                            >
                              <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: p.vars.accent }} />
                              {p.name}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                          App theme is the default. Boards can override it with their own theme.
                        </p>
                      </SGroup>

                      <SGroup label="Colors">
                        <div className="grid grid-cols-2 gap-2">
                          {COLOR_KEYS.map(({ key, label }) => (
                            <ColorPickerRow key={key} label={label} value={themeVars[key]} onChange={(v) => setThemeVars({ ...themeVars, [key]: v })} />
                          ))}
                        </div>
                      </SGroup>

                      <SGroup label="Save as Preset">
                        <div className="flex gap-2">
                          <input
                            value={saveThemeName}
                            onChange={(e) => setSaveThemeName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && saveThemeName.trim()) { saveCurrentTheme(saveThemeName.trim(), themeVars); setSaveThemeName(""); } }}
                            placeholder="Theme name…"
                            className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                          />
                          <button
                            onClick={() => { if (saveThemeName.trim()) { saveCurrentTheme(saveThemeName.trim(), themeVars); setSaveThemeName(""); } }}
                            disabled={!saveThemeName.trim()}
                            className="flex items-center gap-1.5 rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus size={13} /> Save
                          </button>
                        </div>
                      </SGroup>

                      {savedThemes.length > 0 && (
                        <SGroup label="Saved Themes">
                          {savedThemes.map((saved) => (
                            <div key={saved.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2" style={{ background: "var(--surface)" }}>
                              <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: saved.vars.accent }} />
                              <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{saved.name}</span>
                              <button onClick={() => setThemeVars(saved.vars)} className="text-xs font-medium text-[var(--accent)] hover:underline">Apply</button>
                              <button onClick={() => deleteSavedTheme(saved.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          ))}
                        </SGroup>
                      )}
                    </>
                  )}

                  {/* Font */}
                  {appearTab === "font" && (
                    <>
                      {FONT_GROUPS.map((g) => (
                        <SGroup key={g.label} label={g.label}>
                          <div className="grid grid-cols-2 gap-1.5">
                            {g.fonts.map((f) => (
                              <button
                                key={f.name}
                                onClick={() => setAppFont(f.name)}
                                className={cn(
                                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition-all truncate",
                                  appFont === f.name
                                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                )}
                                style={{ fontFamily: `"${f.name}", system-ui` }}
                              >
                                {appFont === f.name && <Check size={10} className="text-[var(--accent)] flex-shrink-0" />}
                                <span className="truncate">{f.name}</span>
                              </button>
                            ))}
                          </div>
                        </SGroup>
                      ))}
                    </>
                  )}

                  {/* Background */}
                  {appearTab === "background" && (
                    <>
                      <SGroup label="Image">
                        <input
                          className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                          placeholder="Paste an image URL…"
                          value={appBg.image?.startsWith("data:") ? "" : (appBg.image ?? "")}
                          onChange={(e) => setAppBg({ image: e.target.value || undefined })}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => bgFileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-2 text-sm text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                            Upload file
                          </button>
                          {appBg.image && (
                            <button onClick={() => setAppBg({ image: undefined })} className="rounded border border-[var(--border)] px-3 text-sm text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors">
                              Clear
                            </button>
                          )}
                        </div>
                        <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFile} />
                      </SGroup>

                      {appBg.image && (
                        <>
                          <div className="h-28 w-full overflow-hidden rounded-xl border border-[var(--border)] relative">
                            <img src={appBg.image} alt="" className="h-full w-full" style={{ objectFit: appBg.size === "cover" ? "cover" : appBg.size === "contain" ? "contain" : "none", opacity: appBg.opacity, filter: appBg.filter || undefined }} />
                            {appBg.overlayOpacity > 0 && <div className="absolute inset-0" style={{ backgroundColor: appBg.overlayColor, opacity: appBg.overlayOpacity }} />}
                          </div>

                          <SGroup label="Resize">
                            <div className="flex gap-2">
                              {BG_SIZES.map((s) => (
                                <button key={s.id} onClick={() => setAppBg({ size: s.id })} className={cn("flex-1 rounded border py-2 text-sm transition-colors", appBg.size === s.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </SGroup>

                          <SGroup label="Opacity">
                            <SliderRow value={appBg.opacity} min={0} max={1} step={0.01} label={`${Math.round(appBg.opacity * 100)}%`} onChange={(v) => setAppBg({ opacity: v })} />
                          </SGroup>

                          <SGroup label="Filter">
                            <div className="flex flex-wrap gap-1.5">
                              {BG_FILTERS.map((f) => (
                                <button key={f.id} onClick={() => setAppBg({ filter: f.value })} className={cn("rounded border px-3 py-1.5 text-xs transition-colors", appBg.filter === f.value ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]")}>
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          </SGroup>

                          <SGroup label="Color Tint">
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 hover:border-[var(--text-muted)] transition-colors" style={{ background: "var(--surface)" }}>
                              <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: appBg.overlayColor }}>
                                <input type="color" value={appBg.overlayColor} onChange={(e) => setAppBg({ overlayColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                              </span>
                              <span className="flex-1 text-sm text-[var(--text-secondary)]">Tint color</span>
                              <span className="font-mono text-xs text-[var(--text-muted)]">{appBg.overlayColor}</span>
                            </label>
                            <SliderRow value={appBg.overlayOpacity} min={0} max={1} step={0.01} label={`${Math.round(appBg.overlayOpacity * 100)}%`} onChange={(v) => setAppBg({ overlayOpacity: v })} />
                          </SGroup>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── ACCESSIBILITY ─────────────────────────────────── */}
              {active === "accessibility" && (
                <div className="flex flex-col gap-6">
                  <SGroup label="Motion & Animation">
                    <Toggle label="Reduce motion" desc="Minimize animations and transitions throughout the app" icon={<Zap size={14} />} value={prefs.reduceMotion} onChange={(v) => patchPref("reduceMotion", v)} />
                  </SGroup>

                  <SGroup label="Display">
                    <Toggle label="Compact mode" desc="Reduce spacing and padding for a denser layout" icon={<Monitor size={14} />} value={prefs.compactMode} onChange={(v) => patchPref("compactMode", v)} />
                    <Toggle label="High contrast" desc="Increase color contrast for better readability" icon={<Eye size={14} />} value={prefs.highContrast} onChange={(v) => patchPref("highContrast", v)} />
                    <Toggle label="Reduce transparency" desc="Remove frosted-glass blur so text sits on solid surfaces" icon={<EyeOff size={14} />} value={prefs.reduceTransparency} onChange={(v) => patchPref("reduceTransparency", v)} />
                  </SGroup>

                  <SGroup label="Color">
                    <div className="rounded-xl border border-[var(--border)] px-4 py-3" style={{ background: "var(--surface)" }}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-[var(--text-primary)]">Saturation</span>
                        <span className="text-xs tabular-nums text-[var(--text-muted)]">{prefs.saturation}%</span>
                      </div>
                      <input
                        type="range" min={20} max={100} step={5}
                        value={prefs.saturation}
                        onChange={(e) => patchPref("saturation", Number(e.target.value))}
                        className="w-full accent-[var(--accent)]"
                      />
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Lower saturation softens the interface colors — helpful for visual sensitivity or color-vision differences.
                      </p>
                    </div>
                  </SGroup>

                  <SGroup label="Navigation & Reading">
                    <Toggle label="Underline links" desc="Always underline links so they don't rely on color alone" icon={<Globe size={14} />} value={prefs.underlineLinks} onChange={(v) => patchPref("underlineLinks", v)} />
                    <Toggle label="Always show focus outline" desc="Keep a visible outline on the focused control, not just when tabbing" icon={<Keyboard size={14} />} value={prefs.alwaysShowFocus} onChange={(v) => patchPref("alwaysShowFocus", v)} />
                  </SGroup>

                  <SGroup label="Text Size">
                    <div className="flex gap-2">
                      {([["sm", "Small"], ["md", "Medium"], ["lg", "Large"]] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => patchPref("fontSize", val)}
                          className={cn(
                            "flex-1 rounded-lg border py-2.5 text-sm transition-colors",
                            prefs.fontSize === val
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      Scales the app interface — menus, sidebars, and messages. Board content keeps its own sizes.
                    </p>
                  </SGroup>
                </div>
              )}

              {/* ── KEYBINDINGS ───────────────────────────────────── */}
              {active === "keybindings" && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[var(--text-muted)]">Keyboard shortcuts available in Crecoard.</p>
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: "var(--surface)" }}>
                    {KEYBINDINGS.map((kb, i) => (
                      <div
                        key={kb.action}
                        className={cn(
                          "flex items-center justify-between px-4 py-3",
                          i < KEYBINDINGS.length - 1 && "border-b border-[var(--border)]"
                        )}
                      >
                        <span className="text-sm text-[var(--text-primary)]">{kb.action}</span>
                        <div className="flex items-center gap-1">
                          {kb.keys.map((k) => (
                            <kbd key={k} className="rounded border border-[var(--border)] bg-[var(--surface-overlay)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-secondary)]">
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ABOUT ────────────────────────────────────────── */}
              {active === "integrations" && <IntegrationsSection />}

              {active === "about" && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] p-5" style={{ background: "var(--surface)" }}>
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--accent)" }}>
                      📋
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[var(--text-primary)]">Crecoard</p>
                      <p className="text-sm text-[var(--text-muted)]">Version {process.env.NEXT_PUBLIC_APP_VERSION ?? "0.3.0"}-alpha</p>
                      <p className="text-xs text-[var(--text-muted)]">Built with Next.js · Supabase · dnd-kit</p>
                    </div>
                  </div>

                  <SGroup label="Getting Started">
                    <button
                      onClick={() => { replayFirstRunTour(); onClose(); }}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
                      style={{ background: "var(--surface)" }}
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ background: "var(--accent)" }}>
                        <Compass size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Replay guided tour</p>
                        <p className="text-[11px] text-[var(--text-muted)]">Walk through the basics again — right-click, blocks &amp; board styling. Opens on your personal board.</p>
                      </div>
                      <ChevronRight size={15} className="flex-shrink-0 text-[var(--text-muted)]" />
                    </button>
                  </SGroup>

                  {/* Desktop app — only in the browser (hidden inside the app itself) and once published */}
                  {DESKTOP_DOWNLOAD_URL && typeof window !== "undefined" && !window.electron && (
                    <a
                      href="/download"
                      className="flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
                      style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ background: "var(--accent)" }}>
                        <Download size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Get the desktop app</p>
                        <p className="text-xs text-[var(--text-muted)]">Native reminders, pop-out boards &amp; live wallpapers for Windows</p>
                      </div>
                      <ChevronRight size={16} className="flex-shrink-0 text-[var(--text-muted)]" />
                    </a>
                  )}

                  <SGroup label="System">
                    <InfoRow label="Platform" value={typeof window !== "undefined" && (window as { electron?: unknown }).electron ? "Desktop (Electron)" : "Web"} />
                    <InfoRow label="User Agent" value={typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) + "…" : "—"} mono />
                  </SGroup>

                  <SGroup label="Links">
                    <div className="flex flex-col gap-1.5">
                      {[
                        { label: "Documentation", href: LINKS.docs },
                        { label: "Report a bug", href: LINKS.reportBug },
                        // Privacy Policy & Terms of Service hidden until the pages are finalized
                      ].map(({ label, href }) => {
                        const external = isExternalLink(href);
                        return (
                          <a
                            key={label}
                            href={href}
                            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                            style={{ background: "var(--surface)" }}
                          >
                            {label} {external ? <ExternalLink size={13} /> : <ChevronRight size={13} />}
                          </a>
                        );
                      })}
                    </div>
                  </SGroup>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Integrations section ────────────────────────────────────────────────────

function IntegrationsSection() {
  const integrations = [
    {
      name: "Tracker.gg",
      desc: "Live player stats — Valorant, Apex, Rocket League, Fortnite & CS2",
      color: "#ff4655",
      icon: <Gamepad2 size={16} className="text-white" />,
      available: true,
    },
    {
      name: "GitHub",
      desc: "Repos, issues, PRs, commit activity",
      color: "#24292e",
      icon: null,
      available: false,
    },
    {
      name: "Steam",
      desc: "Profile, status & recently played games",
      color: "#1b2838",
      icon: <Monitor size={16} className="text-[#66c0f4]" />,
      available: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-bold text-[var(--text-primary)] mb-1">Integrations</p>
        <p className="text-sm text-[var(--text-muted)]">
          Built-in integrations — no API keys needed. Just add the item to your board and enter your username.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {integrations.map(({ name, desc, color, icon, available }) => (
          <div key={name}
            className={`flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] ${!available ? "opacity-50" : ""}`}
            style={{ background: "var(--surface)" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: color }}>
              {icon ?? <span className="text-white text-xs font-bold">{name[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
              <p className="text-xs text-[var(--text-muted)]">{desc}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              available
                ? "text-green-400 bg-green-400/10"
                : "text-[var(--text-muted)] border border-[var(--border)]"
            }`}>
              {available ? "Available" : "Soon"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function PushToggle({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { void isPushEnabled().then(setEnabled); }, []);

  if (!pushSupported() || !pushConfigured()) {
    return (
      <Toggle
        label="Push notifications"
        desc={!pushSupported() ? "Not supported on this device" : "Not configured on this server"}
        icon={<Bell size={14} />}
        value={false}
        onChange={() => {}}
      />
    );
  }

  const toggle = async (v: boolean) => {
    if (busy) return;
    setBusy(true); setNote(null);
    if (v) {
      const res = await enablePush(userId);
      setEnabled(res.ok);
      if (!res.ok) setNote(res.error ?? "Couldn't enable push.");
    } else {
      await disablePush();
      setEnabled(false);
    }
    setBusy(false);
  };

  return (
    <>
      <Toggle
        label="Push notifications"
        desc="Get reminders on this device even when the app is closed"
        icon={<Bell size={14} />}
        value={enabled}
        onChange={toggle}
      />
      {note && <p className="mt-1 px-1 text-[11px] text-red-400">{note}</p>}
    </>
  );
}

function EmailRemindersButton() {
  const [busy, setBusy] = useState<"" | "sample" | "due">("");
  const [result, setResult] = useState<{ msg: string; kind: "success" | "error" | "info" } | null>(null);
  const run = async (test: boolean) => {
    if (busy) return;
    setBusy(test ? "sample" : "due");
    setResult(null);
    let msg = "Done";
    let kind: "success" | "error" | "info" = "info";
    try {
      const res = await fetch(`/api/reminders/run${test ? "?test=1" : ""}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        emailConfigured?: boolean; error?: string; sent?: number; failed?: number; processed?: number; errors?: string[]; test?: boolean;
      };
      if (res.status === 401) { msg = "Sign in first (no valid session)"; kind = "error"; }
      else if (!res.ok) { msg = `Server error ${res.status}${data.error ? `: ${data.error}` : ""} — check the dev terminal`; kind = "error"; }
      else if (data.emailConfigured === false) { msg = "Email isn't set up — add RESEND_API_KEY, then restart the server"; kind = "error"; }
      else if (data.error === "no-email") { msg = "Your account has no email address"; kind = "error"; }
      else if ((data.sent ?? 0) > 0) { msg = data.test ? "Sample sent ✓ — check your inbox (and spam)" : `Emailed ${data.sent} due reminder${data.sent === 1 ? "" : "s"} — check your inbox`; kind = "success"; }
      else if ((data.failed ?? 0) > 0) { msg = `Send failed: ${data.errors?.[0] ?? "check EMAIL_FROM / Resend domain"}`; kind = "error"; }
      else if ((data.processed ?? 0) === 0) { msg = "No reminders are due — use Sample to test email, or set one due in the past"; kind = "info"; }
    } catch {
      msg = "Request failed — is the dev server running?"; kind = "error";
    }
    setResult({ msg, kind });
    appToast(msg, kind); // also toast, best-effort
    setBusy("");
  };
  const btnCls = "flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Mail size={14} />
          <div className="flex flex-col">
            <span className="text-sm">Email reminders</span>
            <span className="text-[11px] text-[var(--text-muted)]">Send a sample to test delivery, or email any reminders due now</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button onClick={() => run(true)} disabled={!!busy} className={btnCls}>{busy === "sample" ? "Sending…" : "Sample"}</button>
          <button onClick={() => run(false)} disabled={!!busy} className={btnCls}>{busy === "due" ? "Sending…" : "Send due"}</button>
        </div>
      </div>
      {result && (
        <p className={cn(
          "px-1 text-[11px]",
          result.kind === "success" ? "text-green-400" : result.kind === "error" ? "text-red-400" : "text-[var(--text-muted)]",
        )}>
          {result.msg}
        </p>
      )}
    </div>
  );
}

function Toggle({ label, desc, icon, value, onChange }: {
  label: string; desc?: string; icon?: React.ReactNode;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3 cursor-pointer hover:border-[var(--text-muted)] transition-colors"
      style={{ background: "var(--surface)" }}
      onClick={() => onChange(!value)}
    >
      {icon && <span className="text-[var(--text-muted)] flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {desc && <p className="text-[11px] text-[var(--text-muted)]">{desc}</p>}
      </div>
      <div
        className={cn(
          "relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200",
          value ? "bg-[var(--accent)]" : "bg-[var(--surface-overlay)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
            value ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </div>
  );
}

function RadioGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; icon?: React.ReactNode; label: string; desc: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => (
        <div
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all",
            value === o.value
              ? "border-[var(--accent)] bg-[var(--accent)]/8"
              : "border-[var(--border)] hover:border-[var(--text-muted)]"
          )}
          style={{ background: value === o.value ? undefined : "var(--surface)" }}
        >
          <span className={cn("flex-shrink-0", value === o.value ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>{o.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium", value === o.value ? "text-[var(--accent)]" : "text-[var(--text-primary)]")}>{o.label}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{o.desc}</p>
          </div>
          <div className={cn("h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center", value === o.value ? "border-[var(--accent)]" : "border-[var(--border)]")}>
            {value === o.value && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2.5" style={{ background: "var(--surface)" }}>
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className={cn("text-sm text-[var(--text-primary)] text-right max-w-[60%] truncate", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--accent)] h-1" />
      <span className="w-10 text-right text-xs text-[var(--text-muted)] flex-shrink-0">{label}</span>
    </div>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--text-muted)] transition-colors" style={{ background: "var(--surface)" }}>
      <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      <span className="flex-1 text-xs text-[var(--text-secondary)] truncate">{label}</span>
      <span className="font-mono text-[11px] text-[var(--text-muted)]">{value}</span>
    </label>
  );
}
