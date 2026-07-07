// ─── Theme variable map ───────────────────────────────────────────────────────

export interface ThemeVarMap {
  surface: string;
  surfaceRaised: string;
  surfaceOverlay: string;
  sidebar: string;
  accent: string;
  accentHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gridColor: string;
  gridAccentColor: string;
}

export interface SavedTheme {
  id: string;
  name: string;
  vars: ThemeVarMap;
}

export interface AppBgConfig {
  image?: string;
  opacity: number;
  filter: string;
  size: "cover" | "contain" | "auto";
  overlayColor: string;
  overlayOpacity: number;
}

export const DEFAULT_APP_BG: AppBgConfig = {
  opacity: 1,
  filter: "",
  size: "cover",
  overlayColor: "#000000",
  overlayOpacity: 0,
};

// Maps JS key → CSS variable name
export const CSS_VAR_NAMES: Record<keyof ThemeVarMap, string> = {
  surface:        "--surface",
  surfaceRaised:  "--surface-raised",
  surfaceOverlay: "--surface-overlay",
  sidebar:        "--sidebar",
  accent:         "--accent",
  accentHover:    "--accent-hover",
  border:         "--border",
  textPrimary:    "--text-primary",
  textSecondary:  "--text-secondary",
  textMuted:      "--text-muted",
  gridColor:      "--grid-color",
  gridAccentColor:"--grid-accent-color",
};

export function applyThemeVars(vars: ThemeVarMap) {
  if (typeof window === "undefined") return;
  const el = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_NAMES)) {
    const value = vars[key as keyof ThemeVarMap];
    if (value !== undefined) el.style.setProperty(cssVar, value);
  }
}

// ─── Preset themes ────────────────────────────────────────────────────────────

