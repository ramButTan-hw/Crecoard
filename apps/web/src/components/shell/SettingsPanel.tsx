"use client";

import { useRef, useState } from "react";
import { X, Check, Plus, Trash2 } from "lucide-react";
import { useBoardStore } from "@/store/boardStore";
import { PRESET_THEMES, APP_FONTS, BG_FILTERS, ThemeVarMap } from "@/lib/appThemes";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

interface SettingsPanelProps {
  onClose: () => void;
}

type Tab = "theme" | "font" | "background";

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

const FONT_GROUPS = [
  {
    label: "Modern Sans-Serif",
    fonts: ["Inter","Geist","DM Sans","Outfit","Space Grotesk","Manrope","Plus Jakarta Sans","Syne","Unbounded","Urbanist","Lexend","Figtree"],
  },
  {
    label: "Humanist Sans-Serif",
    fonts: ["Poppins","Nunito","Montserrat","Raleway","Roboto","Open Sans","Lato","Mulish","Josefin Sans","Quicksand","Karla","Barlow","Exo 2"],
  },
  {
    label: "Serif",
    fonts: ["Playfair Display","Merriweather","Lora","PT Serif","Libre Baskerville","Cormorant Garamond","EB Garamond"],
  },
  {
    label: "Monospace",
    fonts: ["Source Code Pro","Fira Code","JetBrains Mono","Space Mono","Inconsolata"],
  },
  {
    label: "Display",
    fonts: ["Bebas Neue","Oswald","Anton","Righteous","Orbitron"],
  },
].map((g) => ({
  ...g,
  fonts: g.fonts.map((name) => APP_FONTS.find((f) => f.name === name)!).filter(Boolean),
}));

