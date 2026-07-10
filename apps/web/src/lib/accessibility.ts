"use client";

// ─── Accessibility engine ─────────────────────────────────────────────────────
// Applies the Settings → Accessibility preferences to the document. The prefs
// live in the same localStorage blob the settings modal writes
// ("plancraft-user-prefs"); before this module existed, those toggles saved
// state that nothing read.
//
// Mechanics:
// - Each boolean pref toggles an `a11y-*` class on <html>; the actual behavior
//   lives in globals.css so it applies app-wide with zero per-component work.
// - Text size (and compact mode) drive the ROOT font-size — Tailwind's rem-based
//   text/padding classes all scale with it, which is exactly the "denser layout /
//   bigger text" effect wanted, without touching board content that uses px.
// - High contrast overrides the theme CSS variables with !important so it wins
//   over the inline theme vars the store applies.

const PREF_KEY = "plancraft-user-prefs";

export interface AccessibilityPrefs {
  reduceMotion: boolean;
  compactMode: boolean;
  fontSize: "sm" | "md" | "lg";
  highContrast: boolean;
  underlineLinks: boolean;
  alwaysShowFocus: boolean;
  reduceTransparency: boolean;
  /** UI color saturation, 20–100 (%) — lower = calmer, gray-leaning interface */
  saturation: number;
}

export function a11yDefaults(): AccessibilityPrefs {
  return {
    // Honor the OS setting until the user explicitly chooses
    reduceMotion:
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    compactMode: false,
    fontSize: "md",
    highContrast: false,
    underlineLinks: false,
    alwaysShowFocus: false,
    reduceTransparency: false,
    saturation: 100,
  };
}

const FONT_PX: Record<AccessibilityPrefs["fontSize"], number> = { sm: 15, md: 16, lg: 17.5 };

export function applyAccessibility(prefs: Partial<AccessibilityPrefs>): void {
  if (typeof document === "undefined") return;
  const p = { ...a11yDefaults(), ...prefs };
  const root = document.documentElement;

  root.classList.toggle("a11y-reduce-motion", p.reduceMotion);
  root.classList.toggle("a11y-compact", p.compactMode);
  root.classList.toggle("a11y-high-contrast", p.highContrast);
  root.classList.toggle("a11y-underline-links", p.underlineLinks);
  root.classList.toggle("a11y-focus-always", p.alwaysShowFocus);
  root.classList.toggle("a11y-reduce-transparency", p.reduceTransparency);

  const base = FONT_PX[p.fontSize] ?? 16;
  root.style.fontSize = `${(base * (p.compactMode ? 0.92 : 1)).toFixed(2)}px`;

  const sat = Math.max(20, Math.min(100, p.saturation ?? 100));
  root.classList.toggle("a11y-desaturate", sat < 100);
  root.style.setProperty("--a11y-saturation", `${sat}%`);
}

/** Read stored prefs and apply them — call once at boot (any page). */
export function initAccessibility(): void {
  if (typeof window === "undefined") return;
  try {
    applyAccessibility(JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"));
  } catch {
    applyAccessibility({});
  }
}