export const PRESET_THEMES: SavedTheme[] = [
  {
    id: "dark", name: "Dark",
    vars: { surface: "#1a1b1e", surfaceRaised: "#25262b", surfaceOverlay: "#2c2d33", sidebar: "#141517", accent: "#d59ee8", accentHover: "#c47fd6", border: "#373a40", textPrimary: "#f2f2f2", textSecondary: "#a6a7ab", textMuted: "#6d6f75", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "light", name: "Light",
    vars: { surface: "#f8f9fa", surfaceRaised: "#ffffff", surfaceOverlay: "#f1f3f5", sidebar: "#e9ecef", accent: "#d59ee8", accentHover: "#c47fd6", border: "#dee2e6", textPrimary: "#1a1b1e", textSecondary: "#495057", textMuted: "#868e96", gridColor: "rgba(0, 0, 0, 0.08)", gridAccentColor: "rgba(0, 0, 0, 0.18)" },
  },
  {
    id: "oled", name: "OLED",
    vars: { surface: "#000000", surfaceRaised: "#0a0a0a", surfaceOverlay: "#111111", sidebar: "#000000", accent: "#d59ee8", accentHover: "#c47fd6", border: "#222222", textPrimary: "#ffffff", textSecondary: "#aaaaaa", textMuted: "#555555", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "midnight", name: "Midnight",
    vars: { surface: "#0d1117", surfaceRaised: "#161b22", surfaceOverlay: "#1f2937", sidebar: "#090d13", accent: "#58a6ff", accentHover: "#388bfd", border: "#30363d", textPrimary: "#e6edf3", textSecondary: "#8b949e", textMuted: "#484f58", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "forest", name: "Forest",
    vars: { surface: "#0d1f0d", surfaceRaised: "#132513", surfaceOverlay: "#1a301a", sidebar: "#091409", accent: "#3fb950", accentHover: "#2ea043", border: "#238636", textPrimary: "#e6f0e6", textSecondary: "#7ee787", textMuted: "#3d6b42", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "sunset", name: "Sunset",
    vars: { surface: "#1a1020", surfaceRaised: "#241630", surfaceOverlay: "#2e1d3d", sidebar: "#120b18", accent: "#e86af0", accentHover: "#c44dcc", border: "#3d2550", textPrimary: "#f0e6f0", textSecondary: "#c090c8", textMuted: "#7a4d88", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "ocean", name: "Ocean",
    vars: { surface: "#0a1628", surfaceRaised: "#0f2040", surfaceOverlay: "#142b55", sidebar: "#071020", accent: "#06b6d4", accentHover: "#0891b2", border: "#1e3a5f", textPrimary: "#e0f2fe", textSecondary: "#7dd3fc", textMuted: "#3b82f6", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
  {
    id: "rose", name: "Rose",
    vars: { surface: "#1c0d12", surfaceRaised: "#2a1018", surfaceOverlay: "#381522", sidebar: "#130809", accent: "#f43f5e", accentHover: "#e11d48", border: "#4c1d30", textPrimary: "#fce7eb", textSecondary: "#fda4af", textMuted: "#9f1239", gridColor: "rgba(255, 255, 255, 0.08)", gridAccentColor: "rgba(255, 255, 255, 0.18)" },
  },
];

export const DEFAULT_THEME_VARS = PRESET_THEMES[0]!.vars;

// ─── App fonts ────────────────────────────────────────────────────────────────

export interface AppFont {
  name: string;
  googleKey: string;
}

export const APP_FONTS: AppFont[] = [
  // Sans-serif — modern
  { name: "Inter",             googleKey: "Inter:wght@300;400;500;600;700" },
  { name: "Geist",             googleKey: "Geist:wght@300;400;500;600;700" },
  { name: "DM Sans",           googleKey: "DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700" },
  { name: "Outfit",            googleKey: "Outfit:wght@300;400;500;600;700" },
  { name: "Space Grotesk",     googleKey: "Space+Grotesk:wght@300;400;500;600;700" },
  { name: "Manrope",           googleKey: "Manrope:wght@300;400;500;600;700" },
  { name: "Plus Jakarta Sans", googleKey: "Plus+Jakarta+Sans:wght@300;400;500;600;700" },
  { name: "Syne",              googleKey: "Syne:wght@400;500;600;700;800" },
  { name: "Unbounded",         googleKey: "Unbounded:wght@300;400;500;600;700" },
  { name: "Urbanist",          googleKey: "Urbanist:wght@300;400;500;600;700" },
  { name: "Lexend",            googleKey: "Lexend:wght@300;400;500;600;700" },
  { name: "Figtree",           googleKey: "Figtree:wght@300;400;500;600;700" },
  // Sans-serif — humanist
  { name: "Poppins",           googleKey: "Poppins:wght@300;400;500;600;700" },
  { name: "Nunito",            googleKey: "Nunito:wght@300;400;500;600;700" },
  { name: "Montserrat",        googleKey: "Montserrat:wght@300;400;500;600;700" },
  { name: "Raleway",           googleKey: "Raleway:wght@300;400;500;600;700" },
  { name: "Roboto",            googleKey: "Roboto:wght@300;400;500;700" },
  { name: "Open Sans",         googleKey: "Open+Sans:wght@300;400;500;600;700" },
  { name: "Lato",              googleKey: "Lato:wght@300;400;700" },
  { name: "Mulish",            googleKey: "Mulish:wght@300;400;500;600;700" },
  { name: "Josefin Sans",      googleKey: "Josefin+Sans:wght@300;400;500;600;700" },
  { name: "Quicksand",         googleKey: "Quicksand:wght@300;400;500;600;700" },
  { name: "Karla",             googleKey: "Karla:wght@300;400;500;600;700" },
  { name: "Barlow",            googleKey: "Barlow:wght@300;400;500;600;700" },
  { name: "Exo 2",             googleKey: "Exo+2:wght@300;400;500;600;700" },
  // Serif
  { name: "Playfair Display",  googleKey: "Playfair+Display:wght@400;500;600;700" },
  { name: "Merriweather",      googleKey: "Merriweather:wght@300;400;700" },
  { name: "Lora",              googleKey: "Lora:wght@400;500;600;700" },
  { name: "PT Serif",          googleKey: "PT+Serif:wght@400;700" },
  { name: "Libre Baskerville", googleKey: "Libre+Baskerville:wght@400;700" },
  { name: "Cormorant Garamond",googleKey: "Cormorant+Garamond:wght@300;400;500;600;700" },
  { name: "EB Garamond",       googleKey: "EB+Garamond:wght@400;500;600;700" },
  // Monospace
  { name: "Source Code Pro",   googleKey: "Source+Code+Pro:wght@300;400;500;600;700" },
  { name: "Fira Code",         googleKey: "Fira+Code:wght@300;400;500;600;700" },
  { name: "JetBrains Mono",    googleKey: "JetBrains+Mono:wght@300;400;500;600;700" },
  { name: "Space Mono",        googleKey: "Space+Mono:wght@400;700" },
  { name: "Inconsolata",       googleKey: "Inconsolata:wght@300;400;500;600;700" },
  // Display / decorative
  { name: "Bebas Neue",        googleKey: "Bebas+Neue" },
  { name: "Oswald",            googleKey: "Oswald:wght@300;400;500;600;700" },
  { name: "Anton",             googleKey: "Anton" },
  { name: "Righteous",         googleKey: "Righteous" },
  { name: "Orbitron",          googleKey: "Orbitron:wght@400;500;600;700;800;900" },
];

const loadedFonts = new Set<string>();

export function loadAppFont(name: string) {
  if (typeof window === "undefined" || name === "Inter" || loadedFonts.has(name)) return;
  const font = APP_FONTS.find((f) => f.name === name);
  if (!font) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleKey}&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(name);
}

export function applyAppFont(name: string) {
  if (typeof window === "undefined") return;
  loadAppFont(name);
  document.documentElement.style.setProperty("--app-font", `"${name}", system-ui, sans-serif`);
}

// ─── Background filters ───────────────────────────────────────────────────────

export interface BgFilter {
  id: string;
  label: string;
  value: string;
}

export const BG_FILTERS: BgFilter[] = [
  { id: "none",      label: "None",      value: "" },
  { id: "blur",      label: "Blur",      value: "blur(10px)" },
  { id: "dark",      label: "Dark",      value: "brightness(0.35)" },
  { id: "dimmed",    label: "Dimmed",    value: "brightness(0.6)" },
  { id: "bw",        label: "B&W",       value: "grayscale(1)" },
  { id: "sepia",     label: "Sepia",     value: "sepia(0.85)" },
  { id: "vintage",   label: "Vintage",   value: "sepia(0.5) contrast(1.15) brightness(0.8)" },
  { id: "vivid",     label: "Vivid",     value: "saturate(1.9) brightness(0.85)" },
  { id: "cool",      label: "Cool",      value: "hue-rotate(180deg) saturate(0.7) brightness(0.8)" },
  { id: "blurdark",  label: "Blur+Dark", value: "blur(12px) brightness(0.4)" },
];