const BG_SIZES = [
  { id: "cover",   label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "auto",    label: "Original" },
] as const;

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("theme");
  const [saveNameInput, setSaveNameInput] = useState("");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const {
    themeVars, savedThemes, appFont, appBg,
    setThemeVars, saveCurrentTheme, deleteSavedTheme, setAppFont, setAppBg,
  } = useBoardStore();

  const handlePresetClick = (vars: ThemeVarMap) => {
    setThemeVars(vars);
    if (appBg.image) {
      setAppBg({ overlayColor: vars.surface, overlayOpacity: appBg.overlayOpacity > 0 ? appBg.overlayOpacity : 0.45 });
    }
  };

  const handleBgFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAppBg({ image: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
    {isMobile && <div className="fixed inset-0 z-[998] bg-black/50" onClick={onClose} />}
    <div
      className={cn(
        "z-[999] border border-[var(--border)] shadow-2xl overflow-hidden",
        isMobile
          ? "fixed inset-x-0 bottom-0 w-full max-h-[85dvh] rounded-t-2xl pb-safe"
          : "fixed w-[340px] rounded-xl"
      )}
      style={isMobile ? { background: "var(--surface-raised)" } : { background: "var(--surface-raised)", bottom: 12, left: 72 }}
    >
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="flex gap-0.5 rounded-lg bg-[var(--surface-overlay)] p-0.5">
          {(["theme", "font", "background"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>

      <div className="max-h-[min(560px,80vh)] overflow-y-auto p-3 flex flex-col gap-4">

        {/* ── THEME TAB ─────────────────────────────────────────────── */}
        {tab === "theme" && (
          <>
            <div>
              <SectionLabel>Presets</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_THEMES.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset.vars)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-white/20 flex-shrink-0"
                      style={{ backgroundColor: preset.vars.accent }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                App theme is the default. Boards can override it with their own theme.
              </p>
            </div>

            <div>
              <SectionLabel>Colors</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {COLOR_KEYS.map(({ key, label }) => (
                  <ColorPickerRow
                    key={key}
                    label={label}
                    value={themeVars[key]}
                    onChange={(v) => setThemeVars({ ...themeVars, [key]: v })}
                  />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Save as Preset</SectionLabel>
              <div className="flex gap-1.5">
                <input
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveNameInput.trim()) {
                      saveCurrentTheme(saveNameInput.trim(), themeVars);
                      setSaveNameInput("");
                    }
                  }}
                  placeholder="Theme name…"
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => {
                    if (saveNameInput.trim()) {
                      saveCurrentTheme(saveNameInput.trim(), themeVars);
                      setSaveNameInput("");
                    }
                  }}
                  disabled={!saveNameInput.trim()}
                  className="flex items-center gap-1 rounded border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={12} /> Save
                </button>
              </div>
            </div>

            {savedThemes.length > 0 && (
              <div>
                <SectionLabel>Saved Themes</SectionLabel>
                <div className="flex flex-col gap-1">
                  {savedThemes.map((saved) => (
                    <div key={saved.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                      <span className="h-3 w-3 rounded-full border border-white/20 flex-shrink-0" style={{ backgroundColor: saved.vars.accent }} />
                      <span className="flex-1 text-xs text-[var(--text-primary)] truncate">{saved.name}</span>
                      <button onClick={() => handlePresetClick(saved.vars)} className="text-[11px] font-medium text-[var(--accent)] hover:underline transition-colors">Apply</button>
                      <button onClick={() => deleteSavedTheme(saved.id)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── FONT TAB ──────────────────────────────────────────────── */}
        {tab === "font" && (
          <>
            {FONT_GROUPS.map((group) => (
              <div key={group.label}>
                <SectionLabel>{group.label}</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.fonts.map((font) => (
                    <button
                      key={font.name}
                      onClick={() => setAppFont(font.name)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition-all truncate",
                        appFont === font.name
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                          : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      )}
                      style={{ fontFamily: `"${font.name}", system-ui, sans-serif` }}
                    >
                      {appFont === font.name && <Check size={10} className="text-[var(--accent)] flex-shrink-0" />}
                      <span className="truncate">{font.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── BACKGROUND TAB ────────────────────────────────────────── */}
        {tab === "background" && (
          <>
            <div>
              <SectionLabel>Image</SectionLabel>
              <input
                className="mb-1.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                placeholder="https://… paste an image URL"
                value={appBg.image?.startsWith("data:") ? "" : (appBg.image ?? "")}
                onChange={(e) => setAppBg({ image: e.target.value || undefined })}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => bgFileRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-dashed border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  Upload file
                </button>
                {appBg.image && (
                  <button
                    onClick={() => setAppBg({ image: undefined })}
                    className="rounded border border-[var(--border)] px-2.5 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgFileUpload} />
            </div>

            {appBg.image && (
              <div className="relative h-24 w-full overflow-hidden rounded-lg border border-[var(--border)]">
                <img
                  src={appBg.image}
                  alt="App background preview"
                  className="h-full w-full"
                  style={{
                    objectFit: appBg.size === "cover" ? "cover" : appBg.size === "contain" ? "contain" : "none",
                    opacity: appBg.opacity,
                    filter: appBg.filter || undefined,
                  }}
                />
                {appBg.overlayOpacity > 0 && (
                  <div className="absolute inset-0" style={{ backgroundColor: appBg.overlayColor, opacity: appBg.overlayOpacity }} />
                )}
              </div>
            )}

            {appBg.image && (
              <>
                <div>
                  <SectionLabel>Resize</SectionLabel>
                  <div className="flex gap-1.5">
                    {BG_SIZES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setAppBg({ size: s.id })}
                        className={cn(
                          "flex-1 rounded border py-1.5 text-xs transition-colors",
                          appBg.size === s.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <SectionLabel className="mb-0">Opacity</SectionLabel>
                    <span className="text-xs text-[var(--text-muted)]">{Math.round(appBg.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={appBg.opacity}
                    onChange={(e) => setAppBg({ opacity: parseFloat(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                <div>
                  <SectionLabel>Filter</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {BG_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setAppBg({ filter: f.value })}
                        className={cn(
                          "rounded border px-2.5 py-1 text-xs transition-colors",
                          appBg.filter === f.value
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
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--text-muted)] transition-colors">
                    <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 overflow-hidden" style={{ backgroundColor: appBg.overlayColor }}>
                      <input
                        type="color"
                        value={appBg.overlayColor}
                        onChange={(e) => setAppBg({ overlayColor: e.target.value })}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </span>
                    <span className="flex-1 text-xs text-[var(--text-secondary)]">Tint color</span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">{appBg.overlayColor}</span>
                  </label>
                  <div className="mt-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] text-[var(--text-muted)]">Intensity</span>
                      <span className="text-xs text-[var(--text-muted)]">{Math.round(appBg.overlayOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={appBg.overlayOpacity}
                      onChange={(e) => setAppBg({ overlayOpacity: parseFloat(e.target.value) })}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]", className)}>
      {children}
    </p>
  );
}

function ColorPickerRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5 hover:border-[var(--text-muted)] transition-colors">
      <span className="relative h-5 w-5 flex-shrink-0 rounded border border-white/15 shadow-sm overflow-hidden" style={{ backgroundColor: value }}>
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
