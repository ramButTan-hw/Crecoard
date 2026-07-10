"use client";

// ─── User preferences (Settings modal) ────────────────────────────────────────
// Single source of truth for the prefs blob so ENFORCEMENT points (notification
// gating, presence privacy, DM checks) read the same shape the settings UI
// writes — previously the modal saved these and nothing read them.

export const PREF_KEY = "plancraft-user-prefs";

export interface UserPrefs {
  // Notifications
  notifyMentions: boolean;
  notifyDMs: boolean;
  notifySounds: boolean;
  notifyDesktop: boolean;
  notifyBadge: boolean;
  notifyLevel: "all" | "mentions" | "none";
  // Privacy
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  allowDMsFrom: "everyone" | "friends" | "none";
  allowFriendRequests: boolean;
  // Accessibility (applied app-wide by lib/accessibility.ts)
  reduceMotion: boolean;
  compactMode: boolean;
  fontSize: "sm" | "md" | "lg";
  highContrast: boolean;
  underlineLinks: boolean;
  alwaysShowFocus: boolean;
  reduceTransparency: boolean;
  saturation: number; // 20–100 (%)
}

export const DEFAULT_PREFS: UserPrefs = {
  notifyMentions: true,
  notifyDMs: true,
  notifySounds: true,
  notifyDesktop: false,
  notifyBadge: true,
  notifyLevel: "mentions",
  showOnlineStatus: true,
  showReadReceipts: true,
  allowDMsFrom: "everyone",
  allowFriendRequests: true,
  reduceMotion: false,
  compactMode: false,
  fontSize: "md",
  highContrast: false,
  underlineLinks: false,
  alwaysShowFocus: false,
  reduceTransparency: false,
  saturation: 100,
};

export function readUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") as Partial<UserPrefs>;
    // Honor the OS reduced-motion setting until the user explicitly chooses
    if (!("reduceMotion" in stored) && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      stored.reduceMotion = true;
    }
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeUserPrefs(p: UserPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
  // Same-tab reactivity (the `storage` event only fires in OTHER tabs)
  window.dispatchEvent(new CustomEvent("crecoard:prefs-changed"));
}
